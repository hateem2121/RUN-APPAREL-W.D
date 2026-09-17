import { VIEWER_ANALYTICS_EVENTS } from '@run-apparel/shared'
import type { Endpoint, PayloadRequest } from 'payload'
import { type RateLimitState, checkRateLimit, createRateLimitState } from './eventsRateLimit'

/**
 * POST /api/public/events
 *
 * First-party telemetry intake for the public viewer. The viewer batches its
 * analytics/diagnostic/error events and sends them with `navigator.sendBeacon`
 * as a `text/plain` body — which keeps it a CORS "simple request" (no
 * preflight). We parse the JSON array server-side, validate + length-cap every
 * field, drop obvious bots, and store each row via the Local API. No IP and no
 * personal data are ever persisted. Always answers 204 — a fire-and-forget
 * beacon must never see a 4xx/5xx.
 *
 * The only numbers it stores are a page-speed report's two (audit PF-05b,
 * 2026-09-17): `lcpMs` and `cls`, on an `analytics` / `web_vitals` item only, and
 * only inside the bounds below.
 */

export const MAX_EVENT_BATCH = 20

const LIMITS = {
  event: 64,
  product: 32,
  variant: 48,
  placement: 32,
  message: 500,
  ua: 256,
} as const
const VALID_TYPES = new Set(['analytics', 'diagnostic', 'error'])
const KNOWN_ANALYTICS = new Set<string>(VIEWER_ANALYTICS_EVENTS)
// `run-apparel-` is the name every tool of ours carries when it touches production
// (scripts/perf-probe.mjs, scripts/apex-probe.mjs, the browser audit). On 2026-09-10 one
// such audit wrote 489 rows in 19 minutes — 371 of the weekly digest's 385 — because its
// user-agent held no crawler word, only its own name. A check that needs to see its own
// rows here has to leave the tag off.
const BOT_UA = /bot|crawler|spider|headless|preview|scan|lighthouse|monitor|run-apparel-/i

/**
 * The bounds on a page-speed report's two numbers (audit PF-05b).
 *
 * This endpoint is unauthenticated, and a number is as easy to forge as a name, so both
 * are bounded rather than trusted: ten minutes is far past any real paint, and a
 * layout-shift score of 10 far past any real page. Outside them the NUMBER is dropped,
 * never the row — the visit still counts. Text is refused too: the viewer converts both
 * to numbers before sending (apps/viewer/src/lib/telemetry.ts), so a string here did
 * not come from the viewer. Collections/Events.ts repeats the bounds.
 */
const MAX_LCP_MS = 600_000
const MAX_CLS = 10
const WEB_VITALS = 'web_vitals'

const bounded = (value: unknown, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : undefined

export interface EventRecord {
  type: 'analytics' | 'diagnostic' | 'error'
  event: string
  product?: string
  variant?: string
  placement?: string
  message?: string
  ua?: string
  /** Largest Contentful Paint in milliseconds — `web_vitals` analytics rows only. */
  lcpMs?: number
  /** Cumulative Layout Shift for the visit — `web_vitals` analytics rows only. */
  cls?: number
}

const cap = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed.slice(0, max) : undefined
}

/**
 * Validate + normalise a raw event batch into safe, length-capped records.
 * Pure (no DB, no PII beyond a coarse UA) so it is unit-testable. Drops any
 * item that is malformed, of an unknown type, or an analytics event whose name
 * is not in the shared allowlist.
 */
export function sanitizeEvents(rawItems: unknown, userAgent: string): EventRecord[] {
  if (!Array.isArray(rawItems)) return []
  const ua = cap(userAgent, LIMITS.ua)
  const out: EventRecord[] = []
  for (const raw of rawItems.slice(0, MAX_EVENT_BATCH)) {
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    const type = typeof rec.type === 'string' ? rec.type : 'analytics'
    if (!VALID_TYPES.has(type)) continue
    const event = cap(rec.event, LIMITS.event)
    if (!event) continue
    // Analytics events must be from the known allowlist; diagnostics and
    // errors carry free-form kinds/messages.
    if (type === 'analytics' && !KNOWN_ANALYTICS.has(event)) continue
    const vitals = type === 'analytics' && event === WEB_VITALS
    out.push({
      type: type as EventRecord['type'],
      event,
      product: cap(rec.product, LIMITS.product),
      variant: cap(rec.variant, LIMITS.variant),
      placement: cap(rec.placement, LIMITS.placement),
      // Diagnostics and errors may carry a free-form message; analytics events
      // never do (privacy — they are limited to the known allowlist).
      message: type === 'analytics' ? undefined : cap(rec.message, LIMITS.message),
      ua,
      lcpMs: vitals ? bounded(rec.lcpMs, MAX_LCP_MS) : undefined,
      cls: vitals ? bounded(rec.cls, MAX_CLS) : undefined,
    })
  }
  return out
}

/**
 * Isolate-lifetime rate-limit counters. Module scope on purpose: one table per
 * Worker isolate, shared by every request it serves. See ./eventsRateLimit for
 * what this does and — more importantly — what it does not.
 */
let rateLimitState: RateLimitState | null = null

export const eventsEndpoint: Endpoint = {
  path: '/public/events',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const headers = { 'Cache-Control': 'no-store' }
    const ua = req.headers?.get?.('user-agent') ?? ''
    if (BOT_UA.test(ua)) return new Response(null, { status: 204, headers })

    let parsed: unknown = null
    try {
      const reader = req as unknown as { text?: () => Promise<string> }
      const raw = typeof reader.text === 'function' ? await reader.text() : ''
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      return new Response(null, { status: 204, headers }) // never 4xx a beacon
    }

    const events = sanitizeEvents(parsed, ua)

    // Rate limit AFTER sanitising, so the budget is spent on rows that would
    // really be written rather than on whatever junk was posted.
    const now = Date.now()
    rateLimitState ??= createRateLimitState(now)
    const limit = checkRateLimit(
      rateLimitState,
      req.headers?.get?.('cf-connecting-ip') ?? '',
      events.length,
      now,
    )

    if (limit.dropped > 0) {
      // The ONLY signal that this happened. The response is 204 either way — a
      // beacon must never see a 4xx — so without this line a flood is invisible
      // until someone looks at the database. Goes to Workers Logs, which is
      // enabled for this worker (observability in wrangler.jsonc).
      req.payload.logger.warn(
        `events: dropped ${limit.dropped} event(s) — rate limit (${limit.reason}).`,
      )
    }

    for (const data of events.slice(0, limit.allowed)) {
      try {
        await req.payload.create({ collection: 'events', data, overrideAccess: true, req })
      } catch {
        // Best-effort: one bad row must never fail the whole batch.
      }
    }
    return new Response(null, { status: 204, headers })
  },
}
