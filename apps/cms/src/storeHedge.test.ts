import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageCacheTiming } from '../pageCache.mjs'
import { HEDGE_HEAD_START_MS, hedgeable, hedgedAnswer, hedgeOn } from '../storeHedge.mjs'

/*
 * Store-miss hedge plan (docs/superpowers/plans/2026-10-28-store-miss-hedge.md), built 11 Nov 2026
 * on the owner's yes. Why: a page Workers Cache does not hold waits for SitePages to START in the
 * data centre that draws it, and a cold start there cost ~1.2 s (11 Nov logs: when SitePages had
 * not run there for 10 minutes, the wait before it started was p50 1,177 ms, 50 of 55 over 700 ms).
 * The default entrypoint near the visitor is warm, so after a short head start it reads the shared
 * copy and draws the page itself, and the visitor gets whichever answer starts first.
 */

/** A drawn page whose body records whether it was read to the end or cancelled. */
function page(status = 200) {
  const seen = { ended: false, cancelled: false }
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html>page</html>'))
    },
    pull(controller) {
      seen.ended = true
      controller.close()
    },
    cancel() {
      seen.cancelled = true
    },
  })
  return { seen, response: new Response(body, { status }) }
}

/** Settles after `ms` of (fake) time with `value`, or rejects when `value` is an Error. */
function settleAfter<T>(ms: number, value: T | Error): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => (value instanceof Error ? reject(value) : resolve(value)), ms),
  )
}

