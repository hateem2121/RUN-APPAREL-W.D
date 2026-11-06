import { createRateLimiter } from './rateLimiter'

/**
 * Rate limiting for the tech-pack template's download form: the contact form's mechanism
 * (`inquiryRate.ts` says what it stops and what it does not), with its own counters, so downloading
 * the template never spends a buyer's inquiry allowance, and the other way round.
 *
 * The numbers are the contact form's doubled: a buyer may download again for a colleague or a second
 * style, and a refusal here costs a buyer the template, while a missed bot costs a row.
 */
export const MAX_PER_IP = 10
export const MAX_PER_ISOLATE = 120
export const WINDOW_MS = 10 * 60 * 1000
export const MAX_TRACKED_IPS = 5000

const limiter = createRateLimiter({
  maxPerIp: MAX_PER_IP,
  maxPerIsolate: MAX_PER_ISOLATE,
  windowMs: WINDOW_MS,
  maxTrackedIps: MAX_TRACKED_IPS,
})

/** True when this request may proceed. */
export const checkTemplateDownloadRate = limiter.check

/** Exported for the tests, which must not depend on wall-clock timing. */
export const __resetTemplateDownloadRate = limiter.reset
