import { describe, expect, it } from 'vitest'
import {
  MAX_EVENTS_PER_IP,
  MAX_EVENTS_PER_ISOLATE,
  MAX_TRACKED_IPS,
  WINDOW_MS,
  checkRateLimit,
  createRateLimitState,
} from './eventsRateLimit'

/**
 * The limiter on the one endpoint anyone on the internet can write to.
 *
 * Testable at all because the clock is a parameter. That is the point of the
 * shape: a limiter that reads Date.now() internally can only be tested by
 * sleeping, so in practice it does not get tested, and this one guards a table
 * that a flood would fill in silence — POST /api/public/events always answers
 * 204, by design.
 */

const T0 = 1_700_000_000_000

describe('checkRateLimit', () => {
  it('lets ordinary traffic straight through', () => {
    const state = createRateLimitState(T0)
    // A whole realistic session: a page load, a model load, four colourway
    // switches, a camera move and a contact click, in three beacons.
    for (const batch of [3, 4, 2]) {
      const decision = checkRateLimit(state, '203.0.113.10', batch, T0)
      expect(decision).toEqual({ allowed: batch, dropped: 0, reason: 'ok' })
    }
  })

  it('caps one address at the per-IP budget', () => {
    const state = createRateLimitState(T0)
    checkRateLimit(state, '203.0.113.10', MAX_EVENTS_PER_IP, T0)
    expect(checkRateLimit(state, '203.0.113.10', 5, T0)).toEqual({
      allowed: 0,
      dropped: 5,
      reason: 'per-ip',
    })
  })

  it('writes the events that still fit rather than losing the whole batch', () => {
    // A partial allowance is the difference between a busy visitor's session
    // being truncated and it disappearing entirely.
    const state = createRateLimitState(T0)
    checkRateLimit(state, '203.0.113.10', MAX_EVENTS_PER_IP - 3, T0)
    expect(checkRateLimit(state, '203.0.113.10', 20, T0)).toEqual({
      allowed: 3,
      dropped: 17,
      reason: 'per-ip',
    })
  })

  it('does not let one address spend another address’s budget', () => {
    const state = createRateLimitState(T0)
    checkRateLimit(state, '203.0.113.10', MAX_EVENTS_PER_IP, T0)
    expect(checkRateLimit(state, '198.51.100.7', 10, T0).allowed).toBe(10)
  })

  it('still caps the isolate when the flood rotates addresses', () => {
    // The per-IP limit alone is defeated by renting or spoofing addresses; this
    // is the backstop that makes the total bounded regardless.
    const state = createRateLimitState(T0)
    let written = 0
    for (let i = 0; i < 500; i++) {
      written += checkRateLimit(state, `198.51.100.${i % 256}-${i}`, 20, T0).allowed
    }
    expect(written).toBe(MAX_EVENTS_PER_ISOLATE)
    expect(checkRateLimit(state, '203.0.113.99', 5, T0)).toEqual({
      allowed: 0,
      dropped: 5,
      reason: 'per-isolate',
    })
  })

  it('reopens the budget in the next window', () => {
    const state = createRateLimitState(T0)
    checkRateLimit(state, '203.0.113.10', MAX_EVENTS_PER_IP, T0)
    expect(checkRateLimit(state, '203.0.113.10', 5, T0 + WINDOW_MS).allowed).toBe(5)
  })

  it('does not reopen a moment early', () => {
    const state = createRateLimitState(T0)
    checkRateLimit(state, '203.0.113.10', MAX_EVENTS_PER_IP, T0)
    expect(checkRateLimit(state, '203.0.113.10', 5, T0 + WINDOW_MS - 1).allowed).toBe(0)
  })

  it('buckets a missing client IP instead of waving it through', () => {
    // Trusting the absence of CF-Connecting-IP would make "send no IP" the
    // documented bypass.
    const state = createRateLimitState(T0)
    checkRateLimit(state, '', MAX_EVENTS_PER_IP, T0)
    expect(checkRateLimit(state, '', 1, T0).allowed).toBe(0)
  })

  it('cannot itself grow without bound', () => {
    // An isolate lives for hours. A flood rotating source addresses would
    // otherwise turn the limiter into the memory leak.
    const state = createRateLimitState(T0)
    for (let i = 0; i < MAX_TRACKED_IPS + 500; i++) {
      checkRateLimit(state, `10.0.${(i >> 8) & 255}.${i & 255}`, 1, T0)
    }
    expect(state.perIp.size).toBeLessThanOrEqual(MAX_TRACKED_IPS)
  })

  it('is a no-op for an empty batch, and spends nothing', () => {
    const state = createRateLimitState(T0)
    expect(checkRateLimit(state, '203.0.113.10', 0, T0)).toEqual({
      allowed: 0,
      dropped: 0,
      reason: 'ok',
    })
    expect(state.isolateCount).toBe(0)
  })
})
