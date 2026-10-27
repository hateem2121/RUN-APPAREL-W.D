import { describe, expect, it } from 'vitest'
import { OWN_AGENTS } from '../../../scripts/page-store-digest.mjs'
import {
  engines,
  judge,
  percentile,
  storeStateOf,
  summaryLines,
  verdict,
} from '../scripts/measure-taps.mjs'

/**
 * The live tap measurement (faster-taps plan, Task 1): the before/after judge for G1 (a tap shows
 * the new page in under 0.4 s, 3 in 4) and the weekly watch's check. Only the arithmetic is unit
 * tested here; the browser half is proven by its own negative control (`--refuse-store`).
 */

describe('percentile', () => {
  it('is nearest-rank: p75 of four values is the third', () => {
    expect(percentile([1, 2, 3, 4], 75)).toBe(3)
  })
})

describe('storeStateOf', () => {
  it("reads the store's verdict from Server-Timing", () => {
    expect(storeStateOf('page-cache;desc="hit"')).toBe('hit')
    expect(storeStateOf('cfExtPri, api-cache;desc="miss"')).toBe('miss')
  })

  it("says 'none' when the answer carries no store verdict", () => {
    expect(storeStateOf(null)).toBe('none')
    expect(storeStateOf('cfExtPri')).toBe('none')
  })
})

describe('verdict', () => {
  const warm = (ms: number) => ({ route: '/products', engine: 'chromium', ms, state: 'hit' })

  it('passes four warm 300 ms taps against 400 ms and fails them against 250 ms', () => {
    const rows = [warm(300), warm(300), warm(300), warm(300)]
    expect(verdict(rows, 400).pass).toBe(true)
    expect(verdict(rows, 250).pass).toBe(false)
  })

  it('leaves a miss out of p75 but counts it in n', () => {
    const rows = [warm(200), warm(200), warm(200), { ...warm(3700), state: 'miss' }]
    const result = verdict(rows, 400)
    expect(result.byRoute['/products chromium']).toEqual({ p50: 200, p75: 200, n: 4 })
    expect(result.pass).toBe(true)
  })

  // Measured 27 Oct: /about, /contact and /faq arrived in 33-71 ms with no tap request at all,
  // answered from the browser's own router cache (Next prefetches a static page whole).
  it("counts a tap the browser answered itself ('client') as warm", () => {
    const rows = [1, 2, 3, 4].map(() => ({ ...warm(60), state: 'client' }))
    expect(verdict(rows, 400).byRoute['/products chromium']).toEqual({ p50: 60, p75: 60, n: 4 })
    expect(verdict(rows, 400).pass).toBe(true)
  })

  it('fails when a route has no warm tap at all, rather than passing on nothing', () => {
    const rows = [{ ...warm(3700), state: 'miss' }]
    expect(verdict(rows, 400).pass).toBe(false)
  })

  it('leaves a tap the edge refused out of the judgement: one among measured taps changes nothing', () => {
    const rows = [warm(200), warm(200), warm(200), { ...warm(0), state: 'none', blocked: true }]
    const result = verdict(rows, 400)
    expect(result).toMatchObject({ pass: true, inconclusive: false })
    expect(result.byRoute['/products chromium']).toEqual({ p50: 200, p75: 200, n: 4 })
  })

  it('calls a route measured only through refusals inconclusive, never a pass or a fail', () => {
    const refused = { route: '/faq', engine: 'webkit-phone', blocked: true }
    expect(verdict([warm(200), refused], 400)).toMatchObject({ pass: true, inconclusive: true })
  })
})

/*
 * Review, 27 Oct: the run judged only the rows that carried a number, so a route whose every tap
 * failed (a moved link, a timeout) dropped out and the weekly watch passed on what remained. And
 * any 403/429/503 on any file of any tap page made the whole run "inconclusive", which the
 * workflow shows as a green warning: one refused picture voided a week's verdict.
 */
describe('judge (the exit code the weekly watch reads)', () => {
  const warm = (route: string, ms = 200) => ({ route, engine: 'chromium', ms, state: 'hit' })
  const garments = [1, 2, 3].map(() => ({ ...warm('card → garment', 900), state: 'hit' }))

  it('fails the run when every tap to one route failed, and still reports that route', () => {
    const failed = { route: '/about', engine: 'chromium', error: 'no start page links here' }
    const result = judge([warm('/'), warm('/'), failed, failed], garments)
    expect(result.exitCode).toBe(1)
    expect(result.taps.byRoute['/about chromium']?.n).toBe(2)
  })

  it('passes a run whose routes were measured, though one tap was refused', () => {
    const refused = { route: '/', engine: 'chromium', blocked: true }
    expect(judge([warm('/'), warm('/'), warm('/'), refused], garments).exitCode).toBe(0)
  })

  it('makes a passing run inconclusive (exit 2) when a route was measured only through refusals', () => {
    const refused = { route: '/faq', engine: 'chromium', blocked: true }
    expect(judge([warm('/'), refused], garments).exitCode).toBe(2)
  })

  it('lets a real failure win over an inconclusive route', () => {
    const refused = { route: '/faq', engine: 'chromium', blocked: true }
    expect(judge([warm('/', 3000), refused], garments).exitCode).toBe(1)
  })
})

/*
 * Review, 27 Oct: WebKit's "iPhone 15" profile sends a real Safari user agent (measured: "Mozilla/5.0
 * (iPhone; CPU iPhone OS 17_5 …) … Safari/604.1"), so the weekly watch's phone page loads counted as
 * people in the visitor digest. Headless Chromium already says "HeadlessChrome/156…" (measured).
 */
describe('engines', () => {
  const devices = {
    'iPhone 15': {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1',
      viewport: { width: 393, height: 659 },
      isMobile: true,
      hasTouch: true,
    },
  }

  it('drives only browsers the visitor digest counts as ours', () => {
    for (const engine of engines(devices)) {
      const agent = engine.context.userAgent ?? 'HeadlessChrome'
      expect(
        OWN_AGENTS.some((own: string) => agent.includes(own)),
        engine.name,
      ).toBe(true)
    }
  })

  it("keeps the iPhone profile's own agent and screen, so the site still serves a phone", () => {
    const phone = engines(devices).find((engine) => engine.name === 'webkit-phone')
    expect(phone?.context).toMatchObject({ viewport: { width: 393, height: 659 }, hasTouch: true })
    expect(phone?.context.userAgent?.startsWith(devices['iPhone 15'].userAgent)).toBe(true)
  })
})

describe('summaryLines (the weekly watch prints these, never the rows)', () => {
  it('gives one line per route and engine: warm p50 and p75, and every tap counted', () => {
    const lines = summaryLines({
      taps: { pass: false, byRoute: { '/ chromium': { p50: 120, p75: 150, n: 10 } } },
      garment: {
        pass: true,
        byRoute: { 'card → garment webkit-phone': { p50: null, p75: null, n: 10 } },
      },
    })
    expect(lines).toEqual([
      '/ chromium: warm p50 120 ms, p75 150 ms (10 taps)',
      'card → garment webkit-phone: no warm tap (10 taps)',
    ])
  })
})
