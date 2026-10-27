import { describe, expect, it } from 'vitest'
import { percentile, storeStateOf, summaryLines, verdict } from '../scripts/measure-taps.mjs'

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
