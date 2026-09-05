/**
 * Whether a request that reached the SPA fallback should carry a 404 status.
 *
 * ⚠️ EVERY UNKNOWN URL ON THIS HOST ANSWERED "200 OK" UNTIL 2026-09-04. Measured:
 * `/a/b/c`, `/rxps/nonexistent` and `/manifest.webmanifest` all returned 200 with
 * the SPA shell. To a crawler that is a SOFT 404 — a page insisting everything is
 * fine while showing an error — which wastes crawl budget on a site whose real
 * problem is that only 2 of 11 products were discoverable at all.
 *
 * ⚠️ THE BODY IS UNCHANGED, AND THAT IS THE WHOLE DESIGN. A bare "Not found" would
 * hand a human who scanned a worn QR tag a raw browser error instead of the branded
 * "REFERENCE UNAVAILABLE" screen with Email and WhatsApp on it — on the one page
 * where the visitor arrived with intent and got nothing. The SPA still renders; only
 * the status line changes. Humans see the recovery path, crawlers see 404.
 *
 * ⚠️ THE NARROW VERSION, BY OWNER DECISION 2026-09-04. This 404s only paths that
 * CANNOT be a product page — `parseViewerPath` returning null: three or more
 * segments, an empty or malformed slug, a bad percent-escape. A well-formed but
 * non-existent product like `/nope/wine` still returns 200, because deciding
 * otherwise means asking the CMS on every request, and that hop was measured at
 * 0.56-0.72s and explicitly declined (`worker/index.ts` records the 20x reasoning).
 * The page still adds `<meta name="robots" content="noindex">` for that case.
 *
 * Three exclusions, each for its own reason:
 *   - `/` is the site root, not a broken link. It parses to null like everything
 *     else here, so without this it would 404 the homepage.
 *   - Non-GET: a 404 on a HEAD or OPTIONS says something different, and nothing
 *     about this decision was measured for them.
 *   - Non-HTML: a real file that Static Assets served — robots.txt, sitemap.xml, a
 *     font — is not a missing page. Checking the CONTENT TYPE rather than a list of
 *     known paths is what keeps this correct as files are added, the same reasoning
 *     the `/og/` branch in index.ts already uses.
 */
export function shouldReturnNotFound(args: {
  pathname: string
  method: string
  routeParsed: boolean
  contentType: string | null
}): boolean {
  const { pathname, method, routeParsed, contentType } = args
  if (routeParsed) return false
  if (pathname === '/') return false
  if (method !== 'GET') return false
  return (contentType ?? '').includes('text/html')
}
