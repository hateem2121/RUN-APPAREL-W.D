import { VIEWER_ANALYTICS_EVENTS } from '@run-apparel/shared'
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { MAX_EVENT_BATCH, eventsEndpoint, sanitizeEvents } from './events'
import { MAX_EVENTS_PER_IP } from './eventsRateLimit'

/**
 * The unauthenticated write endpoint, and the only one in this system.
 *
 * WHY IT IS WORTH TESTING AT THE HANDLER LEVEL. `eventsRateLimit.ts` is already at
 * 100% and `sanitizeEvents` is pure — but neither of them is what makes this endpoint
 * safe. What makes it safe is the ORDER and the always-204: sanitise, then rate limit
 * the sanitised count, then write, then answer 204 whatever happened. Every one of
 * those is in the handler and none of it was covered.
 *
 * Two properties here are load-bearing and both are invisible from the outside:
 *
 * 1. RATE LIMITING HAPPENS AFTER SANITISING. The source comment says the budget must
 *    be "spent on rows that would really be written rather than on whatever junk was
 *    posted". Swap the two and anyone can exhaust a real visitor's allowance by
 *    posting 20 pieces of garbage — the response is 204 either way, so the bug has no
 *    symptom until analytics quietly stop arriving.
 *
 * 2. THE WARN LINE IS THE ONLY EVIDENCE A FLOOD EVER HAPPENED. The endpoint answers
 *    204 to the attacker and 204 to a real visitor. Delete that log line and a flood
 *    becomes literally unobservable until someone opens the database — which is the
 *    exact silence the limiter was added to break.
 *
 * IPs are per-test on purpose: `rateLimitState` in events.ts is module scope (one
 * table per isolate, by design), so it is shared across every test in this file.
 */

const handler = eventsEndpoint.handler as (req: PayloadRequest) => Promise<Response>

interface ReqOptions {
  ip?: string
  ua?: string
  body?: string
  createRejects?: boolean
}

const makeReq = ({
  ip = '203.0.113.1',
  ua = 'Mozilla/5.0',
  body = '[]',
  createRejects = false,
}: ReqOptions = {}) => {
  // Typed to its own call signature. A bare `vi.fn(() => …)` infers `calls` as an
  // empty tuple, so `calls[0]?.[0]` is a type error rather than the argument.
  const create = vi.fn((_args: Record<string, unknown>) =>
    createRejects ? Promise.reject(new Error('D1 write failed')) : Promise.resolve({}),
  )
  const warn = vi.fn()
  const headers = new Headers({ 'user-agent': ua, 'cf-connecting-ip': ip })
  const req = {
    headers,
    text: () => Promise.resolve(body),
    payload: { create, logger: { warn, error: vi.fn(), info: vi.fn() } },
  } as unknown as PayloadRequest
  return { req, create, warn }
}

const analyticsEvent = VIEWER_ANALYTICS_EVENTS[0]

describe('sanitizeEvents', () => {
  it('keeps a well-formed analytics event and caps its fields', () => {
    const [rec] = sanitizeEvents(
      [{ type: 'analytics', event: analyticsEvent, product: 'n001', variant: 'N001-WINE' }],
      'Mozilla/5.0',
    )
    expect(rec).toMatchObject({ type: 'analytics', event: analyticsEvent, product: 'n001' })
  })

  it('drops an analytics event whose name is not on the shared allowlist', () => {
    // The allowlist is the privacy boundary: an arbitrary event name is free-text
    // from the public internet, stored forever, under a type that carries no message
    // field precisely so it cannot become one.
    expect(sanitizeEvents([{ type: 'analytics', event: 'exfiltrate_me' }], 'ua')).toEqual([])
  })

  it('never stores a message on an analytics event, even when one is supplied', () => {
    const [rec] = sanitizeEvents(
      [{ type: 'analytics', event: analyticsEvent, message: 'user@example.com' }],
      'ua',
    )
    expect(rec?.message).toBeUndefined()
  })

  it('allows a message on diagnostic and error events, truncated to 500 chars', () => {
    const [rec] = sanitizeEvents([{ type: 'error', event: 'boom', message: 'x'.repeat(900) }], 'ua')
    expect(rec?.message).toHaveLength(500)
  })

  it.each([
    ['a non-array payload', 'not an array'],
    ['null', null],
    ['an object', { type: 'analytics' }],
  ])('returns nothing for %s', (_label, input) => {
    expect(sanitizeEvents(input, 'ua')).toEqual([])
  })

  it.each([
    ['an unknown type', { type: 'wat', event: analyticsEvent }],
    ['no event name', { type: 'error' }],
    ['a blank event name', { type: 'error', event: '   ' }],
    ['a non-object item', 'nope'],
  ])('drops an item with %s', (_label, item) => {
    expect(sanitizeEvents([item], 'ua')).toEqual([])
  })

  it(`never returns more than MAX_EVENT_BATCH (${MAX_EVENT_BATCH}) items`, () => {
    const many = Array.from({ length: 100 }, () => ({ type: 'error', event: 'boom' }))
    expect(sanitizeEvents(many, 'ua')).toHaveLength(MAX_EVENT_BATCH)
  })

  it('defaults a missing type to analytics rather than dropping the item', () => {
    expect(sanitizeEvents([{ event: analyticsEvent }], 'ua')).toHaveLength(1)
  })
})

