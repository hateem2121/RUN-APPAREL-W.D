/**
 * Optional structured error tracking (Sentry, free tier) — complements the
 * first-party telemetry that lands in the CMS Events collection and the Workers
 * Logs on the API side, adding aggregated client-side stack traces.
 *
 * No-op unless VITE_SENTRY_DSN is set at build time. Because the DSN is a
 * build-time constant, when it is unset the `if` below is dead code and Vite
 * eliminates the dynamic import entirely — @sentry/browser never enters the
 * bundle, so there is zero runtime/bundle/perf cost by default.
 *
 * ─── WHAT THIS ADDS OVER lib/telemetry.ts, WHICH ALREADY CATCHES ERRORS ──────
 * telemetry.ts registers `window.onerror` and `unhandledrejection` and posts to
 * the CMS. It carries a MESSAGE STRING ONLY — capped at 5 per session and
 * de-duplicated on the first 100 characters. That is enough to know something
 * broke and useless for finding out where. Sentry adds the stack, the browser and
 * OS, and grouping across visitors. The two are complements, not alternatives:
 * with no DSN the first-party path is still the one that works.
 *
 * ─── PRIVACY ────────────────────────────────────────────────────────────────
 * The starting position here is unusually good and is preserved DELIBERATELY —
 * there is no login, no cookie, no form. The enquiry path is a `mailto:` and a
 * `wa.me` link built client-side (components/Contact.tsx), so nothing a visitor
 * types ever exists in this page. URLs carry only `/{product}/{colourway}`, which
 * are catalogue identifiers printed on physical QR tags.
 *
 * `scrub()` below keeps it that way by construction rather than by assumption.
 * Note what it CANNOT do: IP address capture happens at Sentry's ingestion edge,
 * not in this SDK, so "Prevent Storing of IP Addresses" must be switched on in the
 * Sentry PROJECT SETTINGS. There is no code change that substitutes for it.
 *
 * Session Replay is deliberately not enabled. @sentry/browser ships it; it records
 * the DOM, which is the one thing here that could capture something like a
 * screenshot of a visitor's session.
 */
import { canRender3D } from './capabilities'
import { currentRoute } from './router'

/** Events larger than this are almost certainly carrying something unintended. */
const MAX_BREADCRUMBS = 20

/**
 * Strip everything that could carry a visitor rather than a fault.
 *
 * Written as belt-and-braces: no query string is used by this app today, and
 * `sendDefaultPii: false` already suppresses most of this. Both of those are
 * facts about the CURRENT code, and this function is what keeps the guarantee if
 * either changes — a future filter or share link in the URL would otherwise start
 * flowing to a third party silently.
 */
export function scrub(event: Record<string, unknown>): Record<string, unknown> {
  delete event.user

  const request = event.request as Record<string, unknown> | undefined
  if (request) {
    delete request.cookies
    delete request.headers
    delete request.data
    // Pathname only — drops `?` and `#` whatever they may come to hold.
    if (typeof request.url === 'string') {
      try {
        const url = new URL(request.url)
        request.url = `${url.origin}${url.pathname}`
      } catch {
        delete request.url
      }
    }
  }
  return event
}

/**
 * Errors that are provably not this application's, dropped before they are sent.
 *
 * MEASURED 2026-08-25, under four hours after the DSN first went live: 225
 * events, **0 users impacted**, and not one of them a fault in this app. 148 of
 * them — 66% — were `Object Not Found Matching Id:N, MethodName:update,
 * ParamCount:4`, emitted by CefSharp, the embedded-Chromium host that Microsoft
 * Outlook's SafeLinks scanner runs when it pre-fetches a link in an email. It
 * arrives with no stack trace because no script of ours is ever on the stack. A
 * QR-tag product page is exactly the kind of URL that gets mailed around, so
 * this crawler keeps finding us and will not stop.
 *
 * This is a correctness fix, not tidying. The free Developer plan allows 5,000
 * errors a month; the measured rate was ~1,410/day, which exhausts the quota in
 * 3.5 days — after which Sentry drops EVERYTHING, including the first real
 * error. Filtering the noise is what keeps the signal affordable.
 *
 * Sentry matches these against the exception value AND the message, so a plain
 * substring is enough; regexes are used only where the id digit varies.
 */
export const IGNORED_ERRORS: (string | RegExp)[] = [
  /Object Not Found Matching Id:\d+/,
  // Injected by browser extensions, never by our bundle.
  /^ResizeObserver loop/,
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
]

/**
 * True when the event is a TRANSPORT failure — no HTTP response ever arrived, so
 * there is no status code to reason about.
 *
 * `TypeError: Failed to fetch` was the other 34% of that measurement (77 events,
 * 0 users), and it kept arriving after `ignoreErrors` landed: 26 events in the 12
 * hours to 2026-08-26T07:00Z, every one of them from DE/NL/IE/US/CH — datacentre
 * countries, zero from any geography a QR tag is scanned in — while
 * `GET https://viewer.wear-run.help/env/studio-soft.hdr` returned 200, 135,171
 * bytes, `cf-cache-status: HIT`. Link-preview scanners open the page, start the
 * 27 MB model, and are killed seconds later.
 *
 * (That byte count is the 2026-08-26 measurement and is left as recorded. The
 * file is 100,649 bytes since 2026-09-05, when the analytic placeholder was
 * replaced by a real studio map — see apps/viewer/scripts/gen-env-hdr.mjs. The
 * argument above turns on the request having SUCCEEDED, not on its size.)
 *
 * ⚠️ **This block used to say a cached 404 "surfaces as a fetch failure", and that
 * is FALSE — it is why the string was left unfiltered.** three.js never lets a
 * non-200 reach this predicate; it throws `HttpError` instead. Read at
 * three@0.183.2 `build/three.core.js:44022`:
 *
 *     throw new HttpError( `fetch for "${response.url}" responded with
 *       ${response.status}: ${response.statusText}`, response );
 *
 * So the 2026-08-06 incident — a freshly-written model unreachable from the public
 * URL while `artworkVerdict`, the filesize, the texture census and a HEAD request
 * were all green — would have arrived as `HttpError`, which `isHttpError` below
 * matches and `beforeSend` never rate-limits. Filtering this predicate cannot hide
 * it. Verify with the negative control in `sentry.test.ts` before widening either.
 */
