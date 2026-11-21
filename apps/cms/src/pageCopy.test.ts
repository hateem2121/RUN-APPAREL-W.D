import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerFromCopy,
  COPY_KEY_HEADER,
  COPY_READ_TIMEOUT_MS,
  COPY_SERVED_CACHE_CONTROL,
  copyBuckets,
  copyKey,
  copyOn,
  keepCopy,
  raceCopy,
  readCopy,
  readFirstCopy,
  writeCopy,
} from '../pageCopy.mjs'
import { KEPT_CACHE_CONTROL, STALE_SECONDS, VERSION_CACHE_SECONDS } from '../pageCache.mjs'
import { HEDGE_COPY_WAIT_MS } from '../storeHedge.mjs'

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
 * The hedge's longer wait (storeHedge.mjs HEDGE_COPY_WAIT_MS, 21 Nov 2026). What production did:
 * SitePages' read of the copy gave up at exactly 400 ms five times out of six from Frankfurt,
 * London and Sydney, and the visitor then waited 1.5 to 4.5 s for a drawing. In the hedge the copy
 * races the drawing, so it may wait: a copy that R2 hands over in 700 ms is still the faster answer.
 */
describe('the hedge waits longer for the copy than SitePages does', () => {
  const KEY = `pages/wear-run.com/${BUILD}/7/guides`
  const asked = new Request('https://wear-run.com/guides', { headers: { [COPY_KEY_HEADER]: KEY } })
  const slowBucket = () => {
    const bucket = fakeBucket({ getDelayMs: 700 })
    bucket.store.set(
      KEY,
      JSON.stringify({ v: 1, headers: [['content-type', 'text/html']], text: '<html>g</html>' }),
    )
    return bucket
  }

  it('a copy R2 hands over in 700 ms is served when the hedge asks', async () => {
    vi.useFakeTimers()
    const answer = answerFromCopy(asked, { PAGE_COPIES: slowBucket() }, HEDGE_COPY_WAIT_MS)
    await vi.advanceTimersByTimeAsync(701)
    expect(await (await answer)?.text()).toBe('<html>g</html>')
  })

  it('negative control: the same 700 ms read is "no copy" at SitePages’ 400 ms', async () => {
    vi.useFakeTimers()
    const answer = answerFromCopy(asked, { PAGE_COPIES: slowBucket() })
    await vi.advanceTimersByTimeAsync(COPY_READ_TIMEOUT_MS + 1)
    expect(await answer).toBeNull()
  })

  it('still gives up: a read slower than the hedge’s wait is "no copy" there too', async () => {
    vi.useFakeTimers()
    const bucket = fakeBucket({ getDelayMs: HEDGE_COPY_WAIT_MS + 500 })
    const answer = answerFromCopy(asked, { PAGE_COPIES: bucket }, HEDGE_COPY_WAIT_MS)
    await vi.advanceTimersByTimeAsync(HEDGE_COPY_WAIT_MS + 1)
    expect(await answer).toBeNull()
  })

  it('the door’s hedge and SitePages both wait the longer time: each one races a drawing', () => {
    // 21 Nov 2026: at 400 ms SitePages abandoned 80 of 84 reads in three minutes, with the copies
    // there, and drew each page instead (947 ms at the median, 2,826 ms at p90).
    expect(HEDGE_COPY_WAIT_MS).toBeGreaterThan(COPY_READ_TIMEOUT_MS)
    const cms = join(import.meta.dirname, '..')
    expect(readFileSync(join(cms, 'siteEdge.mjs'), 'utf8')).toContain(
      'askCopy: () => answerFromCopy(clean, env, HEDGE_COPY_WAIT_MS)',
    )
    const worker = readFileSync(join(cms, 'worker.mjs'), 'utf8')
    expect(worker).toContain('const copy = answerFromCopy(request, this.env, HEDGE_COPY_WAIT_MS)')
    // NEGATIVE CONTROL: the short wait is nowhere in SitePages any more.
    expect(worker).not.toContain('answerFromCopy(request, this.env)')
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
    const races = sitePages.indexOf('await raceCopy(copy, drawing, this.ctx)')
    expect(draws).toBeGreaterThan(-1)
    expect(races).toBeGreaterThan(draws)
    expect(sitePages).not.toMatch(/await answerFromCopy\(/)
    expect(sitePages).toMatch(/if \(copied\) return copied\s+const response = await drawing/)
  })

  it('SitePages keeps a copy only of a whole page that is not a kept file', () => {
    expect(sitePages).toMatch(/if \(whole && !file\) keepCopy\(request, this\.env, this\.ctx,/)
  })

  it('the default entrypoint names the copy from what the store key read', () => {
    // In siteEdge.mjs since 20 Nov 2026 (the steps the site Worker and the front door share).
    const edge = readFileSync(join(cms, 'siteEdge.mjs'), 'utf8')
    expect(edge).toMatch(/await keptStoreKeys\(/)
    expect(edge).toMatch(
      /clean\.headers\.set\(COPY_KEY_HEADER, copyKey\(clean\.url, named, contentVersion\)\)/,
    )
    expect(edge).toMatch(/store\.fetch\(clean, \{ cf, redirect: 'manual' \}\)/)
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

/*
 * Two buckets, the first answer wins (21 Nov 2026). The first bucket is in Asia-Pacific; a found
 * copy took a median 805 ms from the door that day and 988 ms from London. The second is in
 * Eastern North America. These hold the race to what makes it safe: a slow, empty or broken
 * bucket never keeps the other's answer back, and never invents one.
 */
describe('copies in two buckets', () => {
  const stored = JSON.stringify({
    v: 1,
    headers: [['content-type', 'text/html']],
    text: '<p>kept</p>',
  })
  const holding = (ms: number) => ({
    get: vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve({ text: async () => stored }), ms)),
    ),
    put: vi.fn(async () => undefined),
  })
  const empty = (ms: number) => ({
    get: vi.fn(() => new Promise((resolve) => setTimeout(() => resolve(null), ms))),
    put: vi.fn(async () => undefined),
  })
  const broken = () => ({
    get: vi.fn(async () => {
      throw new Error('R2 is down')
    }),
    put: vi.fn(async () => {
      throw new Error('R2 is down')
    }),
  })

  it('names both buckets, and only the ones that are bound', () => {
    const a = holding(0)
    const b = holding(0)
    expect(copyBuckets({ PAGE_COPIES: a, PAGE_COPIES_ENAM: b }).map((x) => x.name)).toEqual([
      'apac',
      'enam',
    ])
    expect(copyBuckets({ PAGE_COPIES: a }).map((x) => x.name)).toEqual(['apac'])
    // The third (Eastern Europe, 21 Nov 2026): the test for Pakistan and the Middle East.
    expect(
      copyBuckets({ PAGE_COPIES: a, PAGE_COPIES_ENAM: b, PAGE_COPIES_EEUR: holding(0) }).map(
        (x) => x.name,
      ),
    ).toEqual(['apac', 'enam', 'eeur'])
    expect(copyBuckets(undefined)).toEqual([])
  })

  it('the nearer bucket answers: the slow one is not waited for', async () => {
    const far = holding(300)
    const near = holding(5)
    const startedAt = Date.now()
    const copy = await readFirstCopy(
      copyBuckets({ PAGE_COPIES: far, PAGE_COPIES_ENAM: near }),
      'pages/k',
      1_000,
    )
    expect(copy?.from).toBe('enam')
    expect(copy?.text).toBe('<p>kept</p>')
    expect(Date.now() - startedAt).toBeLessThan(250)
  })

  it('with three buckets the nearest of the three answers, and a drawn page goes to all three', async () => {
    const env = {
      PAGE_COPIES: holding(300),
      PAGE_COPIES_ENAM: holding(300),
      PAGE_COPIES_EEUR: holding(5),
    }
    const copy = await readFirstCopy(copyBuckets(env), 'pages/k', 1_000)
    expect(copy?.from).toBe('eeur')
    const waits: Promise<unknown>[] = []
    keepCopy(
      new Request('https://wear-run.com/guides', { headers: { [COPY_KEY_HEADER]: 'pages/k' } }),
      env,
      { waitUntil: (p: Promise<unknown>) => void waits.push(p) },
      { 'content-type': 'text/html' },
      '<p>page</p>',
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await Promise.all(waits)
      for (const bucket of Object.values(env)) expect(bucket.put).toHaveBeenCalledTimes(1)
    } finally {
      log.mockRestore()
    }
  })

  it('a bucket that is empty or down never keeps the other’s copy back', async () => {
    for (const other of [empty(1), broken()]) {
      const copy = await readFirstCopy(
        copyBuckets({ PAGE_COPIES: other, PAGE_COPIES_ENAM: holding(20) }),
        'pages/k',
        1_000,
      )
      expect(copy?.from).toBe('enam')
    }
  })

  it('negative control: no bucket holds it, or the wait runs out, and there is no copy', async () => {
    expect(
      await readFirstCopy(
        copyBuckets({ PAGE_COPIES: empty(1), PAGE_COPIES_ENAM: broken() }),
        'k',
        500,
      ),
    ).toBeNull()
    expect(
      await readFirstCopy(
        copyBuckets({ PAGE_COPIES: holding(200), PAGE_COPIES_ENAM: holding(200) }),
        'k',
        20,
      ),
    ).toBeNull()
    expect(await readFirstCopy([], 'k', 20)).toBeNull()
  })

  it('a drawn page is written to every bucket, and a failed write stops neither', async () => {
    const a = holding(0)
    const b = broken()
    const waits: Promise<unknown>[] = []
    const request = new Request('https://wear-run.com/guides', {
      headers: { [COPY_KEY_HEADER]: 'pages/wear-run.com/b/1/guides' },
    })
    const kept = keepCopy(
      request,
      { PAGE_COPIES: a, PAGE_COPIES_ENAM: b },
      { waitUntil: (p: Promise<unknown>) => void waits.push(p) },
      { 'content-type': 'text/html' },
      '<p>page</p>',
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await Promise.all(waits)
      expect(kept).toBe(true)
      expect(a.put).toHaveBeenCalledTimes(1)
      expect(b.put).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith({ pageCopy: 'written', ms: 0, from: 'apac' })
      expect(log).toHaveBeenCalledWith({ pageCopy: 'write-failed', ms: 0, from: 'enam' })
    } finally {
      log.mockRestore()
    }
  })

  it('both Workers bind both buckets, under the same names', () => {
    const cms = join(import.meta.dirname, '..')
    for (const file of ['wrangler.jsonc', 'wrangler.door.jsonc']) {
      const config = readFileSync(join(cms, file), 'utf8')
      expect(config, file).toMatch(
        /"binding": "PAGE_COPIES",\s+"bucket_name": "run-apparel-page-copies"/,
      )
      expect(config, file).toMatch(
        /"binding": "PAGE_COPIES_ENAM",\s+"bucket_name": "run-apparel-page-copies-enam"/,
      )
      expect(config, file).toMatch(
        /"binding": "PAGE_COPIES_EEUR",\s+"bucket_name": "run-apparel-page-copies-eeur"/,
      )
    }
  })
})