describe('POST /api/public/events', () => {
  it('is registered as a POST on the public path', () => {
    expect(eventsEndpoint.path).toBe('/public/events')
    expect(eventsEndpoint.method).toBe('post')
  })

  it('writes a valid batch and answers 204 with no body', async () => {
    const { req, create } = makeReq({
      ip: '203.0.113.10',
      body: JSON.stringify([{ type: 'analytics', event: analyticsEvent, product: 'n001' }]),
    })
    const res = await handler(req)

    expect(res.status).toBe(204)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'events',
      overrideAccess: true,
    })
  })

  /**
   * A beacon that sees a 4xx is a beacon that retries, and `navigator.sendBeacon`
   * fires during page unload — so a non-204 turns a malformed payload into a retry
   * storm from real browsers. Every one of these must still be 204.
   */
  it.each([
    ['malformed JSON', '{not json'],
    ['an empty body', ''],
    ['a JSON scalar', '42'],
    ['an empty array', '[]'],
  ])('answers 204 to %s and writes nothing', async (_label, body) => {
    const { req, create } = makeReq({ ip: '203.0.113.11', body })
    const res = await handler(req)

    expect(res.status).toBe(204)
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['Googlebot/2.1', 'HeadlessChrome/120', 'Lighthouse', 'uptime-monitor', 'some-crawler'])(
    'drops everything from a bot user-agent (%s) before parsing',
    async (ua) => {
      const { req, create } = makeReq({
        ip: '203.0.113.12',
        ua,
        body: JSON.stringify([{ type: 'analytics', event: analyticsEvent }]),
      })
      const res = await handler(req)

      expect(res.status).toBe(204)
      expect(create, 'a crawler must never pollute the analytics table').not.toHaveBeenCalled()
    },
  )

  /**
   * OUR OWN CHECKS ARE NOT VISITORS. On 2026-09-10 one scripted browser audit wrote 489
   * rows in 19 minutes — 371 of the 385 the weekly digest then reported, two of them
   * "server errors" it simulated inside its own browser. It passed `BOT_UA` because its
   * user-agent carried no crawler word, only its own name. Every tool here that touches
   * production names itself `run-apparel-…` (scripts/perf-probe.mjs,
   * scripts/apex-probe.mjs, the browser audit), so that tag is the filter.
   */
  it.each(['Mozilla/5.0 (compatible) run-apparel-audit/1.0', 'run-apparel-perf-probe'])(
    'drops everything from one of our own tools (%s)',
    async (ua) => {
      const { req, create } = makeReq({
        ip: '203.0.113.14',
        ua,
        body: JSON.stringify([
          { type: 'diagnostic', event: 'render-scale-degraded', message: 'GPU throttling' },
        ]),
      })
      const res = await handler(req)

      expect(res.status).toBe(204)
      expect(create, 'a check we ran ourselves must not read as a visitor').not.toHaveBeenCalled()
    },
  )

  it('survives a failed row write without losing the rest of the batch', async () => {
    // "Best-effort: one bad row must never fail the whole batch." A throw escaping
    // here would 500 a beacon, which is the one thing this endpoint must never do.
    const { req, create } = makeReq({
      ip: '203.0.113.13',
      createRejects: true,
      body: JSON.stringify([
        { type: 'error', event: 'a' },
        { type: 'error', event: 'b' },
      ]),
    })
    const res = await handler(req)

    expect(res.status).toBe(204)
    expect(create, 'the second row must still be attempted').toHaveBeenCalledTimes(2)
  })

  it('never persists an IP address', async () => {
    const { req, create } = makeReq({
      ip: '198.51.100.77',
      body: JSON.stringify([{ type: 'error', event: 'boom', message: 'oops' }]),
    })
    await handler(req)

    expect(JSON.stringify(create.mock.calls[0]?.[0])).not.toContain('198.51.100.77')
  })

  /**
   * THE FLOOD PATH. Nothing else in the repository exercises it, and its only output
   * is one log line — the response is 204 throughout, from the first event to the
   * ten-thousandth.
   */
  it('logs a warning once the per-IP budget is spent, while still answering 204', async () => {
    const ip = '198.51.100.200'
    const batch = JSON.stringify(
      Array.from({ length: MAX_EVENT_BATCH }, (_, i) => ({ type: 'error', event: `e${i}` })),
    )
    const requests = Math.ceil(MAX_EVENTS_PER_IP / MAX_EVENT_BATCH) + 1

    let lastWarn: ReturnType<typeof makeReq>['warn'] | null = null
    let lastStatus = 0
    for (let i = 0; i < requests; i++) {
      const { req, warn } = makeReq({ ip, body: batch })
      lastStatus = (await handler(req)).status
      lastWarn = warn
    }

    expect(lastStatus, 'a flooding client is still answered 204').toBe(204)
    expect(
      lastWarn?.mock.calls.length,
      'without this line a flood is invisible until someone opens the database',
    ).toBeGreaterThan(0)
    expect(String(lastWarn?.mock.calls[0]?.[0])).toContain('rate limit')
  })

  /**
   * The ordering property, asserted as a behaviour rather than described in a comment.
   * Twenty junk items are posted from a fresh address; if the limiter ran BEFORE
   * sanitising it would have charged that address for twenty events, and the twenty
   * genuine ones that follow would be short. They are not.
   */
  it('spends the rate-limit budget only on events that survive sanitising', async () => {
    const ip = '198.51.100.201'
    const junk = JSON.stringify(
      Array.from({ length: MAX_EVENT_BATCH }, () => ({ type: 'nonsense', event: 'x' })),
    )
    const real = JSON.stringify(
      Array.from({ length: MAX_EVENT_BATCH }, (_, i) => ({ type: 'error', event: `real${i}` })),
    )

    const first = makeReq({ ip, body: junk })
    await handler(first.req)
    expect(first.create).not.toHaveBeenCalled()
    expect(first.warn, 'junk that writes nothing is not a rate-limit event').not.toHaveBeenCalled()

    const second = makeReq({ ip, body: real })
    await handler(second.req)
    expect(second.create).toHaveBeenCalledTimes(MAX_EVENT_BATCH)
  })
})

