/**
 * Rate limiting for the contact form.
 *
 * The same mechanism and the same honest limits as `src/endpoints/eventsRateLimit.ts` —
 * counters in the Worker isolate's memory, so they are PER COLO and reset when the
 * isolate recycles. That stops the realistic threat, one script hammering the endpoint
 * from one or two colos, and does NOT stop a genuinely distributed flood. That is a DDoS,
 * which is Cloudflare's layer, not the application's, and nothing here should be read as
 * protection against it.
 *
 * ⚠️ WHY NOT THE EDGE: Cloudflare's free plan allows exactly ONE rate-limiting WAF rule
 * and it is spent on the admin login route. The project's whole budget is $5/month, so
 * buying a second is not on the table. This costs nothing and needs no binding.
 *
 * ⚠️ THE NUMBERS ARE DELIBERATELY GENEROUS, AND THE ASYMMETRY IS THE ARGUMENT. A false
 * positive here silently loses a real buyer's inquiry — the single most valuable event on
 * this site — while a false negative costs a database row. Nobody sends five genuine
 * inquiries in ten minutes, and an office or a mobile carrier can put many genuine
 * visitors behind one address, so the limit sits well above any plausible person and well
 * below anything worth calling a flood.
 */

/** Inquiries one address may send per window. */
export const MAX_PER_IP = 5

/** Across the whole isolate, whatever the addresses — the backstop for a rotating IP. */
export const MAX_PER_ISOLATE = 60

export const WINDOW_MS = 10 * 60 * 1000

/**
 * A ceiling on the map itself. Without it, a flood from many addresses grows the map
 * rather than the database — a slower leak, but the same shape of problem.
 */
export const MAX_TRACKED_IPS = 5000

type State = { windowStart: number; isolateCount: number; perIp: Map<string, number> }

let state: State | null = null

/** True when this request may proceed. */
export function checkInquiryRate(ip: string, now: number): boolean {
  if (!state || now - state.windowStart >= WINDOW_MS) {
    state = { windowStart: now, isolateCount: 0, perIp: new Map() }
  }
  if (state.isolateCount >= MAX_PER_ISOLATE) return false

  const used = state.perIp.get(ip) ?? 0
  if (used >= MAX_PER_IP) return false

  // An unknown address is still counted, together, rather than exempted: a caller that
  // strips its own headers must not thereby get an unlimited allowance.
  if (state.perIp.size >= MAX_TRACKED_IPS && !state.perIp.has(ip)) return false

  state.perIp.set(ip, used + 1)
  state.isolateCount += 1
  return true
}

/** Exported for the tests, which must not depend on wall-clock timing. */
export function __resetInquiryRate(): void {
  state = null
}
