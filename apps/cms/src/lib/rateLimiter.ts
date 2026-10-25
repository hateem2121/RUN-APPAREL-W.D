/**
 * One maker for the forms' rate limiters (2026-10-25).
 *
 * The contact form's limiter (`inquiryRate.ts`) and the careers form's (`applicationRate.ts`) were
 * the same 20 lines twice, which is how a fix to one could be missed in the other. Each now calls
 * this with its own numbers, and each keeps COUNTERS OF ITS OWN: a limiter made here holds its own
 * state, so a burst of inquiries from one office cannot lock out a job application from the same
 * address, nor the reverse.
 *
 * What the counters are, and what they do not stop, is written once in `inquiryRate.ts`.
 */

type RateLimits = {
  /** Requests one address may make per window. */
  maxPerIp: number
  /** Across the whole isolate, whatever the addresses: the backstop for a rotating IP. */
  maxPerIsolate: number
  windowMs: number
  /** A ceiling on the map itself, so a flood from many addresses cannot grow it without bound. */
  maxTrackedIps: number
}

type RateLimiter = {
  /** True when this request may proceed, and spends one unit of the allowance when it does. */
  check: (ip: string, now: number) => boolean
  /** For the tests, which must not depend on wall-clock timing. */
  reset: () => void
}

type State = { windowStart: number; isolateCount: number; perIp: Map<string, number> }

export function createRateLimiter(limits: RateLimits): RateLimiter {
  let state: State | null = null

  return {
    check(ip, now) {
      if (!state || now - state.windowStart >= limits.windowMs) {
        state = { windowStart: now, isolateCount: 0, perIp: new Map() }
      }
      if (state.isolateCount >= limits.maxPerIsolate) return false

      const used = state.perIp.get(ip) ?? 0
      if (used >= limits.maxPerIp) return false

      // An unknown address is still counted, together, rather than exempted: a caller that
      // strips its own headers must not thereby get an unlimited allowance.
      if (state.perIp.size >= limits.maxTrackedIps && !state.perIp.has(ip)) return false

      state.perIp.set(ip, used + 1)
      state.isolateCount += 1
      return true
    },
    reset() {
      state = null
    },
  }
}
