import { describe, expect, it } from 'vitest'
import { classify, median, overlapsModelDownload, summarize } from './speed-measurement-probe.mjs'

/**
 * PF-01, PF-02, PF-07, PF-08 — see `speed-measurement-probe.mjs`'s own header for why
 * this is a LIVE check (a real CDP-throttled browser against the live site) with no
 * local-runtime equivalent. Unit tests here cover the probe's own metric-extraction
 * and threshold logic; its NETWORK calls are only exercised live/manually.
 *
 * Paired alongside the probe rather than in `apps/cms/src/` (the plan's own citation)
 * — the probe itself lives in `apps/viewer/scripts/` for a module-resolution reason
 * (see its header), and a cross-app import back into `apps/cms` would hit the exact
 * same `@playwright/test`-resolution problem in reverse the moment this file's
 * import graph reached the probe's own `chromium` import, since ESM resolves bare
 * specifiers from the IMPORTING file's own ancestor directories, not the importer's
 * importer's.
 */
describe('median', () => {
  it('is the middle value for an odd count', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('averages the two middle values for an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('throws on an empty array rather than returning NaN silently', () => {
    expect(() => median([])).toThrow(/empty/)
  })
})

describe('summarize', () => {
  it('reports median, min and max together', () => {
    expect(summarize([100, 200, 300])).toEqual({
      median: 200,
      min: 100,
      max: 300,
      samples: [100, 200, 300],
    })
  })

  it('is null-shaped for no samples, not a thrown error', () => {
    expect(summarize([])).toEqual({ median: null, min: null, max: null, samples: [] })
  })
})

describe('classify', () => {
  it('is within target when the median is at or under the ceiling', () => {
    const r = classify('LCP', summarize([2000, 2200, 2400]), 2500)
    expect(r.withinTarget).toBe(true)
  })

  it('is NOT within target when the median exceeds the ceiling', () => {
    const r = classify('LCP', summarize([3000, 3200, 3400]), 2500)
    expect(r.withinTarget).toBe(false)
  })

  it('is null (not false) when there are no samples to judge', () => {
    const r = classify('LCP', summarize([]), 2500)
    expect(r.withinTarget).toBeNull()
  })
})

describe('overlapsModelDownload — PF-08', () => {
  it('accepts decoder and HDR requests that start alongside the model', () => {
    const r = overlapsModelDownload({ model: 500, decoder: 520, hdr: 540 })
    expect(r.ok).toBe(true)
  })

  it('flags a decoder that starts long after the model (fetched only once asked for)', () => {
    const r = overlapsModelDownload({ model: 500, decoder: 4500, hdr: 540 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('decoder')
  })

  it('flags a decoder or HDR that never loads at all', () => {
    const r = overlapsModelDownload({ model: 500, hdr: 540 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('decoder')
    expect(r.problems.join(' ')).toContain('never requested')
  })

  it('cannot judge overlap when the model itself was never requested', () => {
    const r = overlapsModelDownload({ decoder: 500, hdr: 540 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no model request/)
  })
})
