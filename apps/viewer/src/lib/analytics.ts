import type { ViewerAnalyticsEvent } from '@run-apparel/shared'

/**
 * Cloudflare Web Analytics only — cookieless, no fingerprinting, no
 * third-party trackers. The beacon auto-tracks page views (including SPA
 * history changes). Cloudflare's beacon exposes no custom-event API, so the
 * named viewer events are emitted through a DOM CustomEvent seam (and the
 * dev console) — a single place to integrate if richer analytics are ever
 * approved. No form data, names, emails or device fingerprints are ever
 * collected.
 *
 * `initAnalytics()` lived here until 2026-08-09 and injected the beacon at
 * runtime from a VITE_CF_BEACON_TOKEN build variable. It was dead TWICE OVER,
 * and both reasons are worth knowing before anyone re-adds it:
 *
 *   1. The variable was never set — `gh variable list` has no
 *      VITE_CF_BEACON_TOKEN, so ci.yml baked in an empty string and the
 *      function returned on its first line, on every build, forever.
 *   2. Even with a token it would have returned anyway: its own guard checks
 *      for `script[data-cf-beacon]`, and index.html carries exactly that.
 *
 * The beacon is a real `<script src>` in index.html DELIBERATELY, not by
 * oversight — scripts/csp.mjs explains why an edge-injected one can never be
 * hashed. Injecting it from JavaScript would put a second copy on the page.
 */

export function track(event: ViewerAnalyticsEvent, detail?: Record<string, string>): void {
  document.dispatchEvent(new CustomEvent('run:analytics', { detail: { event, ...detail } }))
  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, detail ?? '')
  }
}
