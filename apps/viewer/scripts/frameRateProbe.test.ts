import { describe, expect, it } from 'vitest'
import { classifyFrameGaps, evaluateFrameGaps } from './frame-rate-probe.mjs'

/**
 * PF-21 — see `frame-rate-probe.mjs`'s own header for why this is a SIMULATOR proxy
 * (real Safari rendering, NOT a device frame-rate number) with no local-runtime
 * equivalent. Unit tests here cover the probe's own classification/judging logic;
 * its iOS Simulator run is only exercised live/manually.
 */
describe('classifyFrameGaps', () => {
  it('counts frames over the long-frame threshold', () => {
    const r = classifyFrameGaps([16, 16, 60, 16, 90])
    expect(r.sampleCount).toBe(5)
    expect(r.longFrameCount).toBe(2)
    expect(r.worstGapMs).toBe(90)
    expect(r.longFrames).toEqual([60, 90])
  })

  it('is clean for a steady 60fps run', () => {
    const r = classifyFrameGaps(Array(60).fill(16.6))
    expect(r.longFrameCount).toBe(0)
    expect(r.worstGapMs).toBeCloseTo(16.6)
  })

  it('is zero-shaped for no samples', () => {
    const r = classifyFrameGaps([])
    expect(r).toEqual({ sampleCount: 0, longFrameCount: 0, worstGapMs: 0, longFrames: [] })
  })
})

describe('evaluateFrameGaps', () => {
  const CEILINGS = { maxLongFrames: 20, maxWorstGapMs: 500 }

  it('passes a clean sweep', () => {
    const classified = classifyFrameGaps(Array(180).fill(16.6))
    expect(evaluateFrameGaps(classified, CEILINGS).ok).toBe(true)
  })

  it('flags too few samples as a probable non-run', () => {
    const classified = classifyFrameGaps([16, 16])
    const r = evaluateFrameGaps(classified, CEILINGS)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('frame samples')
  })

  it('flags too many long frames', () => {
    const classified = classifyFrameGaps([...Array(30).fill(16), ...Array(25).fill(80)])
    const r = evaluateFrameGaps(classified, CEILINGS)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('long frames')
  })

  it('flags a single catastrophic gap even with few long frames overall', () => {
    const classified = classifyFrameGaps([...Array(100).fill(16), 900])
    const r = evaluateFrameGaps(classified, CEILINGS)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('worst frame gap')
  })
})
