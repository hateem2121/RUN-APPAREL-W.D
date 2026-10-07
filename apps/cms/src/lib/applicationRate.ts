import { MAX_PER_IP, MAX_PER_ISOLATE, MAX_TRACKED_IPS, WINDOW_MS } from './inquiryRate'

/**
 * Rate limiting for the careers form: the contact form's mechanism and numbers
 * (`inquiryRate.ts` says why they are generous and what they do not stop), with COUNTERS OF ITS
 * OWN — so a burst of inquiries from one office cannot lock out a job application from the same
 * address, nor the reverse.
 */
export { MAX_PER_IP, MAX_PER_ISOLATE }

type State = { windowStart: number; isolateCount: number; perIp: Map<string, number> }

let state: State | null = null

/** True when this request may proceed. */
export function checkApplicationRate(ip: string, now: number): boolean {
  if (!state || now - state.windowStart >= WINDOW_MS) {
    state = { windowStart: now, isolateCount: 0, perIp: new Map() }
  }
  if (state.isolateCount >= MAX_PER_ISOLATE) return false

  const used = state.perIp.get(ip) ?? 0
  if (used >= MAX_PER_IP) return false

  // As in inquiryRate.ts: an unknown address is counted together, never exempted.
  if (state.perIp.size >= MAX_TRACKED_IPS && !state.perIp.has(ip)) return false

  state.perIp.set(ip, used + 1)
  state.isolateCount += 1
  return true
}

/** Exported for the tests, which must not depend on wall-clock timing. */
export function __resetApplicationRate(): void {
  state = null
}
