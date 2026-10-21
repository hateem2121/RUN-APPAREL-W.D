import type { ViewerApiSuccess } from '@run-apparel/shared'

/**
 * Hand a search robot the garment's payload inside the page, so its renderer never has to
 * fetch it from the CMS host.
 *
 * WHY (2026-10-21). Eight garments stayed out of Google for weeks while their pages answered
 * 200, named themselves canonical and carried no noindex. Search Console's live test on
 * `r-au/bone` finally said why: "Excluded by 'noindex' tag". Google's renderer had loaded the
 * page, its request to `cms.wear-run.help/api/public/viewer/r-au/bone` failed ("Other error";
 * the page's own log: `viewer-load-failed … failure: network, Failed to fetch` at 28 s), and
 * the app drew `UnreachableState`, which adds `<meta name="robots" content="noindex">` on
 * purpose (`src/components/States.tsx`). The request was rejected. The same hour `r-xmt/wine`
 * passed the same test, so the failure is Google's fetcher, intermittent, and can reach any
 * garment already indexed on its next recrawl. Nothing on our side differed: robots.txt
 * allows the path, CORS answers wear-run.com, and every garment's payload takes 1.3-1.9 s
 * cold. Google's own guidance (JavaScript SEO basics, updated 2026-03-04) is that a noindex
 * changed by JavaScript is unreliable and server-side rendering is "still a great idea".
 *
 * The Worker already holds this payload for a crawler: `loadPayload` fetched it to write the
 * head. Until now the app threw that away and asked again. A person never takes this path
 * (previews are crawler-only, `index.ts` says why), so no visitor's page grows by a byte.
 *
 * ⚠️ IN THE HEAD, NOT IN `#root`. React replaces `#root`'s children when it mounts, which is
 * before the app's first effect reads this, so a block inside `#root` is gone when it is
 * looked for.
 *
 * ⚠️ `<` IS ESCAPED, NOT JUST `</script`. A garment description containing `</script>` would
 * otherwise end the block early and run the rest as markup. `<` is the same character
 * to `JSON.parse`, and escaping every `<` also covers `<!--`, which changes how the HTML
 * parser reads a script's text.
 *
 * `type="application/json"` is a data block: the browser never executes it, so the page's
 * hash-based CSP (`scripts/csp.mjs`) has nothing to allow.
 */

/** The element's id. The app reads it in `src/lib/embeddedPayload.ts`. */
export const EMBEDDED_PAYLOAD_ID = 'viewer-payload'

/**
 * The markup to append to the head. `apiPath` is `viewerApiPath(route…)`: the request the
 * app would otherwise make, so the app can tell this payload answers its own route.
 */
export function embeddedPayloadScript(payload: ViewerApiSuccess, apiPath: string): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  const path = apiPath.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `<script type="application/json" id="${EMBEDDED_PAYLOAD_ID}" data-path="${path}">${json}</script>`
}