export function isNetworkError(event: Record<string, unknown>): boolean {
  const exception = event.exception as { values?: { value?: string }[] } | undefined
  const value = exception?.values?.[0]?.value ?? (event.message as string | undefined) ?? ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(value)
}

/**
 * True when an HTTP response WAS received and was an error — 404, 403, 5xx.
 *
 * The actionable half, and the one that is never budgeted: a status code means a
 * server answered, so the failure is reproducible from a terminal and belongs to
 * this project rather than to whatever tore a scanner's browser down. This is the
 * shape the 2026-08-06 cached-404 arrives in.
 *
 * Matched on the exception TYPE first, because that is what three.js sets, and on
 * the message only as a fallback for a loader that formats its own string.
 */
export function isHttpError(event: Record<string, unknown>): boolean {
  const exception = event.exception as { values?: { type?: string; value?: string }[] } | undefined
  const first = exception?.values?.[0]
  const value = first?.value ?? (event.message as string | undefined) ?? ''
  return first?.type === 'HttpError' || /\bresponded with \d{3}\b/.test(value)
}

/**
 * Set once the page has started going away. A fetch that fails AFTER this is the
 * visitor navigating off mid-download, which on a 27 MB model is ordinary
 * behaviour rather than an incident. One that fails while the page is still live
 * still reports, which is the half that matters.
 *
 * `pagehide` rather than `beforeunload`: mobile Safari fires `beforeunload`
 * unreliably, and this app's traffic is QR scans from phones.
 */
let pageIsUnloading = false

/**
 * How many TRANSPORT failures one page-load may report before the rest are dropped.
 *
 * `pagehide` alone was not enough, and the measurement says why: a scanner whose
 * browser is destroyed outright never fires `pagehide`, so the flag above never
 * arms and every abandoned download reported in full. Worse, one torn-down context
 * aborts several requests at once — the HDR, the model, the poster — which is why
 * Sentry shows two and three identical events sharing a single second
 * (2026-08-26T07:02:14Z ×3, 06:04:09Z ×3).
 *
 * One per page-load keeps detection and removes the duplication: a genuine CDN
 * outage still reports once per visitor, so it arrives as a spike proportional to
 * real traffic, which is what an outage looks like anyway. A scanner storm cannot
 * multiply itself. NOT a substitute for isHttpError — that half is never counted.
 */
export const TRANSPORT_ERRORS_PER_PAGELOAD = 1
let transportErrorsSent = 0

export function initErrorTracking(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  void import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn,
      // Explicit, NOT `import.meta.env.MODE`. MODE is 'production' for every
      // `vite build`, so a preview or a local production build reported itself as
      // production and mixed into the same issue stream. There are no preview
      // deployments on this project (workers_dev and preview_urls are both off in
      // apps/viewer/wrangler.jsonc), so in practice this is 'production' from CI
      // and 'development' everywhere else.
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'development',
      // CI sets this to the deploy commit SHA. It MUST match the release the
      // source maps were uploaded under or every frame stays minified — that
      // mismatch is the single most common cause of unsymbolicated traces.
      release: import.meta.env.VITE_SENTRY_RELEASE,
      // Errors only — no performance/replay traffic, to stay comfortably inside
      // the free tier and send nothing the viewer doesn't need.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      maxBreadcrumbs: MAX_BREADCRUMBS,
      // Crawler and extension noise, dropped by the SDK before it costs quota.
      ignoreErrors: IGNORED_ERRORS,
      beforeSend: (event) => {
        const candidate = event as unknown as Record<string, unknown>
        // Returning null discards the event. The `!isHttpError` guard is what keeps
        // this a CAUSE test: anything carrying a status code is reproducible from a
        // terminal, so it passes through untouched however many arrive.
        if (isNetworkError(candidate) && !isHttpError(candidate)) {
          // Hidden covers the backgrounded tab a `pagehide` never follows.
          if (pageIsUnloading || document.visibilityState === 'hidden') return null
          if (transportErrorsSent >= TRANSPORT_ERRORS_PER_PAGELOAD) return null
          transportErrorsSent += 1
        }
        return scrub(candidate) as never
      },
    })

    window.addEventListener('pagehide', () => {
      pageIsUnloading = true
    })

    // Non-personal context, set once. Product and colourway are read at SEND time
    // rather than here (see below) because a visitor switches colourway without a
    // page load, so anything captured at init would be stale by the time it
    // mattered.
    Sentry.setTag('webglAvailable', String(canRender3D()))
    Sentry.setTag('coarsePointer', String(window.matchMedia('(pointer: coarse)').matches))

    Sentry.addEventProcessor((event) => {
      const route = currentRoute()
      event.tags = {
        ...event.tags,
        // Slugs, not names: `n001` / `wine` are printed on QR tags and are public
        // catalogue identifiers.
        product: route?.productSlug ?? '(unrouted)',
        colourway: route?.colourSlug ?? '(default)',
      }
      return event
    })
  })
}
