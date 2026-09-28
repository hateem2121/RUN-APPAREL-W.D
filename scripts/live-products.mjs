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
 * ⚠️ `colourways` ADDED 2026-09-05, AND IT IS NOT DECORATION. Until then each row
 * carried ONE colourway, so nothing offline could derive the 55 live URLs — which is
 * why `public/sitemap.xml` was a hand-typed snapshot with no test comparing it to
 * anything. On 2026-09-04 that file listed 10 URLs for 2 products while 11 were
 * live: 45 of 55 pages invisible to search, nothing red anywhere. `colourways` is
 * what lets a test close that loop.
 *
 * ⚠️ EVERY SLUG HERE IS COPIED FROM THE LIVE PAYLOAD, NEVER GUESSED OR PATTERNED.
 * A colourway slug is printed on a physical QR tag; inventing one that looks
 * plausible produces a URL that 404s a buyer holding the garment. Re-read them with:
 *
 *     curl -s https://cms.wear-run.help/api/public/viewer/<slug> | jq -r '.colourways[].slug'
 *
 * Verified 2026-09-05: these 55 are byte-identical to `public/sitemap.xml`, and each
 * row's `colourways[0]` equals its `colourway`. `liveProducts.test.ts` asserts that
 * second property so the two fields cannot drift apart.
 *
 * The `colourway` on each row is that product's FIRST row in the CMS, which is the one
 * a bare /<slug> resolves to — read from the live payload, never guessed, because a
 * colourway slug is printed on a physical QR tag.
 */

