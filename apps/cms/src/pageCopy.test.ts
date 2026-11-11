import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerFromCopy,
  COPY_KEY_HEADER,
  COPY_READ_TIMEOUT_MS,
  COPY_SERVED_CACHE_CONTROL,
  copyKey,
  copyOn,
  keepCopy,
  raceCopy,
  readCopy,
  writeCopy,
} from '../pageCopy.mjs'
import { KEPT_CACHE_CONTROL, STALE_SECONDS, VERSION_CACHE_SECONDS } from '../pageCache.mjs'

const BUILD = 'site-0123456789abcdef0123.0123456789ab'

/** A fake R2 bucket: a Map, plus switches to make it fail or stall the way R2 can. */
function fakeBucket({ throwOnGet = false, throwOnPut = false, getDelayMs = 0 } = {}) {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string) {
      if (throwOnGet) throw new Error('R2 down')
      if (getDelayMs) await new Promise((resolve) => setTimeout(resolve, getDelayMs))
      const value = store.get(key)
      return value === undefined ? null : { text: async () => value }
    },
    async put(key: string, value: string) {
      if (throwOnPut) throw new Error('R2 down')
      store.set(key, value)
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('copyKey', () => {
  it('names the host, the build, the content version and the path, never the query', () => {
    expect(copyKey('https://wear-run.com/guides?utm_source=x', BUILD, '42')).toBe(
      `pages/wear-run.com/${BUILD}/42/guides`,
    )
  })

  it('names a missing content version "none", as the page store does', () => {
    expect(copyKey('https://wear-run.com/faq/quality', BUILD, null)).toBe(
      `pages/wear-run.com/${BUILD}/none/faq/quality`,
    )
  })

  it('gives the home page a name of its own', () => {
    expect(copyKey('https://wear-run.com/', BUILD, '7')).toBe(`pages/wear-run.com/${BUILD}/7/index`)
  })

  it('keeps a new build and a new save apart from the old copy', () => {
    const before = copyKey('https://wear-run.com/about', BUILD, '41')
    expect(copyKey('https://wear-run.com/about', BUILD, '42')).not.toBe(before)
    expect(copyKey('https://wear-run.com/about', `${BUILD.slice(0, -1)}c`, '41')).not.toBe(before)
  })
})

describe('copyOn', () => {
  it('is on when the bucket is bound and the switch is not "off"', () => {
    expect(copyOn({ PAGE_COPIES: fakeBucket(), PAGE_COPY: 'on' })).toBe(true)
    expect(copyOn({ PAGE_COPIES: fakeBucket() })).toBe(true)
  })

  it('is off with the switch at "off", or with no bucket', () => {
    expect(copyOn({ PAGE_COPIES: fakeBucket(), PAGE_COPY: 'off' })).toBe(false)
    expect(copyOn({ PAGE_COPY: 'on' })).toBe(false)
    expect(copyOn(undefined)).toBe(false)
  })
})

describe('writeCopy and readCopy', () => {
  it('reads back the text and the headers it wrote, without a cookie', async () => {
    const bucket = fakeBucket()
    const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'a=1' })
    expect(await writeCopy(bucket, 'k', headers, '<html></html>')).toBe(true)
    const copy = await readCopy(bucket, 'k')
    expect(copy?.text).toBe('<html></html>')
    expect(copy?.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(copy?.headers.has('set-cookie')).toBe(false)
  })

  it('finds nothing where nothing was written', async () => {
    expect(await readCopy(fakeBucket(), 'missing')).toBeNull()
  })

  it('never throws: a failing bucket reads as no copy and writes as false', async () => {
    expect(await readCopy(fakeBucket({ throwOnGet: true }), 'k')).toBeNull()
    expect(await writeCopy(fakeBucket({ throwOnPut: true }), 'k', new Headers(), 'x')).toBe(false)
  })

  it('reads a damaged copy as no copy', async () => {
    const bucket = fakeBucket()
    bucket.store.set('k', '{not json')
    expect(await readCopy(bucket, 'k')).toBeNull()
  })

  it('gives up on a slow bucket after the read timeout, so the page is drawn instead', async () => {
    vi.useFakeTimers()
    const bucket = fakeBucket({ getDelayMs: COPY_READ_TIMEOUT_MS + 100 })
    bucket.store.set('k', JSON.stringify({ v: 1, headers: [], text: 'late' }))
    const read = readCopy(bucket, 'k')
    await vi.advanceTimersByTimeAsync(COPY_READ_TIMEOUT_MS + 1)
    expect(await read).toBeNull()
  })

  it('reads within 400 ms, the plan’s ceiling', () => {
    expect(COPY_READ_TIMEOUT_MS).toBe(400)
  })
})

