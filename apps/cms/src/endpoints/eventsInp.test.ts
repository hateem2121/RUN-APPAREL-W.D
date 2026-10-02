import { VIEWER_ANALYTICS_EVENTS } from '@run-apparel/shared'
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { LIVE_PRODUCTS } from '../../../../scripts/live-products.mjs'
import { Events } from '../collections/Events'
import { MAX_INP_MS, eventsEndpoint, sanitizeEvents } from './events'

/**
 * VA-14 (visual audit, 2026-10-02): the events endpoint now stores a speed report's INP, and keeps
 * the report's product only when it is shaped like a product code. This endpoint is the only
 * unauthenticated write in the system, so the interesting half is what it must REFUSE: a number
 * outside its bounds, text posing as a number, and a `product` that is not a code. In every case
 * the number or the field is dropped and the row stays — the visit still counts.
 *
 * What would have to break for these to fail: `inpMs` stored on a row that is not a speed report,
 * an unbounded or text INP stored, a speed report's product kept without being checked, the check
 * widened to every event (it would change what they store), a live garment's own code refused
 * (the garment would vanish from the report again, silently), or the collection's field tighter
 * than the endpoint (`payload.create` would then drop the whole row).
 */

const vitals = (extra: Record<string, unknown>) =>
  sanitizeEvents([{ type: 'analytics', event: 'web_vitals', product: 'R-XPS', ...extra }], 'ua')[0]

describe('sanitizeEvents — INP on a speed report (VA-14)', () => {
  it('keeps an INP in milliseconds beside the other numbers', () => {
    expect(vitals({ lcpMs: 2400, cls: 0.012, inpMs: 216 })).toMatchObject({
      type: 'analytics',
      event: 'web_vitals',
      product: 'R-XPS',
      lcpMs: 2400,
      cls: 0.012,
      inpMs: 216,
    })
  })

  it('is bounded at a minute, far past any real tap (the "poor" line is 500ms)', () => {
    expect(MAX_INP_MS).toBe(60_000)
  })

  it('keeps both bounds themselves', () => {
    expect(vitals({ inpMs: 0 })).toMatchObject({ inpMs: 0 })
    expect(vitals({ inpMs: MAX_INP_MS })).toMatchObject({ inpMs: MAX_INP_MS })
  })

  it.each([
    ['a negative INP', { inpMs: -1 }],
    ['an INP past a minute', { inpMs: MAX_INP_MS + 1 }],
    ['an infinite INP', { inpMs: Number.POSITIVE_INFINITY }],
    ['a NaN INP', { inpMs: Number.NaN }],
    ['an INP sent as text', { inpMs: '216' }],
    ['an INP sent as null', { inpMs: null }],
  ])('drops %s but keeps the visit and its other numbers', (_label, extra) => {
    const record = vitals({ lcpMs: 2400, ...extra })
    expect(record, 'the visit itself still counts').toMatchObject({ event: 'web_vitals' })
    expect(record?.inpMs).toBeUndefined()
    expect(record?.lcpMs, 'a bad INP must not take a good LCP with it').toBe(2400)
  })

  it('never stores it on another analytics event', () => {
    const other = VIEWER_ANALYTICS_EVENTS.find((name) => name !== 'web_vitals')
    expect(other, 'the precondition: a different allowed event').toBeDefined()
    const [record] = sanitizeEvents([{ type: 'analytics', event: other, inpMs: 216 }], 'ua')
    expect(record).toBeDefined()
    expect(record?.inpMs).toBeUndefined()
  })

  it('never stores it on a diagnostic that borrows the name', () => {
    const [record] = sanitizeEvents([{ type: 'diagnostic', event: 'web_vitals', inpMs: 216 }], 'ua')
    expect(record).toBeDefined()
    expect(record?.inpMs).toBeUndefined()
  })
})

