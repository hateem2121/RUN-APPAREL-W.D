import { type ViewerApiSuccess, viewerApiPath } from '@run-apparel/shared'
import { seamPictureUrl } from '../src/lib/garmentContour'
import { placeholderAsset } from '../src/lib/placeholder'
import { embeddedPayloadScript } from './embeddedPayload'

/**
 * A PERSON'S GARMENT PAGE CARRIES ITS OWN DATA WHEN THE EDGE HAS IT IN TIME (owner, 2026-11-15).
 *
 * WHY. The page drew its largest picture only after three steps in a row: the HTML, then the
 * garment's data from `cms.wear-run.help`, then the poster, whose address arrives with that data.
 * Measured 2026-11-15:
 *   - real visits (`events.lcp_ms`, 28 days, 468 garment pages): p75 2,408 ms; phones 3,108 ms (106);
 *     the Kaizen ball 3,544 ms (26);
 *   - Chrome trace, live `rxps/wine`, Slow 4G and 4x CPU: LCP 4,703 ms, of it 3,528 ms "load delay";
 *     the data's request was sent at 1.12 s on an open connection and answered at 4.60 s, and the
 *     poster was fetched at 4.63 s ("discoverable in initial document: FAILED");
 *   - from Sialkot, 8 tries each: a person's HTML 0.17-0.74 s to first byte; a robot's, for which
 *     this Worker already fetches the data first, 0.09-1.36 s; the data alone from a browser
 *     0.10-2.81 s.
 * So the robot's way no longer costs what it did on 2026-08-08 (`index.ts`, 1.8-2.3 s then, before
 * the CMS kept these answers at the edge on 2026-10-07), and it removes the middle step.
 *
 * ⚠️ BOUNDED, SO A SLOW ANSWER COSTS AT MOST `PERSON_PAYLOAD_BUDGET_MS`. Past the budget the page is
 * sent exactly as before (with the API preload), and the fetch still finishes in the background, so
 * it is kept for the next visitor (`loadPayload`'s cache).
 *
 * ⚠️ MARKED AS A PERSON'S COPY. A robot's copy shows a picture and never asks for the 3D file
 * (`PosterReason` 'crawler'); the app reads `data-for` to tell them apart, and anything not marked
 * "person" is still a robot's, as every copy was before this day.
 */
export const PERSON_PAYLOAD_BUDGET_MS = 300

/** `work`'s result, or null once `ms` have passed. `work` keeps running either way. */
export function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let stop = () => {}
  const late = new Promise<null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    stop = () => clearTimeout(timer)
  })
  return Promise.race([work, late]).finally(() => stop())
}

/** Escape a value for an attribute in appended markup. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Ask for the poster with the HTML, exactly as the stage will ask for it (address AND mode), or a
 * phone downloads it twice (garmentContour.ts has the 243,042-byte measurement). Only a garment
 * with a 3D file draws that poster; without one the stage draws the HD copy instead, so nothing is
 * preloaded there.
 */
export function posterPreload(payload: ViewerApiSuccess): string {
  const { product, selectedColourway } = payload
  const separate = product.variantMode === 'separate-glb-per-colour'
  const has3D = Boolean(separate ? selectedColourway.glbUrl : product.glbUrl)
  const poster = placeholderAsset(selectedColourway, product)
  if (!has3D || !poster?.url) return ''
  return `<link rel="preload" as="image" href="${attr(seamPictureUrl(poster.url))}" crossorigin="anonymous" fetchpriority="high" />`
}

/** What a person's page gains in its head: the poster's preload, then the data. */
export function personHeadMarkup(
  payload: ViewerApiSuccess,
  route: { productSlug: string; colourSlug: string | null },
): string {
  return (
    posterPreload(payload) +
    embeddedPayloadScript(payload, viewerApiPath(route.productSlug, route.colourSlug), 'person')
  )
}

/**
 * ⚠️ NO VALIDATOR ON A COPY THAT CARRIES DATA. The plain page's `ETag` answers a browser's
 * revalidation with 304 (live, 2026-11-15), and the browser would then show the copy it kept,
 * with the data it held that day. Without `ETag` or `Last-Modified` it must fetch again.
 * `no-transform` stays, for the reason `noTransform.ts` gives.
 */
export function personPageHeaders(headers: Headers): Headers {
  headers.delete('etag')
  headers.delete('last-modified')
  headers.set('cache-control', 'private, max-age=0, no-transform')
  return headers
}

/**
 * The asset request without the browser's validators, so the page comes back whole (200) and can
 * carry the data. A 304 would leave nothing to add it to.
 */
export function withoutValidators(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.delete('if-none-match')
  headers.delete('if-modified-since')
  return new Request(request, { headers })
}
