import { GARMENT_PATH_PREFIX } from '@run-apparel/shared'

/**
 * Whether a path lives under the `/.well-known/` prefix RFC 8615 reserves for
 * site metadata — so it can never be a product or colourway page, whatever
 * `parseViewerPath` makes of it.
 *
 * ⚠️ MEASURED 2026-09-24: `GET /.well-known/ai-catalog.json` answered 200 with
 * the SPA shell, because `normalizeSlug` strips the dot out of `.well-known`
 * and out of `ai-catalog.json` before checking the slug pattern, so each
 * segment comes out looking like an ordinary (if unpublished) slug —
 * `well-known` / `ai-catalog-json` — and `parseViewerPath` accepted the pair as
 * a two-segment product route. Lighthouse 13.5.0's `agentic-browsing/
 * ard-schema` audit fetches exactly that path and turned the live Lighthouse
 * robot (`lighthouse-live.yml`) red on every run: a 200 whose body is never the
 * ARD manifest the audit expects is a failure, where a 404 is "not applicable".
 * `/.well-known/security.txt` never reaches this function — `worker/index.ts`
 * answers it earlier, before any route is parsed.
 */
export function isWellKnownPath(pathname: string): boolean {
  return pathname.split('/').filter(Boolean)[0] === '.well-known'
}

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
  if (pathname === '/') return false
  if (method !== 'GET') return false
  if (!(contentType ?? '').includes('text/html')) return false
  // RFC 8615's reserved prefix is never a product page, however the shared
  // slug parser happened to read it — see `isWellKnownPath` above. Checked
  // ahead of `routeParsed` because that is exactly the flag this defect
  // defeated.
  if (isWellKnownPath(pathname)) return true
  // A single segment carrying a dot is a FILE somebody asked for and we do not
  // have — never a product page.
  //
  // ⚠️ THIS DOCBLOCK NAMED `/manifest.webmanifest` AS ONE OF THE THREE CASES THE
  // FIX EXISTS FOR, AND IT WAS NOT ONE OF THEM. Measured live 2026-09-05, months
  // after this shipped:
  //
  //     GET /manifest.webmanifest  -> 200 text/html
  //     GET /favicon.ico           -> 200 text/html   (every browser asks, unbidden)
  //
  // Cause: `normalizeSlug('manifest.webmanifest')` returns `manifest-webmanifest`,
  // a perfectly valid slug, so `parseViewerPath` accepts it, `routeParsed` is true
  // and the guard above returns before it can decide anything. The comment
  // described behaviour the code had never had.
  //
  // ⚠️ FIXED HERE AND NOT IN `normalizeSlug`. That function is the contract three
  // Workers agree on, and `packages/shared` has roughly one uncovered line and ZERO
  // uncovered functions of coverage headroom — a change there is both riskier and
  // more expensive than a rule in the one place that is deciding a status code.
  //
  // A dot cannot appear in a real product or colourway slug: they are kebab-case
  // identifiers printed on QR tags, and `normalizeSlug` strips a dot to a hyphen
  // rather than preserving it, so no live URL can reach this branch.
  //
  // The website's garment folder (`/products/<file>`, since the domain move of 2026-09-28)
  // is looked past first, or a missing file there is two segments and escapes this rule.
  const all = pathname.split('/').filter(Boolean)
  const segments = `/${all[0]}` === GARMENT_PATH_PREFIX ? all.slice(1) : all
  if (segments.length === 1 && segments[0]?.includes('.')) return true
  if (routeParsed) return false
  return true
}

/**
 * Whether the CMS said, in so many words, that this garment does not exist.
 *
 * ⚠️ THE ROBOT-ONLY HALF OF THE LIMIT ABOVE (owner: yes, 2026-09-30). `shouldReturnNotFound`
 * leaves a well-formed but unknown garment at 200, because a person's request must never
 * wait on the CMS. A search robot's request ALREADY waits on it, to build the preview, so
 * for a robot the answer is free. Measured live that day as Googlebot: `/products/nope/nope`
 * answered 200 with the generic shell, a soft 404 that spends crawl budget on a page that
 * can never rank.
 *
 * ⚠️ EXACTLY 404, AND NOTHING ELSE. A timeout, a 5xx or a 429 means the CMS could not
 * answer, not that the garment is gone. Telling Google "not found" during an outage would
 * start removing live garments from search, which is a far worse failure than a soft 404;
 * those cases keep today's behaviour (200 and the generic page).
 */
export function isMissingGarment(cmsStatus: number | null): boolean {
  return cmsStatus === 404
}