/*
 * Task 2 (shared page copy plan, 10 Nov 2026): SitePages asks the copy before drawing a whole page,
 * and keeps one after a whole drawing. worker.mjs cannot be loaded here (cloudflare:workers and the
 * built site), so the decisions live in pageCopy.mjs and worker.mjs only calls them.
 */
describe('answerFromCopy and keepCopy, as SitePages uses them', () => {
  const KEY = `pages/wear-run.com/${BUILD}/7/guides`
  const asked = (path: string, extra: Record<string, string> = {}) =>
    new Request(`https://wear-run.com${path}`, { headers: { [COPY_KEY_HEADER]: KEY, ...extra } })
  const withCopy = () => {
    const bucket = fakeBucket()
    bucket.store.set(
      KEY,
      JSON.stringify({ v: 1, headers: [['content-type', 'text/html']], text: '<html>g</html>' }),
    )
    return bucket
  }

  /*
   * A save writes KV `content-version` and then marks kept copies stale, but a region can read the
   * old version for up to ~120 s (KV spreads in about 60 s, plus KV's 30 s cache, plus the 30 s
   * memo). A copy served in that window must not be kept for a day; three minutes covers it.
   */
  it('answers from the copy, kept for three minutes only, tagged so a save still reaches it', async () => {
    const answer = await answerFromCopy(asked('/guides'), { PAGE_COPIES: withCopy() })
    expect(answer?.status).toBe(200)
    expect(await answer?.text()).toBe('<html>g</html>')
    expect(answer?.headers.get('cache-control')).toBe(COPY_SERVED_CACHE_CONTROL)
    expect(COPY_SERVED_CACHE_CONTROL).toBe(
      `public, max-age=180, stale-while-revalidate=${STALE_SECONDS}`,
    )
    // Longer than the worst case for a save to reach every region (60 + 30 + 30 s).
    expect(180).toBeGreaterThan(60 + VERSION_CACHE_SECONDS + VERSION_CACHE_SECONDS)
    expect(answer?.headers.get('cache-tag')).toBe('site-pages')
    expect(answer?.headers.get('x-run-kept')).toBe('yes')
  })

  /*
   * Live 11 Nov 2026 (home page, 08:50–11:58 UTC): with `max-age=180` alone, a data centre that went
   * more than 180 s without a request lost its copy and fetched it again from further away: hits
   * after such a gap took a median of 99 ms (65 of 74 over 50 ms), against 6 ms (0 of 77) the day
   * before, when pages were kept a day. Workers Cache serves an expired copy at once and refreshes it
   * behind the scenes only when the rule says `stale-while-revalidate`, and ignores that directive if
   * `s-maxage`, `must-revalidate` or `proxy-revalidate` is also present (Cloudflare, Workers Cache
   * "Debugging", read 11 Nov 2026).
   */
  it('lets a region keep answering at once after three minutes, while the copy is refreshed', () => {
    const directives = new Map(
      COPY_SERVED_CACHE_CONTROL.split(',').map((part) => {
        const [name = '', value] = part.trim().split('=')
        return [name.toLowerCase(), value] as const
      }),
    )
    expect(directives.get('max-age')).toBe('180')
    expect(directives.get('stale-while-revalidate')).toBe(String(STALE_SECONDS))
    for (const blocker of ['s-maxage', 'must-revalidate', 'proxy-revalidate', 'no-cache']) {
      expect(directives.has(blocker)).toBe(false)
    }
    // Copies and pages drawn in full now age the same way: only the freshness window differs.
    expect(KEPT_CACHE_CONTROL).toContain(`stale-while-revalidate=${STALE_SECONDS}`)
  })

  it('finds no answer, so SitePages draws: no copy, no name, a tap, a kept file, switched off, R2 down', async () => {
    expect(await answerFromCopy(asked('/guides'), { PAGE_COPIES: fakeBucket() })).toBeNull()
    const unnamed = new Request('https://wear-run.com/guides')
    expect(await answerFromCopy(unnamed, { PAGE_COPIES: withCopy() })).toBeNull()
    expect(
      await answerFromCopy(asked('/guides', { rsc: '1' }), { PAGE_COPIES: withCopy() }),
    ).toBeNull()
    expect(await answerFromCopy(asked('/robots.txt'), { PAGE_COPIES: withCopy() })).toBeNull()
    expect(
      await answerFromCopy(asked('/guides'), { PAGE_COPIES: withCopy(), PAGE_COPY: 'off' }),
    ).toBeNull()
    expect(
      await answerFromCopy(asked('/guides'), { PAGE_COPIES: fakeBucket({ throwOnGet: true }) }),
    ).toBeNull()
  })

  it('keeps a copy of a whole page in waitUntil, under the name the request carries', async () => {
    const bucket = fakeBucket()
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) }
    const env = { PAGE_COPIES: bucket }
    expect(keepCopy(asked('/guides'), env, ctx, new Headers(), '<html>x</html>')).toBe(true)
    await Promise.all(waits)
    expect(JSON.parse(bucket.store.get(KEY) ?? '{}').text).toBe('<html>x</html>')
  })

  it('never keeps a tap, a kept file, an unnamed request, or anything while switched off', () => {
    const ctx = { waitUntil: () => {} }
    const env = { PAGE_COPIES: fakeBucket() }
    const off = { ...env, PAGE_COPY: 'off' }
    const unnamed = new Request('https://wear-run.com/guides')
    expect(keepCopy(asked('/guides', { rsc: '1' }), env, ctx, new Headers(), 'x')).toBe(false)
    expect(keepCopy(asked('/llms.txt'), env, ctx, new Headers(), 'x')).toBe(false)
    expect(keepCopy(unnamed, env, ctx, new Headers(), 'x')).toBe(false)
    expect(keepCopy(asked('/guides'), off, ctx, new Headers(), 'x')).toBe(false)
  })
})

