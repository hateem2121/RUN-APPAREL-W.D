import { describe, expect, it } from 'vitest'
import {
  calibratedThrottleRate,
  cpuBenchmarkInPage,
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