/**
 * @typedef {{ slug: string, colourway: string, colourways: string[], productCode: string }} LiveProduct
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
  {
    slug: 'rxps',
    colourway: 'wine',
    colourways: ['wine', 'blush', 'butter', 'lime', 'black'],
    productCode: 'R-XPS',
  },
  {
    slug: 'r-xmp',
    colourway: 'wine',
    colourways: ['wine', 'olive', 'lavender', 'white', 'mint'],
    productCode: 'R-XMP',
  },
  {
    slug: 'r-afp',
    colourway: 'petrol',
    colourways: ['petrol', 'mustard', 'sky', 'mauve', 'butter'],
    productCode: 'R-AFP',
  },
  {
    slug: 'r-atw',
    colourway: 'turquoise',
    colourways: ['turquoise', 'fuchsia', 'sage', 'bone', 'citron'],
    productCode: 'R-ATW',
  },
  {
    slug: 'r-atj',
    colourway: 'ash',
    colourways: ['ash', 'powder-blue', 'burgundy', 'sage', 'navy'],
    productCode: 'R-ATJ',
  },
  {
    slug: 'r-wzu',
    colourway: 'blush',
    colourways: ['blush', 'butter', 'powder-blue', 'beige', 'plum'],
    productCode: 'R-WZU',
  },
  {
    slug: 'r-mm',
    colourway: 'blush',
    colourways: ['blush', 'sky', 'sage', 'lilac', 'ash'],
    productCode: 'R-MM',
  },
  {
    slug: 'r-aj',
    colourway: 'indigo',
    colourways: ['indigo', 'magenta', 'tangerine', 'lime', 'pebble'],
    productCode: 'R-AJ',
  },
  {
    slug: 'r-ajm',
    colourway: 'bottle-green',
    colourways: ['bottle-green', 'terracotta', 'coral', 'beige', 'powder-blue'],
    productCode: 'R-AJM',
  },
  {
    slug: 'r-css',
    colourway: 'blush',
    colourways: ['blush', 'slate', 'sky', 'peach', 'lilac'],
    productCode: 'R-CSS',
  },
  {
    slug: 'r-asb',
    colourway: 'petrol',
    colourways: ['petrol', 'sage', 'pebble', 'blush', 'burgundy'],
    productCode: 'R-ASB',
  },
  // Added 2026-09-07 with the five garments from that day's exports. Every slug below was
  // read back out of the CMS after `publish-garment.mjs` set it, never guessed — which is
  // why these rows are added AFTER naming and BEFORE publishing, in that order: the naming
  // run stays `draft`, so the slugs exist to be copied while the page is still not live.
  {
    slug: 'r-cch',
    colourway: 'olive',
    colourways: ['olive', 'blush', 'mint', 'powder-blue', 'wine'],
    productCode: 'R-CCH',
  },
  {
    slug: 'r-gtd',
    colourway: 'ash',
    colourways: ['ash', 'blush', 'butter', 'powder-blue', 'optic-white'],
    productCode: 'R-GTD',
  },
  {
    slug: 'r-au',
    colourway: 'bone',
    colourways: ['bone', 'tangerine', 'lime', 'powder-blue', 'pebble'],
    productCode: 'R-AU',
  },
  {
    slug: 'r-ect',
    colourway: 'rust',
    colourways: ['rust', 'ash', 'mustard', 'lilac', 'sage'],
    productCode: 'R-ECT',
  },
  {
    slug: 'r-et',
    colourway: 'cream',
    colourways: ['cream', 'blush', 'sky', 'sage', 'burgundy'],
    productCode: 'R-ET',
  },
  // Added 2026-09-28 with 21 of the 24 garments processed on the owner's Mac (scripts/process-local.mjs).
  // r-cat, r-cvn and r-ttp stay drafts: their names re-wrap when Archivo arrives (fontSwap.spec.ts TY-02).
  // Same order as 2026-09-07: every slug was read back out of the CMS after the colour words were
  // set and switched on, while each garment was still a draft — never typed.
  {
    slug: 'r-srs',
    colourway: 'powder-blue',
    colourways: ['powder-blue', 'cream', 'mint', 'butter', 'charcoal'],
    productCode: 'R-SRS',
  },
  {
    slug: 'r-snp',
    colourway: 'olive',
    colourways: ['olive', 'teal', 'blue', 'mauve', 'rust'],
    productCode: 'R-SNP',
  },
  {
    slug: 'r-pps',
    colourway: 'maroon',
    colourways: ['maroon', 'blush', 'peach', 'olive', 'teal'],
    productCode: 'R-PPS',
  },
  {
    slug: 'r-prs',
    colourway: 'red',
    colourways: ['red', 'powder-blue', 'olive', 'periwinkle', 'pink'],
    productCode: 'R-PRS',
  },
  {
    slug: 'r-hfj',
    colourway: 'lime',
    colourways: ['lime', 'blush', 'orange', 'mustard', 'aqua'],
    productCode: 'R-HFJ',
  },
  {
    slug: 'r-vcj',
    colourway: 'burgundy',
    colourways: ['burgundy', 'sky', 'fuchsia', 'green', 'navy'],
    productCode: 'R-VCJ',
  },
  {
    slug: 'r-xmt',
    colourway: 'wine',
    colourways: ['wine', 'cream', 'lime', 'denim', 'slate'],
    productCode: 'R-XMT',
  },
  {
    slug: 'r-mrp',
    colourway: 'magenta',
    colourways: ['magenta', 'aqua', 'mustard', 'green', 'purple'],
    productCode: 'R-MRP',
  },
  {
    slug: 'r-taz',
    colourway: 'coral',
    colourways: ['coral', 'charcoal', 'teal', 'yellow', 'navy'],
    productCode: 'R-TAZ',
  },
  {
    slug: 'r-kmj',
    colourway: 'yellow',
    colourways: ['yellow', 'pink', 'teal', 'lime', 'orange'],
    productCode: 'R-KMJ',
  },
  {
    slug: 'r-alj',
    colourway: 'navy',
    colourways: ['navy', 'pink', 'green', 'teal', 'burgundy'],
    productCode: 'R-ALJ',
  },
  {
    slug: 'r-wct',
    colourway: 'lilac',
    colourways: ['lilac', 'burgundy', 'powder-blue', 'green', 'white'],
    productCode: 'R-WCT',
  },
  {
    slug: 'r-mss',
    colourway: 'lilac',
    colourways: ['lilac', 'olive', 'crimson', 'sky', 'yellow'],
    productCode: 'R-MSS',
  },
  {
    slug: 'r-zt',
    colourway: 'blush',
    colourways: ['blush', 'butter', 'powder-blue', 'lilac', 'burgundy'],
    productCode: 'R-ZT',
  },
  {
    slug: 'r-bcd',
    colourway: 'pink',
    colourways: ['pink', 'terracotta', 'mustard', 'mint', 'denim'],
    productCode: 'R-BCD',
  },
  {
    slug: 'r-mxt',
    colourway: 'blush',
    colourways: ['blush', 'green', 'teal', 'lilac', 'slate'],
    productCode: 'R-MXT',
  },
  {
    slug: 'r-vpj',
    colourway: 'blue',
    colourways: ['blue', 'magenta', 'orange', 'lime', 'purple'],
    productCode: 'R-VPJ',
  },
  {
    slug: 'r-csp',
    colourway: 'powder-blue',
    colourways: ['powder-blue', 'mauve', 'navy', 'sage', 'wine'],
    productCode: 'R-CSP',
  },
  {
    slug: 'r-fft',
    colourway: 'lime',
    colourways: ['lime', 'aqua', 'pink', 'orange', 'indigo'],
    productCode: 'R-FFT',
  },
  {
    slug: 'r-wsa',
    colourway: 'plum',
    colourways: ['plum', 'blush', 'olive', 'sky', 'cream'],
    productCode: 'R-WSA',
  },
  {
    slug: 'r-ifs',
    colourway: 'olive',
    colourways: ['olive', 'powder-blue', 'wine', 'navy', 'purple'],
    productCode: 'R-IFS',
  },
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