/** A promise that settles after `ms`, with `value` (or the error, when `fail`). */
function later<T>(ms: number, value: T, fail = false): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => (fail ? reject(new Error('draw failed')) : resolve(value)), ms),
  )
}

/** A drawn page whose body records whether it was cancelled. */
function drawnPage() {
  const seen = { cancelled: false }
  const body = new ReadableStream({
    cancel() {
      seen.cancelled = true
    },
  })
  return { seen, response: new Response(body, { status: 200 }) }
}

/*
 * Measured 11 Nov 2026, the first ~25 minutes after #370 went live: an R2 copy read took
 * p50 344 ms when found (n=15) and ran into the 400 ms limit on 92 of 93 misses. Asked BEFORE
 * drawing, every miss waited that long first. raceCopy runs both at once.
 */
describe('raceCopy', () => {
  const copyPage = () => new Response('<html>copy</html>', { status: 200 })

  it('answers from the copy when it comes before the drawing, and drains the drawing', async () => {
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) }
    const drawn = drawnPage()
    const answer = await raceCopy(later(5, copyPage()), later(40, drawn.response), ctx)
    expect(await answer?.text()).toBe('<html>copy</html>')
    await Promise.all(waits)
    expect(drawn.seen.cancelled).toBe(true)
  })

  it('a miss does not wait for anything: null as soon as the copy says no', async () => {
    const ctx = { waitUntil: () => {} }
    const started = Date.now()
    const answer = await raceCopy(later(5, null), later(300, drawnPage().response), ctx)
    expect(answer).toBeNull()
    expect(Date.now() - started).toBeLessThan(150)
  })

  it('a drawing that finishes first wins without waiting for a slow copy read', async () => {
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) }
    const started = Date.now()
    const answer = await raceCopy(later(300, copyPage()), later(5, drawnPage().response), ctx)
    expect(answer).toBeNull()
    expect(Date.now() - started).toBeLessThan(150)
    // The copy read still running is handed to waitUntil, never left floating.
    expect(waits.length).toBe(1)
  })

  it('a drawing that fails still lets a copy answer', async () => {
    const ctx = { waitUntil: () => {} }
    const failed = later<Response>(1, drawnPage().response, true)
    failed.catch(() => {})
    const answer = await raceCopy(later(20, copyPage()), failed, ctx)
    expect(await answer?.text()).toBe('<html>copy</html>')
  })

  it('a copy read that throws reads as no copy', async () => {
    const ctx = { waitUntil: () => {} }
    const broken = Promise.reject(new Error('R2 down'))
    expect(await raceCopy(broken, later(5, drawnPage().response), ctx)).toBeNull()
  })
})

