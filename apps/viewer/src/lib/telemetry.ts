/**
 * First-party telemetry client. Consumes the viewer's `run:analytics` /
 * `run:diagnostic` DOM-event seam plus window errors, batches them, and ships
 * them to the CMS `POST /api/public/events` endpoint with `navigator.sendBeacon`
 * (a `text/plain` body keeps it a CORS simple request — no preflight).
 *
 * Privacy & safety:
 * - No IP or personal data is ever sent; only the named event + product/variant,
 *   and, on a `web_vitals` report only, its two page-speed numbers (audit PF-05b).
 * - Analytics events respect Do-Not-Track; operational diagnostics/errors do not.
 * - Never runs under automation (Playwright) so e2e stays clean and offline.
 * - Client errors are capped and de-duplicated per session.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms.wear-run.help').replace(
  /\/$/,
  '',
)
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
  /** Page-speed numbers, on a `web_vitals` report only (audit PF-05b). */
  lcpMs?: number
  cls?: number
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

/**
 * A page-speed number the way the CMS stores it (audit PF-05b, 2026-09-17).
 *
 * webVitals.ts hands its two metrics over as STRINGS (every `run:analytics` detail is a
 * `Record<string, string>`), and until 2026-09-17 `onAnalytics` forwarded neither, so
 * both were dropped on every visit. The CMS keeps only JSON numbers
 * (apps/cms/src/endpoints/events.ts), so convert here and send nothing for a value that
 * is not one. The blank check matters: `Number('')` is 0, a perfect score nobody earned.
 */
function metric(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function vitalsOf(detail: Record<string, string>): Pick<QueuedEvent, 'lcpMs' | 'cls'> {
  return { lcpMs: metric(detail.lcpMs), cls: metric(detail.cls) }
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

const recordError = (message: string) => {
  if (errorCount >= MAX_ERRORS) return
  const key = message.slice(0, 100)
  if (seenErrors.has(key)) return
  seenErrors.add(key)
  errorCount += 1
  enqueue({ type: 'error', event: 'client_error', message })
}

/**
 * Wire the analytics/diagnostic/error seams to the batching queue. Idempotent.
 * Returns a teardown function that removes every listener and resets state
 * (used by tests; the app calls this once and never tears it down).
 */
export function initTelemetry(): () => void {
  const noop = () => {}
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return noop
  // Never send under automation (Playwright/headless) — keeps e2e offline.
  if (navigator.webdriver) return noop
  // No endpoint configured → nothing to send.
  if (!API_BASE) return noop
  started = true

  const onAnalytics = (event: Event) => {
    if (doNotTrack()) return // analytics honours Do-Not-Track
    const detail = (event as CustomEvent<Record<string, string>>).detail ?? {}
    const { event: name, product, variant, placement } = detail
    if (!name) return
    enqueue({
      type: 'analytics',
      event: name,
      product,
      variant,
      placement,
      // Only a page-speed report carries numbers; every other event is sent as before.
      ...(name === 'web_vitals' ? vitalsOf(detail) : {}),
    })
  }
  const onDiagnostic = (event: Event) => {
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
  }
  const onError = (event: ErrorEvent) =>
    recordError(event.message || String(event.error ?? 'error'))
  const onRejection = (event: PromiseRejectionEvent) =>
    recordError(String(event.reason ?? 'unhandledrejection'))
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }

  document.addEventListener('run:analytics', onAnalytics)
  document.addEventListener('run:diagnostic', onDiagnostic)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)

  return () => {
    document.removeEventListener('run:analytics', onAnalytics)
    document.removeEventListener('run:diagnostic', onDiagnostic)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    queue = []
    errorCount = 0
    seenErrors.clear()
    started = false
  }
}
