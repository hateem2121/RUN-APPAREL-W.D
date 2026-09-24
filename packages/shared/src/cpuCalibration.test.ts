import { describe, expect, it } from 'vitest'
import {
  calibratedThrottleRate,
  cpuBenchmarkInPage,
  isReferenceClass,
  REFERENCE_BENCHMARK,
  TARGET_SLOWDOWN,
} from './cpuCalibration'

describe('calibratedThrottleRate', () => {
  it('is exactly the target slowdown on the reference machine', () => {
    expect(calibratedThrottleRate(REFERENCE_BENCHMARK)).toBe(TARGET_SLOWDOWN)
  })
  it('throttles a slower machine LESS, in proportion — CI measured ~2.2x slower', () => {
    expect(calibratedThrottleRate(REFERENCE_BENCHMARK / 2)).toBe(TARGET_SLOWDOWN / 2)
  })
  it('throttles a faster machine more', () => {
    expect(calibratedThrottleRate(REFERENCE_BENCHMARK * 1.5)).toBe(TARGET_SLOWDOWN * 1.5)
  })
  it('never asks a machine to run faster than it can (floor 1) or crawl absurdly (cap 8)', () => {
    expect(calibratedThrottleRate(1)).toBe(1)
    expect(calibratedThrottleRate(REFERENCE_BENCHMARK * 100)).toBe(8)
  })
  it('refuses a score that is not a positive number instead of throttling blindly', () => {
    expect(() => calibratedThrottleRate(0)).toThrow(/positive/)
    expect(() => calibratedThrottleRate(Number.NaN)).toThrow(/positive/)
  })
})

describe('cpuBenchmarkInPage', () => {
  it('references nothing outside its own body, so page.evaluate can serialise it', () => {
    // Rebuilt from its own SOURCE with no closure: a helper it silently leaned on would
    // throw ReferenceError here, exactly as it would inside the browser.
    const rebuilt = new Function(`return (${cpuBenchmarkInPage.toString()})()`) as () => number
    expect(rebuilt()).toBeGreaterThan(0)
  })
})

describe('isReferenceClass', () => {
  it('counts the reference and anything within 20% of it', () => {
    expect(isReferenceClass(REFERENCE_BENCHMARK)).toBe(true)
    expect(isReferenceClass(REFERENCE_BENCHMARK * 0.8)).toBe(true)
  })
  it("does NOT count CI's measured runners (scores 104 and 171), even where a rate exists", () => {
    expect(isReferenceClass(104)).toBe(false)
    expect(isReferenceClass(171)).toBe(false)
    expect(calibratedThrottleRate(171)).toBeGreaterThan(1)
  })
})