describe('sanitizeEvents — the garment on a speed report (VA-14)', () => {
  const productOf = (product: unknown) => vitals({ lcpMs: 900, product })?.product

  it('keeps a product that is shaped like a product code, trimmed', () => {
    expect(productOf('R-XPS')).toBe('R-XPS')
    expect(productOf('  R-XPS ')).toBe('R-XPS')
    expect(productOf('N001')).toBe('N001')
  })

  it("keeps every live garment's own code: a refused one would leave that garment unnamed again", () => {
    expect(LIVE_PRODUCTS.length, 'the precondition: a list to check').toBeGreaterThan(0)
    const lost = LIVE_PRODUCTS.map((live) => live.productCode).filter(
      (code) => productOf(code) !== code,
    )
    expect(lost).toEqual([])
  })

  it.each([
    ['a slug in lower case', 'rxps'],
    ['words', 'R XPS'],
    ['markup', '<script>alert(1)</script>'],
    ['a path', '../../etc/passwd'],
    ['a doubled hyphen', 'R--XPS'],
    ['a trailing hyphen', 'R-'],
    ['a leading digit', '1R-XPS'],
    ['a number', 42],
    ['an object', { code: 'R-XPS' }],
    ['an empty string', ''],
  ])('drops %s, and keeps the visit with its numbers', (_label, product) => {
    const record = vitals({ lcpMs: 900, inpMs: 216, product })
    expect(record, 'the visit itself still counts').toMatchObject({
      event: 'web_vitals',
      lcpMs: 900,
      inpMs: 216,
    })
    expect(record?.product).toBeUndefined()
  })

  it('still stops at the 32 characters the column takes', () => {
    expect(productOf('A'.repeat(40))).toBe('A'.repeat(32))
  })

  it('leaves what every other event stores about its product exactly as it was', () => {
    // Their `product` was never checked; this change is not the place to alter what they mean.
    for (const event of VIEWER_ANALYTICS_EVENTS.filter((name) => name !== 'web_vitals')) {
      const [record] = sanitizeEvents([{ type: 'analytics', event, product: 'rxps' }], 'ua')
      expect(record?.product, event).toBe('rxps')
    }
    const [diagnostic] = sanitizeEvents(
      [{ type: 'diagnostic', event: 'web_vitals', product: 'rxps', message: 'x' }],
      'ua',
    )
    expect(diagnostic?.product).toBe('rxps')
  })
})

describe('POST /api/public/events — a speed report with INP and a garment (VA-14)', () => {
  const handler = eventsEndpoint.handler as (req: PayloadRequest) => Promise<Response>

  const post = async (body: unknown, ip: string) => {
    const create = vi.fn((_args: Record<string, unknown>) => Promise.resolve({}))
    const req = {
      headers: new Headers({ 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': ip }),
      text: () => Promise.resolve(JSON.stringify(body)),
      payload: { create, logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } },
    } as unknown as PayloadRequest
    const response = await handler(req)
    return { response, create }
  }

  it('hands the INP and the product to the database write', async () => {
    const { response, create } = await post(
      [
        {
          type: 'analytics',
          event: 'web_vitals',
          product: 'R-XPS',
          lcpMs: 2400,
          cls: 0.012,
          inpMs: 216,
        },
      ],
      '203.0.113.71',
    )
    expect(response.status).toBe(204)
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'events',
      data: { event: 'web_vitals', product: 'R-XPS', lcpMs: 2400, cls: 0.012, inpMs: 216 },
    })
  })

  it('still writes the row when the INP is forged out of range, without the number', async () => {
    const { response, create } = await post(
      [{ type: 'analytics', event: 'web_vitals', product: 'R-XPS', lcpMs: 900, inpMs: 1e9 }],
      '203.0.113.72',
    )
    expect(response.status).toBe(204)
    expect(create).toHaveBeenCalledOnce()
    const written = create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined
    expect(written?.data.lcpMs).toBe(900)
    expect(written?.data.inpMs).toBeUndefined()
  })
})

describe('the Events collection holds the INP as wide as the endpoint accepts (VA-14)', () => {
  const field = Events.fields.find((f) => 'name' in f && f.name === 'inpMs') as
    | { type?: string; min?: number; max?: number }
    | undefined

  it('has an inpMs number field', () => {
    expect(field?.type).toBe('number')
  })

  it('is no tighter than the endpoint, or payload.create would drop the whole row', () => {
    expect(field?.min).toBe(0)
    expect(field?.max).toBe(MAX_INP_MS)
  })
})