/*
 * worker.mjs imports cloudflare:workers and the built site, so it is read as text, the way
 * pageCache.test.ts and filmRange.test.ts check it.
 */
describe('worker.mjs and wrangler.jsonc wire the copy in', () => {
  const cms = join(import.meta.dirname, '..')
  const worker = readFileSync(join(cms, 'worker.mjs'), 'utf8')
  const sitePages = worker.slice(
    worker.indexOf('export class SitePages'),
    worker.indexOf('async invalidateKept'),
  )

  it('SitePages starts the drawing BEFORE it asks the copy, and races the two', () => {
    // 11 Nov 2026: asking first made every miss wait up to COPY_READ_TIMEOUT_MS before drawing.
    const draws = sitePages.indexOf('const drawing = keptRenders().run(render, () =>')
    const races = sitePages.indexOf(
      'await raceCopy(answerFromCopy(request, this.env), drawing, this.ctx)',
    )
    expect(draws).toBeGreaterThan(-1)
    expect(races).toBeGreaterThan(draws)
    expect(sitePages).not.toMatch(/await answerFromCopy\(/)
    expect(sitePages).toMatch(/if \(copied\) return copied\s+const response = await drawing/)
  })

  it('SitePages keeps a copy only of a whole page that is not a kept file', () => {
    expect(sitePages).toMatch(/if \(whole && !file\) keepCopy\(request, this\.env, this\.ctx,/)
  })

  it('the default entrypoint names the copy from what the store key read', () => {
    expect(worker).toMatch(/await keptStoreKeys\(/)
    expect(worker).toMatch(
      /clean\.headers\.set\(COPY_KEY_HEADER, copyKey\(clean\.url, named, contentVersion\)\)/,
    )
    expect(worker).toMatch(/store\.fetch\(clean, \{ cf, redirect: 'manual' \}\)/)
  })

  const wrangler = JSON.parse(
    readFileSync(join(cms, 'wrangler.jsonc'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ''),
  ) as { r2_buckets: { binding: string; bucket_name: string }[]; vars: Record<string, string> }

  it('binds the private copies bucket and leaves the switch on', () => {
    expect(wrangler.r2_buckets).toContainEqual({
      binding: 'PAGE_COPIES',
      bucket_name: 'run-apparel-page-copies',
    })
    expect(wrangler.vars.PAGE_COPY).toBe('on')
  })
})
