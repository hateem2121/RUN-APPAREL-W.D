import { describe, expect, it } from 'vitest'
import { checkApplicationRate, __resetApplicationRate } from './applicationRate'
import {
  __resetInquiryRate,
  checkInquiryRate,
  MAX_PER_IP,
  MAX_PER_ISOLATE,
  WINDOW_MS,
} from './inquiryRate'
import { createRateLimiter } from './rateLimiter'

/**
 * The limiter maker both forms' limiters come from (2026-10-25). The numbers here are small and
 * made up, so these tests hold the MECHANISM; `inquiryRate.test.ts` holds the contact form's real
 * numbers, and the last block below holds that the careers form has its own.
 */

const T0 = 1_000_000
const limits = { maxPerIp: 2, maxPerIsolate: 5, windowMs: 1000, maxTrackedIps: 3 }

describe('createRateLimiter', () => {
  it('allows each address its own number and then refuses, without spending on a refusal', () => {
    const limiter = createRateLimiter(limits)
    expect(limiter.check('a', T0)).toBe(true)
    expect(limiter.check('a', T0)).toBe(true)
    expect(limiter.check('a', T0)).toBe(false)
    expect(limiter.check('a', T0)).toBe(false)
    expect(limiter.check('b', T0), 'another address has its own allowance').toBe(true)
  })

  it('opens again at exactly the window, and not a millisecond before', () => {
    const limiter = createRateLimiter(limits)
    limiter.check('a', T0)
    limiter.check('a', T0)
    expect(limiter.check('a', T0 + limits.windowMs - 1)).toBe(false)
    expect(limiter.check('a', T0 + limits.windowMs)).toBe(true)
  })

  it('stops a flood that rotates its address once the isolate total is spent', () => {
    const limiter = createRateLimiter({ ...limits, maxTrackedIps: 100 })
    for (let i = 0; i < limits.maxPerIsolate; i += 1) {
      expect(limiter.check(`ip${i}`, T0), `request ${i + 1}`).toBe(true)
    }
    expect(limiter.check('fresh', T0)).toBe(false)
  })

  it('refuses a NEW address once the map is full, and still serves one already in it', () => {
    const limiter = createRateLimiter({ ...limits, maxPerIsolate: 100 })
    expect(limiter.check('a', T0)).toBe(true)
    expect(limiter.check('b', T0)).toBe(true)
    expect(limiter.check('c', T0)).toBe(true)
    expect(limiter.check('d', T0), 'a fourth address does not grow the map').toBe(false)
    expect(limiter.check('a', T0), 'an address already counted still has allowance').toBe(true)
  })

  it('counts the missing-header key together rather than exempting it', () => {
    const limiter = createRateLimiter(limits)
    limiter.check('unknown', T0)
    limiter.check('unknown', T0)
    expect(limiter.check('unknown', T0)).toBe(false)
  })

  it('forgets everything on reset()', () => {
    const limiter = createRateLimiter(limits)
    limiter.check('a', T0)
    limiter.check('a', T0)
    expect(limiter.check('a', T0)).toBe(false)
    limiter.reset()
    expect(limiter.check('a', T0)).toBe(true)
  })

  it('gives each limiter its own state, so one form cannot use up the other', () => {
    const one = createRateLimiter(limits)
    const two = createRateLimiter(limits)
    one.check('a', T0)
    one.check('a', T0)
    expect(one.check('a', T0)).toBe(false)
    expect(two.check('a', T0)).toBe(true)
    two.reset()
    expect(one.check('a', T0), 'resetting one does not reset the other').toBe(false)
  })
})

describe('the two forms use the same numbers and not the same counters', () => {
  it('lets the careers form take exactly MAX_PER_IP applications from an address, then refuses', () => {
    __resetApplicationRate()
    __resetInquiryRate()
    for (let i = 0; i < MAX_PER_IP; i += 1) {
      expect(checkApplicationRate('1.2.3.4', T0), `application ${i + 1}`).toBe(true)
    }
    expect(checkApplicationRate('1.2.3.4', T0), 'one more than the contact form allows').toBe(false)
  })

  it('stops the careers form at the isolate total as well', () => {
    __resetApplicationRate()
    for (let i = 0; i < MAX_PER_ISOLATE; i += 1) {
      expect(checkApplicationRate(`10.0.0.${i}`, T0)).toBe(true)
    }
    expect(checkApplicationRate('10.9.9.9', T0)).toBe(false)
  })

  it('opens the careers form again after the same window as the contact form', () => {
    __resetApplicationRate()
    for (let i = 0; i < MAX_PER_IP; i += 1) checkApplicationRate('1.2.3.4', T0)
    expect(checkApplicationRate('1.2.3.4', T0 + WINDOW_MS - 1)).toBe(false)
    expect(checkApplicationRate('1.2.3.4', T0 + WINDOW_MS)).toBe(true)
  })

  it('keeps an inquiry burst from locking out an application from the same address, and back', () => {
    __resetApplicationRate()
    __resetInquiryRate()
    for (let i = 0; i < MAX_PER_IP; i += 1) checkInquiryRate('5.6.7.8', T0)
    expect(checkInquiryRate('5.6.7.8', T0)).toBe(false)
    expect(checkApplicationRate('5.6.7.8', T0)).toBe(true)

    __resetApplicationRate()
    __resetInquiryRate()
    for (let i = 0; i < MAX_PER_IP; i += 1) checkApplicationRate('5.6.7.8', T0)
    expect(checkApplicationRate('5.6.7.8', T0)).toBe(false)
    expect(checkInquiryRate('5.6.7.8', T0)).toBe(true)
  })
})
