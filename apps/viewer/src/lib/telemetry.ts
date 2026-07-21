/**
 * First-party telemetry client. Consumes the viewer's `run:analytics` /
 * `run:diagnostic` DOM-event seam plus window errors, batches them, and ships
 * them to the CMS `POST /api/public/events` endpoint with `navigator.sendBeacon`
 * (a `text/plain` body keeps it a CORS simple request — no preflight).
 *
 * Privacy & safety:
 * - No IP or personal data is ever sent; only the named event + product/variant.
 * - Analytics events respect Do-Not-Track; operational diagnostics/errors do not.
 * - Never runs under automation (Playwright) so e2e stays clean and offline.
 * - Client errors are capped and de-duplicated per session.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms.wear-run.help').replace(/\/$/, '')
const ENDPOINT = `${API_BASE}/api/public/events`

const MAX_ERRORS = 5
const FLUSH_AT = 10
const FLUSH_MS = 10_000

interface QueuedEvent {
  type: 'analytics' | 'diagnostic' | 'error'
  event: string
  product?: string
  variant?: string
  placement?: string
  message?: string
}

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let errorCount = 0
const seenErrors = new Set<string>()
let started = false

function doNotTrack(): boolean {
  const dnt = navigator.doNotTrack ?? (window as Window & { doNotTrack?: string }).doNotTrack
  return dnt === '1' || dnt === 'yes'
}

function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (queue.length === 0) return
  const batch = queue
  queue = []
  const body = JSON.stringify(batch)
  try {
    const blob = new Blob([body], { type: 'text/plain' })
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return
  } catch {
    // fall through to fetch
  }
  // Fallback for browsers without a working sendBeacon; keepalive lets it
  // complete even as the page unloads.
  void fetch(ENDPOINT, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'text/plain' },
  }).catch(() => {})
}

function enqueue(item: QueuedEvent): void {
  queue.push(item)
  if (queue.length >= FLUSH_AT) {
    flush()
    return
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS)
}

/** Wire the analytics/diagnostic/error seams to the batching queue. Idempotent. */
export function initTelemetry(): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return
  // Never send under automation (Playwright/headless) — keeps e2e offline.
  if (navigator.webdriver) return
  // No endpoint configured → nothing to send.
  if (!API_BASE) return
  started = true

  document.addEventListener('run:analytics', (event) => {
    if (doNotTrack()) return // analytics honours Do-Not-Track
    const detail = (event as CustomEvent<Record<string, string>>).detail ?? {}
    const { event: name, product, variant, placement } = detail
    if (!name) return
    enqueue({ type: 'analytics', event: name, product, variant, placement })
  })

  document.addEventListener('run:diagnostic', (event) => {
    const detail = (event as CustomEvent<Record<string, string>>).detail ?? {}
    const { kind, product, variant, reason, module, available } = detail
    // Operational, not tracking — sent regardless of Do-Not-Track.
    enqueue({
      type: 'diagnostic',
      event: kind ?? 'diagnostic',
      product,
      variant,
      message: reason ?? module ?? available,
    })
  })

  const recordError = (message: string) => {
    if (errorCount >= MAX_ERRORS) return
    const key = message.slice(0, 100)
    if (seenErrors.has(key)) return
    seenErrors.add(key)
    errorCount += 1
    enqueue({ type: 'error', event: 'client_error', message })
  }
  window.addEventListener('error', (event) => {
    recordError(event.message || String(event.error ?? 'error'))
  })
  window.addEventListener('unhandledrejection', (event) => {
    recordError(String(event.reason ?? 'unhandledrejection'))
  })

  // Flush opportunistically as the visit ends.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}
