/**
 * Rate limiting for POST /api/public/events.
 *
 * THE HOLE THIS CLOSES. That endpoint is unauthenticated, writes with
 * `overrideAccess: true`, and — correctly — always answers 204, because a
 * `navigator.sendBeacon` must never see a 4xx. So a flood fills D1 in complete
 * silence: no error, no alert, no failed request anywhere. The first symptom
 * would be the database, and by then it is already full.
 *
 * WHY IT IS IN THE WORKER AND NOT AT THE EDGE. Cloudflare's free plan allows
 * exactly ONE rate-limiting WAF rule, and it is spent on the admin login route
 * (see apps/cms/src/collections/Users.ts). The project's whole budget is $5/month
 * — Workers Paid, for the shrink Containers — so buying a second rule is not on
 * the table. This costs nothing and needs no binding.
 *
 * ⚠️ WHAT IT DOES NOT DO, stated plainly because a limiter people over-trust is
 * worse than none. The counters live in the Worker isolate's memory, so they are
 * PER COLO and reset when the isolate recycles. That stops the realistic threat —
 * one script hammering the endpoint, whose requests land in one or two colos —
 * and does NOT stop a genuinely distributed flood spread across many colos. That
 * is a DDoS, which is Cloudflare's layer, not the application's. Nothing here
 * should be read as protection against it.
 *
 * Deliberately NOT used: Cloudflare's `ratelimit` binding. It is the purpose-built
 * answer and it is free, but it is configured through `unsafe.bindings`, and a
 * binding the account cannot provision fails the DEPLOY of a live CMS. This
 * mechanism cannot fail a deploy at all. Revisit if the CMS ever needs limits
 * that survive an isolate restart.
 */

/**
 * Events one IP may write per window.
 *
 * A real session sends on the order of 15-30 events over several minutes — a page
 * load, a model load, a few colourway switches, maybe a contact click — batched up
 * to 20 at a time. 300 is an order of magnitude above that, on purpose: mobile
 * carriers and offices put many genuine visitors behind ONE address, and the cost
 * of a false positive here is silently losing a real customer's analytics, which
 * nobody would ever notice either.
 */
export const MAX_EVENTS_PER_IP = 300

/**
 * Events this isolate will write per window across ALL addresses.
 *
 * The per-IP limit alone is defeated by spoofing or renting addresses. This is the
 * blunt backstop: whatever arrives and from wherever, one isolate will not write
 * more than this per minute. Set well above any plausible real traffic for a
 * B2B reference with a handful of garments.
 */
export const MAX_EVENTS_PER_ISOLATE = 3000

export const WINDOW_MS = 60_000

/**
 * Stop the table of addresses becoming its own memory leak — an isolate can live
 * for hours, and an attacker rotating source addresses would otherwise grow it
 * without bound. On overflow the whole table is dropped rather than pruned
 * entry-by-entry: it costs one allocation, it is O(1), and the worst case is that
 * a flood gets one extra window's allowance.
 */
export const MAX_TRACKED_IPS = 10_000

export interface RateLimitState {
  windowStart: number
  isolateCount: number
  perIp: Map<string, number>
}

export function createRateLimitState(now: number): RateLimitState {
  return { windowStart: now, isolateCount: 0, perIp: new Map() }
}

export interface RateLimitDecision {
  /** How many of the requested events may be written. */
  allowed: number
  /** How many were refused, and why — used for the log line, never for a response. */
  dropped: number
  reason: 'ok' | 'per-ip' | 'per-isolate'
}

/**
 * Decide how many of `requested` events this address may write, and record it.
 *
 * Returns a PARTIAL allowance rather than an all-or-nothing verdict. A batch of
 * 20 that crosses the line writes the events that still fit instead of losing all
 * twenty — the difference between a busy visitor's session being truncated and it
 * disappearing.
 *
 * Mutates `state`; pure with respect to everything else, so it is testable
 * without a clock, a database or a request.
 */
export function checkRateLimit(
  state: RateLimitState,
  ip: string,
  requested: number,
  now: number,
): RateLimitDecision {
  if (requested <= 0) return { allowed: 0, dropped: 0, reason: 'ok' }

  if (now - state.windowStart >= WINDOW_MS) {
    state.windowStart = now
    state.isolateCount = 0
    state.perIp.clear()
  }

  const isolateRoom = MAX_EVENTS_PER_ISOLATE - state.isolateCount
  if (isolateRoom <= 0) return { allowed: 0, dropped: requested, reason: 'per-isolate' }

  // An absent CF-Connecting-IP is bucketed under one key rather than waved
  // through. Trusting the header's absence would make "send no IP" the bypass.
  const key = ip || 'unknown'
  if (state.perIp.size >= MAX_TRACKED_IPS && !state.perIp.has(key)) state.perIp.clear()

  const used = state.perIp.get(key) ?? 0
  const ipRoom = MAX_EVENTS_PER_IP - used
  if (ipRoom <= 0) return { allowed: 0, dropped: requested, reason: 'per-ip' }

  const allowed = Math.min(requested, ipRoom, isolateRoom)
  state.perIp.set(key, used + allowed)
  state.isolateCount += allowed

  return {
    allowed,
    dropped: requested - allowed,
    reason: allowed === requested ? 'ok' : ipRoom <= isolateRoom ? 'per-ip' : 'per-isolate',
  }
}