/** Runs hedgedAnswer and records when it settled, in fake milliseconds from the start. */
function run(options: {
  store: () => Promise<Response>
  draw?: () => Promise<Response>
  copy?: () => Promise<Response | null>
}) {
  const waits: Promise<unknown>[] = []
  const calls = { draw: 0, copy: 0 }
  const startedAt = Date.now()
  const outcome = { settledAt: -1, value: undefined as unknown }
  const promise = hedgedAnswer({
    askStore: options.store,
    drawDirect: () => {
      calls.draw++
      return options.draw ? options.draw() : settleAfter(10_000, page().response)
    },
    askCopy: options.copy
      ? () => {
          calls.copy++
          return options.copy?.() ?? Promise.resolve(null)
        }
      : undefined,
    headStartMs: 40,
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  }).then((value) => {
    outcome.settledAt = Date.now() - startedAt
    outcome.value = value
    return value
  })
  return { promise, waits, calls, outcome }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hedgedAnswer', () => {
  it('a store hit inside the head start is served and nothing else is asked', async () => {
    const stored = page()
    const r = run({
      store: () => settleAfter(5, stored.response),
      copy: () => settleAfter(1, null),
    })
    await vi.advanceTimersByTimeAsync(10)
    expect(await r.promise).toEqual({ response: stored.response, winner: 'store' })
    expect(r.calls).toEqual({ draw: 0, copy: 0 })
  })

  it('the production shape: a 2 s store and a 300 ms drawing reach the visitor in under 500 ms', async () => {
    const stored = page()
    const drawn = page()
    const r = run({
      store: () => settleAfter(2_000, stored.response),
      draw: () => settleAfter(300, drawn.response),
    })
    await vi.advanceTimersByTimeAsync(360)
    expect(r.outcome.settledAt).toBeGreaterThan(-1)
    expect(r.outcome.settledAt).toBeLessThanOrEqual(360)
    expect(r.outcome.value).toEqual({ response: drawn.response, winner: 'direct' })
    // The store's answer is read to the end in waitUntil, so the store still keeps the page.
    await vi.advanceTimersByTimeAsync(2_000)
    await Promise.all(r.waits)
    expect(stored.seen.ended).toBe(true)
  })

  it('a store answer that starts before the drawing wins, and the drawing is cancelled', async () => {
    const stored = page()
    const drawn = page()
    const r = run({
      store: () => settleAfter(120, stored.response),
      draw: () => settleAfter(300, drawn.response),
    })
    await vi.advanceTimersByTimeAsync(400)
    expect(await r.promise).toEqual({ response: stored.response, winner: 'store' })
    await Promise.all(r.waits)
    expect(drawn.seen.cancelled).toBe(true)
  })

  it('a drawing that throws leaves the visitor waiting for the store', async () => {
    const stored = page()
    const r = run({
      store: () => settleAfter(2_000, stored.response),
      draw: () => settleAfter<Response>(100, new Error('draw failed')),
    })
    await vi.advanceTimersByTimeAsync(2_100)
    expect(await r.promise).toEqual({ response: stored.response, winner: 'store' })
  })

  it('a drawing that answers 500 does not beat a store still drawing', async () => {
    const stored = page()
    const broken = page(500)
    const r = run({
      store: () => settleAfter(2_000, stored.response),
      draw: () => settleAfter(100, broken.response),
    })
    await vi.advanceTimersByTimeAsync(2_100)
    expect(await r.promise).toEqual({ response: stored.response, winner: 'store' })
    await Promise.all(r.waits)
    expect(broken.seen.cancelled).toBe(true)
  })

  it('the store failing after the head start leaves the drawing', async () => {
    const drawn = page()
    const r = run({
      store: () => settleAfter<Response>(80, new Error('store down')),
      draw: () => settleAfter(300, drawn.response),
    })
    await vi.advanceTimersByTimeAsync(400)
    expect(await r.promise).toEqual({ response: drawn.response, winner: 'direct' })
  })

  it('both failing returns null, so the caller draws as before the store', async () => {
    const r = run({
      store: () => settleAfter<Response>(80, new Error('store down')),
      draw: () => settleAfter<Response>(100, new Error('draw failed')),
    })
    await vi.advanceTimersByTimeAsync(200)
    expect(await r.promise).toBeNull()
  })

  it('the store failing inside the head start returns null without drawing', async () => {
    const r = run({ store: () => settleAfter<Response>(10, new Error('store down')) })
    await vi.advanceTimersByTimeAsync(50)
    expect(await r.promise).toBeNull()
    expect(r.calls.draw).toBe(0)
  })

  it('a shared copy found first answers, the drawing is cancelled and the store still kept', async () => {
    const stored = page()
    const drawn = page()
    const copied = new Response('<html>copy</html>', { status: 200 })
    const r = run({
      store: () => settleAfter(2_000, stored.response),
      draw: () => settleAfter(600, drawn.response),
      copy: () => settleAfter(150, copied),
    })
    await vi.advanceTimersByTimeAsync(200)
    expect(r.outcome.value).toEqual({ response: copied, winner: 'copy' })
    expect(r.calls).toEqual({ draw: 1, copy: 1 })
    await vi.advanceTimersByTimeAsync(2_000)
    await Promise.all(r.waits)
    expect(drawn.seen.cancelled).toBe(true)
    expect(stored.seen.ended).toBe(true)
  })

  it('no copy leaves the drawing to answer', async () => {
    const drawn = page()
    const r = run({
      store: () => settleAfter(2_000, page().response),
      draw: () => settleAfter(300, drawn.response),
      copy: () => settleAfter(100, null),
    })
    await vi.advanceTimersByTimeAsync(360)
    expect(r.outcome.value).toEqual({ response: drawn.response, winner: 'direct' })
  })

  it('a copy read that throws reads as no copy', async () => {
    const drawn = page()
    const r = run({
      store: () => settleAfter(2_000, page().response),
      draw: () => settleAfter(300, drawn.response),
      copy: () => settleAfter<Response | null>(50, new Error('R2 down')),
    })
    await vi.advanceTimersByTimeAsync(360)
    expect(r.outcome.value).toEqual({ response: drawn.response, winner: 'direct' })
  })

  it('the head start is measured, not guessed: pages hit p95 39 ms, taps 13 ms (11 Nov, 24 h)', () => {
    expect(HEDGE_HEAD_START_MS).toBe(40)
  })
})

describe('hedgeable', () => {
  const browser =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
  const ask = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    new Request(`https://wear-run.com${path}`, {
      method: init.method ?? 'GET',
      headers: { 'user-agent': browser, ...init.headers },
    })

  it("hedges a visitor's page or tap", () => {
    expect(hedgeable(ask('/guides'))).toBe(true)
    expect(hedgeable(ask('/journal/some-post'))).toBe(true)
    expect(hedgeable(ask('/'))).toBe(true)
    expect(hedgeable(ask('/guides', { headers: { rsc: '1' } }))).toBe(true)
  })

  it('never hedges a HEAD, a fetch-ahead, our warm-up robot or Globalping', () => {
    expect(hedgeable(ask('/guides', { method: 'HEAD' }))).toBe(false)
    expect(hedgeable(ask('/guides', { headers: { 'next-router-prefetch': '1' } }))).toBe(false)
    expect(
      hedgeable(ask('/guides', { headers: { 'user-agent': 'run-apparel-store-warmup/1.0' } })),
    ).toBe(false)
    expect(
      hedgeable(
        ask('/guides', {
          headers: { 'user-agent': 'globalping probe (https://github.com/jsdelivr/globalping)' },
        }),
      ),
    ).toBe(false)
  })

  it('never hedges a path that is not shaped like a page of the site', () => {
    expect(hedgeable(ask('/wp-login.php'))).toBe(false)
    expect(hedgeable(ask('/.env'))).toBe(false)
    expect(hedgeable(ask('/a/b/c/d'))).toBe(false)
    expect(hedgeable(ask('/Guides'))).toBe(false)
  })
})

