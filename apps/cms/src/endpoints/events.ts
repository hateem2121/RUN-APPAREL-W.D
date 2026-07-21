import { VIEWER_ANALYTICS_EVENTS } from '@run-apparel/shared'
import type { Endpoint, PayloadRequest } from 'payload'

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
 */

export const MAX_EVENT_BATCH = 20

const LIMITS = { event: 64, product: 32, variant: 48, placement: 32, message: 500, ua: 256 } as const
const VALID_TYPES = new Set(['analytics', 'diagnostic', 'error'])
const KNOWN_ANALYTICS = new Set<string>(VIEWER_ANALYTICS_EVENTS)
const BOT_UA = /bot|crawler|spider|headless|preview|scan|lighthouse|monitor/i

export interface EventRecord {
  type: 'analytics' | 'diagnostic' | 'error'
  event: string
  product?: string
  variant?: string
  placement?: string
  message?: string
  ua?: string
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
    })
  }
  return out
}

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

    for (const data of sanitizeEvents(parsed, ua)) {
      try {
        await req.payload.create({ collection: 'events', data, overrideAccess: true, req })
      } catch {
        // Best-effort: one bad row must never fail the whole batch.
      }
    }
    return new Response(null, { status: 204, headers })
  },
}
