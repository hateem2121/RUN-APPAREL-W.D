/**
 * The live products, in one place.
 *
 * WHY THIS FILE EXISTS. On 2026-08-30 an audit found the second live product,
 * `r-xmp` (X-MILO PRO BIB), was verified by NOTHING. Every automated check resolved
 * to `rxps`: scripts/smoke-viewer-payload.mjs, scripts/smoke-viewer-preview.mjs,
 * scripts/perf-probe.mjs (both targets) and uptime.yml's VIEWER_URL. The only thing
 * that iterated both was `.claude/skills/check-live/check-live.mjs`, which no
 * workflow runs. A garment could have lost its model and every gate would have
 * stayed green — the same shape as the 2026-08-15 incident where `n001` 404'd in
 * production while two post-deploy gates defaulted to it and went red only after a
 * merge.
 *
 * A shared list still drifts on a rename. The difference is that it drifts in ONE
 * place and fails EVERYTHING at once, loudly, instead of one gate going quietly
 * green — which is the failure mode this repo keeps paying for.
 *
 * ⚠️ A COLOURWAY SLUG IS PRINTED ON PHYSICAL QR TAGS. Never guess one, and never
 * let an automated process rewrite one. See CLAUDE.md → "Colour names are read from
 * the file, not typed".
 *
 * ⚠️ THE SAME GAP REOPENED ON 2026-09-04, NINE PRODUCTS WIDE. Nine catalogue
 * garments were published that day and this list still named two, so
 * scripts/smoke-live-products.mjs — the post-deploy gate written to end exactly this
 * failure — verified 2 of 11 live products, and scripts/perf-probe.mjs timed the same
 * two. A gate does not narrow with a rename here; it narrows when the CATALOGUE grows
 * and the list does not. **Publishing a product means adding its row below**, and the
 * row is not a formality: without it nothing checks that garment's model is fetchable
 * the way a QR scan fetches it.
 *
 * Verified live 2026-09-04 — every row below measured, not typed:
 *   GET /api/public/viewer/<slug>          -> 200, 5 active colourways, for all 11
 *   GET /<slug>/<colourway> (viewer shell) -> 200 in 0.03-0.10 s  (perf ceiling 2.5 s)
 *   GET /api/public/viewer/<slug>/<colour> -> 200 in 0.52-0.85 s  (perf ceiling 6 s)
 * The `colourway` on each row is that product's FIRST row in the CMS, which is the one
 * a bare /<slug> resolves to — read from the live payload, never guessed, because a
 * colourway slug is printed on a physical QR tag.
 */

/**
 * @typedef {{ slug: string, colourway: string, productCode: string }} LiveProduct
 */

/**
 * @type {LiveProduct[]}
 *
 * Order is load-bearing: `DEFAULT_PRODUCT` below is the first entry, and three
 * single-product checks resolve to it (smoke-viewer-payload, smoke-viewer-preview,
 * apex-probe). `rxps` stays first so those keep measuring the garment their recorded
 * baselines were taken against.
 */
export const LIVE_PRODUCTS = [
  { slug: 'rxps', colourway: 'wine', productCode: 'R-XPS' },
  { slug: 'r-xmp', colourway: 'wine', productCode: 'R-XMP' },
  { slug: 'r-afp', colourway: 'petrol', productCode: 'R-AFP' },
  { slug: 'r-atw', colourway: 'turquoise', productCode: 'R-ATW' },
  { slug: 'r-atj', colourway: 'ash', productCode: 'R-ATJ' },
  { slug: 'r-wzu', colourway: 'blush', productCode: 'R-WZU' },
  { slug: 'r-mm', colourway: 'blush', productCode: 'R-MM' },
  { slug: 'r-aj', colourway: 'indigo', productCode: 'R-AJ' },
  { slug: 'r-ajm', colourway: 'bottle-green', productCode: 'R-AJM' },
  { slug: 'r-css', colourway: 'blush', productCode: 'R-CSS' },
  { slug: 'r-asb', colourway: 'petrol', productCode: 'R-ASB' },
]

/**
 * The product a single-product check uses when none is named.
 *
 * Deliberately the FIRST entry rather than a second literal — a default written out
 * again is a second copy of the thing this file exists to de-duplicate.
 */
export const DEFAULT_PRODUCT = LIVE_PRODUCTS[0]

/**
 * Is this product slug covered by the post-deploy gates?
 *
 * Extracted so it can be tested BOTH WAYS rather than only asserted. Inline in
 * scripts/publish-garment.mjs the refusal was unreachable in any test: that script
 * refuses a published product before it gets there, and every draft is refused earlier
 * still for having no finished model — so the one branch that stops a live garment from
 * going ungated could never be exercised. A guard nobody can make fail is the shape this
 * repo keeps paying for.
 *
 * @param {string} slug
 * @returns {boolean}
 */
export const isGatedProduct = (slug) => LIVE_PRODUCTS.some((p) => p.slug === slug)

/**
 * Compare product codes with non-alphanumerics stripped.
 *
 * ⚠️ `slug` and `productCode` are DIFFERENT FIELDS whose values merely coincided
 * until 2026-08-17, when `RXPS` became `R-XPS` and `smoke-viewer-preview.mjs` — which
 * derived the expected code as `slug.toUpperCase()` — demanded `RXPS` while the page
 * truthfully said `R-XPS`. A working rewrite failed its own gate. Both sides compare
 * squashed now; keep it that way.
 *
 * @param {string} value
 * @returns {string}
 */
export const squashCode = (value) =>
  String(value ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
