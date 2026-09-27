import { viewerApiPath } from '@run-apparel/shared'

/**
 * Start the garment's API request while the app's JavaScript is still downloading.
 *
 * WHY. Real visitors' largest paint (`events.lcp_ms`, the viewer's own beacon) was read on
 * 2026-09-27: 11 iPhone visits over 23-25 Sep, median 1.9 s, slowest 3.6 s, 6 of 11 under
 * Google's 2.5 s "good" line. The poster that paints first has no address until the API
 * answers, and the app cannot ask until its bundle has downloaded and run — so every
 * visit paid for the bundle and the API one after the other. A `Link: rel=preload` on the
 * HTML lets the browser run them side by side. It adds nothing to the HTML's own time to
 * first byte: the Worker never waits for the API here, which is the whole reason previews
 * are crawler-only (see `index.ts`).
 *
 * ⚠️ A PRELOAD THE APP DOES NOT MATCH IS WORSE THAN NONE: the phone downloads the payload
 * twice. Measured in Chromium 2026-09-27 with the app's exact `fetch` options (an `accept`
 * header and an `AbortSignal`): matching preload → the app's fetch resolved in 1 ms, one
 * request; no preload → 306 ms, one request; preload WITHOUT `crossorigin` → two requests.
 * So `crossorigin` is required (the app's fetch is a CORS request), and the URL comes
 * from the same `viewerApiPath` the app uses. `e2e/apiPreload.spec.ts` re-measures the
 * request count on every engine CI runs, including both Safaris.
 */

/**
 * The API origin the production app is built against (`VITE_API_BASE_URL`, defaulting to
 * this in `ci.yml` and `src/lib/api.ts`). Read off the live viewer's CSP `connect-src` on
 * 2026-09-27. `apiPreload.test.ts` pins it to `scripts/csp.mjs`'s `FALLBACK_API_ORIGIN`
 * and to `index.html`'s preconnect, which make the same assumption.
 */
export const CMS_API_ORIGIN = 'https://cms.wear-run.help'

/** `origin` exists for `e2e/apiPreload.spec.ts`, which serves the API from a local port. */
export function apiPreloadLink(
  route: { productSlug: string; colourSlug: string | null },
  origin: string = CMS_API_ORIGIN,
): string {
  return `<${origin}${viewerApiPath(route.productSlug, route.colourSlug)}>; rel=preload; as=fetch; crossorigin=anonymous`
}

/** Adds the preload to a 200 HTML page. Anything else passes through untouched. */
export function withApiPreload(
  response: Response,
  route: { productSlug: string; colourSlug: string | null },
): Response {
  if (response.status !== 200) return response
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response
  // `new Response(body, response)` keeps every header `_headers` put on the asset —
  // the CSP included — which a hand-built Response would not (`securityHeaders.ts`).
  const next = new Response(response.body, response)
  next.headers.append('Link', apiPreloadLink(route))
  return next
}
