import { GARMENT_PATH_PREFIX, parseViewerPath } from '@run-apparel/shared'
import { SITE_ORIGIN } from '../src/lib/siteLinks'
import { isWellKnownPath } from './notFound'
import { workerResponseHeaders } from './securityHeaders'

/**
 * The viewer's address until the domain move of 2026-09-28.
 *
 * Owner decisions that day: the garment pages live on the website at
 * `wear-run.com/products/<product>/<colour>`, and every old address forwards there with a
 * permanent (301) redirect FOR EVER — thousands of QR tags printed with this host are on
 * garments in buyers' hands. So the custom domain stays attached to this Worker, and this
 * is all it does on it.
 */
export const OLD_VIEWER_HOST = 'viewer.wear-run.help'

/**
 * ⚠️ ONE DAY, NOT THE BROWSER'S DEFAULT. A 301 with no Cache-Control is cached by a
 * browser for as long as it likes, so if the cutover had to be undone (wear-run.com handed
 * back to the email project's Worker) every phone that scanned a tag during it would keep
 * jumping to the new address. A day bounds that; the redirect itself never changes.
 */
const REDIRECT_CACHE = 'public, max-age=86400'

/**
 * Where a request to the old viewer host goes, or null when it is not one.
 *
 * - A garment, in either address shape → the same garment and colour under /products.
 * - `/` (the old host's bare address) → the /products listing, the nearest page.
 * - Anything else → the same path on the website, which serves the viewer's own files
 *   (apps/cms/viewerForward.mjs) and gives everything else its honest 404.
 *
 * The query string is kept everywhere. `robots.txt`, `sitemap.xml`, `llms.txt`, `sw.js`
 * and the build's files never reach this: `run_worker_first` (wrangler.jsonc) serves them
 * straight from Static Assets. That is right for a site move — Google's move guidance is
 * to keep the old sitemap up so the crawler finds the old addresses and sees the 301s —
 * and an installed service worker keeps updating instead of failing on a redirect. Its
 * page requests are network-first (scripts/sw.mjs), so it follows the 301 too.
 *
 * Only the exact host: this same Worker answers the website's forwarded garment pages
 * (host wear-run.com), local previews and the e2e server.
 */
export function oldViewerHostRedirect(request: Request): Response | null {
  const url = new URL(request.url)
  if (url.hostname !== OLD_VIEWER_HOST) return null

  const route = isWellKnownPath(url.pathname) ? null : parseViewerPath(url.pathname)
  let path = url.pathname
  if (route) {
    const colour = route.colourSlug ? `/${route.colourSlug}` : ''
    path = `${GARMENT_PATH_PREFIX}/${route.productSlug}${colour}`
  } else if (url.pathname === '/') {
    path = GARMENT_PATH_PREFIX
  }

  return new Response(null, {
    status: 301,
    headers: {
      ...workerResponseHeaders(),
      Location: `${SITE_ORIGIN}${path}${url.search}`,
      'Cache-Control': REDIRECT_CACHE,
    },
  })
}