/*
 * Live 11 Nov 2026: the switch used to be KV `store-hedge`, read once per 30 s per Worker copy AFTER
 * the page keys and before the store was asked. In a quiet data centre every visit paid that extra
 * KV trip: UptimeRobot's home-page checks took a median 105 ms on 10 Nov and 188–203 ms on 11 Nov,
 * and a probe every 10 s saw a 170–205 ms answer exactly every third request, on two pages at once.
 * The switch is now a wrangler var, as PAGE_COPY is: deciding to hedge must read nothing.
 */
describe('hedgeOn', () => {
  it('is off only when the STORE_HEDGE setting says "off"', () => {
    expect(hedgeOn({ STORE_HEDGE: 'off' })).toBe(false)
  })

  it('stays on for no setting, any other value, or no env at all', () => {
    expect(hedgeOn({})).toBe(true)
    expect(hedgeOn({ STORE_HEDGE: 'on' })).toBe(true)
    expect(hedgeOn(undefined)).toBe(true)
  })

  it('reads nothing from KV: the decision costs no trip', () => {
    const get = vi.fn(async () => 'off')
    const env = { STORE_HEDGE: 'on', SITE_CACHE: { get } }
    expect(hedgeOn(env)).toBe(true)
    expect(get).not.toHaveBeenCalled()
  })

  it('ships with the hedge on, as a setting in wrangler.jsonc', () => {
    const wrangler = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, ''),
    ) as { vars: Record<string, string> }
    expect(wrangler.vars.STORE_HEDGE).toBe('on')
  })
})

/*
 * worker.mjs imports cloudflare:workers and the built site, so it is read as text, the way
 * pageCopy.test.ts and pageCache.test.ts check it.
 */
describe('worker.mjs hedges a page and a tap miss', () => {
  const worker = readFileSync(join(import.meta.dirname, '..', 'worker.mjs'), 'utf8')
  const pages = worker.slice(
    worker.indexOf('async function fromSharedStore'),
    worker.indexOf('async function fromTapStore'),
  )
  const taps = worker.slice(
    worker.indexOf('async function fromTapStore'),
    worker.indexOf('export default {'),
  )

  it('asks the store through hedgedAnswer, only for a hedgeable request with the switch on', () => {
    for (const part of [pages, taps]) {
      expect(part).toMatch(/if \(hedgeable\(request\) && hedgeOn\(env\)\) \{/)
      // No KV wait between the timer starting and the store being asked (11 Nov 2026).
      expect(part).not.toMatch(/await hedgeOn/)
      expect(part).toMatch(/await hedgedAnswer\(\{\s+askStore,/)
      expect(part).toMatch(/drawDirect: \(\) => openNext\.fetch\(request, env, ctx\),/)
      expect(part).toMatch(/headStartMs: HEDGE_HEAD_START_MS,/)
      expect(part).toMatch(/waitUntil: \(p\) => ctx\.waitUntil\(p\),/)
      // Not hedged: exactly the path before the hedge.
      expect(part).toMatch(/\} else \{\s+kept = await askStore\(\)\s+\}/)
    }
  })

  it('still never follows a redirect from the store', () => {
    expect(pages).toMatch(/store\.fetch\(clean, \{ cf, redirect: 'manual' \}\)/)
    expect(taps).toMatch(
      /store\.fetch\(await tapDrawRequest\(request, cf\), \{ cf, redirect: 'manual' \}\)/,
    )
  })

  it('a page also reads the shared copy; a tap has none', () => {
    expect(pages).toMatch(/askCopy: \(\) => answerFromCopy\(clean, env\),/)
    expect(taps).not.toMatch(/askCopy/)
  })

  it('names the winner in the logs and in Server-Timing', () => {
    expect(pages).toMatch(/storeAnswerLog\('page', 'miss-direct',/)
    expect(pages).toMatch(/storeAnswerLog\('page', 'miss-copy',/)
    expect(taps).toMatch(/storeAnswerLog\('tap', 'miss-direct',/)
    expect(pages).toMatch(/return \{ state: 'miss-direct', response: answer\.response \}/)
    expect(pages).toMatch(/state: 'miss-copy',/)
    expect(pageCacheTiming('miss-direct', undefined)).toBe('page-cache;desc="miss-direct"')
    expect(pageCacheTiming('miss-copy', undefined)).toBe('page-cache;desc="miss-copy"')
  })
})
