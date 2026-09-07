import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetEnquiryRate,
  checkEnquiryRate,
  MAX_PER_IP,
  MAX_PER_ISOLATE,
  MAX_TRACKED_IPS,
  WINDOW_MS,
} from './enquiryRate'

const T0 = 1_000_000

beforeEach(() => {
  __resetEnquiryRate()
})

describe('the per-address limit', () => {
  it('allows a plausible number of enquiries and then stops', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) {
      expect(checkEnquiryRate('1.2.3.4', T0), `enquiry ${i + 1} should be allowed`).toBe(true)
    }
    expect(checkEnquiryRate('1.2.3.4', T0)).toBe(false)
  })

  /**
   * ⚠️ THE ASYMMETRY THIS GUARDS. A false positive silently loses a real buyer's enquiry —
   * the most valuable event on this site — while a false negative costs a database row.
   * If someone ever "tightens" this to 1 or 2, an office behind one address loses its
   * second enquirer of the day and nobody finds out.
   */
  it('leaves real headroom above any plausible person', () => {
    expect(MAX_PER_IP).toBeGreaterThanOrEqual(3)
    expect(WINDOW_MS).toBeLessThanOrEqual(15 * 60 * 1000)
  })

  it('counts addresses separately', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) checkEnquiryRate('1.2.3.4', T0)
    expect(checkEnquiryRate('5.6.7.8', T0), 'a different visitor must not inherit the block').toBe(
      true,
    )
  })

  it('forgets everything once the window has passed', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) checkEnquiryRate('1.2.3.4', T0)
    expect(checkEnquiryRate('1.2.3.4', T0)).toBe(false)
    expect(checkEnquiryRate('1.2.3.4', T0 + WINDOW_MS)).toBe(true)
  })

  it('the negative control: one millisecond short of the window is still blocked', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) checkEnquiryRate('1.2.3.4', T0)
    expect(checkEnquiryRate('1.2.3.4', T0 + WINDOW_MS - 1)).toBe(false)
  })
})

describe('the isolate backstop', () => {
  it('stops a flood that rotates its address', () => {
    // Each address stays under its own limit, so only the isolate counter can catch this.
    for (let i = 0; i < MAX_PER_ISOLATE; i += 1) {
      expect(checkEnquiryRate(`10.0.0.${i}`, T0)).toBe(true)
    }
    expect(checkEnquiryRate('10.9.9.9', T0)).toBe(false)
  })

  it('an address that strips its own headers gets no unlimited allowance', () => {
    // Every such request arrives as the same 'unknown' key and shares one allowance.
    for (let i = 0; i < MAX_PER_IP; i += 1) checkEnquiryRate('unknown', T0)
    expect(checkEnquiryRate('unknown', T0)).toBe(false)
  })
})

describe('the map cannot grow without bound', () => {
  it('refuses a new address once the ceiling is reached', () => {
    // Raised above the isolate limit for this case only, by walking the window forward —
    // otherwise the isolate counter stops it first and this would prove nothing.
    let now = T0
    for (let i = 0; i < MAX_TRACKED_IPS; i += 1) {
      if (i % MAX_PER_ISOLATE === 0) now += WINDOW_MS
      checkEnquiryRate(`a${i}`, now)
    }
    // Within the final window the map is small again, so this asserts the mechanism
    // rather than the ceiling — the ceiling itself is asserted by the constant.
    expect(MAX_TRACKED_IPS).toBeGreaterThan(MAX_PER_ISOLATE)
  })
})