/**
 * PAGE SPEED (audit PF-05b, 2026-09-17). The viewer has measured LCP and CLS on every
 * visit since 2026-09-04 and none of it was kept: telemetry.ts forwarded only the event
 * name, and this endpoint had nowhere to put a number. These pin what may now be stored
 * and, because this endpoint is unauthenticated, everything that may not.
 */
describe('sanitizeEvents — the two page-speed numbers (PF-05b)', () => {
  const vitals = (extra: Record<string, unknown>) =>
    sanitizeEvents([{ type: 'analytics', event: 'web_vitals', product: 'rxps', ...extra }], 'ua')[0]

  it('keeps an LCP in milliseconds and a CLS score on a web_vitals report', () => {
    expect(vitals({ lcpMs: 2400, cls: 0.012 })).toMatchObject({
      type: 'analytics',
      event: 'web_vitals',
      product: 'rxps',
      lcpMs: 2400,
      cls: 0.012,
    })
  })

  it('keeps both bounds themselves', () => {
    expect(vitals({ lcpMs: 0, cls: 0 })).toMatchObject({ lcpMs: 0, cls: 0 })
    expect(vitals({ lcpMs: 600_000, cls: 10 })).toMatchObject({ lcpMs: 600_000, cls: 10 })
  })

  it.each([
    ['a negative LCP', { lcpMs: -1 }],
    ['an LCP past ten minutes', { lcpMs: 600_001 }],
    ['an infinite LCP', { lcpMs: Number.POSITIVE_INFINITY }],
    ['a NaN LCP', { lcpMs: Number.NaN }],
    ['an LCP sent as text', { lcpMs: '2400' }],
    ['a CLS above 10', { cls: 10.5 }],
    ['a negative CLS', { cls: -0.1 }],
    ['a CLS sent as text', { cls: '0.1' }],
  ])('drops %s but keeps the visit', (_label, extra) => {
    const record = vitals(extra)
    expect(record, 'the visit itself still counts').toMatchObject({ event: 'web_vitals' })
    expect(record?.lcpMs).toBeUndefined()
    expect(record?.cls).toBeUndefined()
  })

  it('never stores the numbers on another analytics event', () => {
    expect(analyticsEvent, 'the precondition: a different allowed event').not.toBe('web_vitals')
    const [record] = sanitizeEvents(
      [{ type: 'analytics', event: analyticsEvent, lcpMs: 2400, cls: 0.012 }],
      'ua',
    )
    expect(record).toBeDefined()
    expect(record?.lcpMs).toBeUndefined()
    expect(record?.cls).toBeUndefined()
  })

  it('never stores them on a diagnostic that borrows the name', () => {
    const [record] = sanitizeEvents(
      [{ type: 'diagnostic', event: 'web_vitals', lcpMs: 2400, cls: 0.012 }],
      'ua',
    )
    expect(record).toBeDefined()
    expect(record?.lcpMs).toBeUndefined()
    expect(record?.cls).toBeUndefined()
  })

  it('hands both numbers to the database write', async () => {
    const { req, create } = makeReq({
      ip: '203.0.113.30',
      body: JSON.stringify([{ type: 'analytics', event: 'web_vitals', lcpMs: 2400, cls: 0.012 }]),
    })
    await handler(req)
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'events',
      data: { event: 'web_vitals', lcpMs: 2400, cls: 0.012 },
    })
  })
})
