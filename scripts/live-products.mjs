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
 * Verified live 2026-08-30:
 *   GET https://cms.wear-run.help/api/public/viewer/rxps/wine  -> 200
 *   GET https://cms.wear-run.help/api/public/viewer/r-xmp/wine -> 200 (X-MILO PRO BIB)
 */

/**
 * @typedef {{ slug: string, colourway: string, productCode: string }} LiveProduct
 */

/** @type {LiveProduct[]} */
export const LIVE_PRODUCTS = [
  { slug: 'rxps', colourway: 'wine', productCode: 'R-XPS' },
  { slug: 'r-xmp', colourway: 'wine', productCode: 'R-XMP' },
]

/**
 * The product a single-product check uses when none is named.
 *
 * Deliberately the FIRST entry rather than a second literal — a default written out
 * again is a second copy of the thing this file exists to de-duplicate.
 */
export const DEFAULT_PRODUCT = LIVE_PRODUCTS[0]

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
