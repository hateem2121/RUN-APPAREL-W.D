import { MAX_PER_IP, MAX_PER_ISOLATE, MAX_TRACKED_IPS, WINDOW_MS } from './inquiryRate'
import { createRateLimiter } from './rateLimiter'

/**
 * Rate limiting for the careers form: the contact form's mechanism and numbers
 * (`inquiryRate.ts` says why they are generous and what they do not stop), with COUNTERS OF ITS
 * OWN — so a burst of inquiries from one office cannot lock out a job application from the same
 * address, nor the reverse. Both come from `createRateLimiter`, each holding its own state.
 */
export { MAX_PER_IP, MAX_PER_ISOLATE }

const limiter = createRateLimiter({
  maxPerIp: MAX_PER_IP,
  maxPerIsolate: MAX_PER_ISOLATE,
  windowMs: WINDOW_MS,
  maxTrackedIps: MAX_TRACKED_IPS,
})

/** True when this request may proceed. */
export const checkApplicationRate = limiter.check

/** Exported for the tests, which must not depend on wall-clock timing. */
export const __resetApplicationRate = limiter.reset
