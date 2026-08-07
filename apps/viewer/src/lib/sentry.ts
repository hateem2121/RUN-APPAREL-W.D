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
      beforeSend: (event) => scrub(event as unknown as Record<string, unknown>) as never,
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
