/** Lowercase URL-safe slug: letters/digits separated by single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value)
}

/**
 * Normalise arbitrary input (QR typos, trailing slashes, uppercase) into a
 * candidate slug. Returns null when nothing slug-like remains.
 */
export function normalizeSlug(value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > 0 && isValidSlug(slug) ? slug : null
}

/**
 * The website folder the garment pages live in: `wear-run.com/products/<product>/<colour>`.
 *
 * Owner decision 2026-09-28, when the viewer moved off `viewer.wear-run.help` onto the
 * website's own domain. The CATEGORY is deliberately NOT in the address: it is an editable
 * dropdown ("Used for grouping only.", `apps/cms/src/collections/Products.ts`), so an edit
 * would break every printed QR tag for that garment, and Google's own starter guide says
 * words in a URL "have hardly any effect beyond appearing in breadcrumbs".
 */
export const GARMENT_PATH_PREFIX = '/products'

/** True for a path inside the garment folder (`/products/<product>[/<colour>]`), never the listing itself. */
export function isGarmentPagePath(pathname: string): boolean {
  return pathname.startsWith(`${GARMENT_PATH_PREFIX}/`)
}

/**
 * Parse a viewer path into product + colourway slugs.
 *
 * Two shapes are valid, each with or without the `/products` folder in front:
 *   /n001/navy          → { productSlug: 'n001', colourSlug: 'navy' }
 *   /n001               → { productSlug: 'n001', colourSlug: null }
 *   /products/n001/navy → { productSlug: 'n001', colourSlug: 'navy' }
 *
 * The bare shape is the one printed on the tags before 2026-09-28; `viewer.wear-run.help`
 * serves it until the move and forwards it for ever after, so it must keep parsing.
 *
 * `colourSlug: null` means "no colour was requested", which the server answers
 * with the default colour and NOT the retired-colourway notice — nothing was
 * retired. Before this, /n001 rendered the "reference unavailable" page for a
 * product that was published and working, which is what a tag printed with only
 * the product code, or a buyer trimming the URL, actually produces.
 *
 * A two-segment path whose colour segment is unparseable stays a hard null: a
 * mangled colour is a broken link, not an unspecified one.
 */
export function parseViewerPath(
  pathname: string,
): { productSlug: string; colourSlug: string | null } | null {
  const all = pathname.split('/').filter(Boolean)
  // The folder name alone is the website's listing page, never a garment called "products".
  const segments = `/${all[0]}` === GARMENT_PATH_PREFIX ? all.slice(1) : all
  if (segments.length < 1 || segments.length > 2) return null
  const productSlug = normalizeSlug(decodeURIComponent(segments[0]!))
  if (!productSlug) return null
  if (segments.length === 1) return { productSlug, colourSlug: null }
  const colourSlug = normalizeSlug(decodeURIComponent(segments[1]!))
  if (!colourSlug) return null
  return { productSlug, colourSlug }
}

/**
 * The public API path for a viewer route, as BOTH the app and the viewer's Worker ask for it.
 *
 * `colourSlug: null` drops the colour segment rather than sending it empty or stringified:
 * `/n001/null` and `/n001/` are both read by the API as a mangled colour and 404.
 *
 * ⚠️ ONE FUNCTION FOR BOTH SIDES, AND THAT IS THE POINT (2026-09-27). The Worker sends a
 * `Link: rel=preload` for this URL so the browser starts the request while the app's
 * JavaScript is still downloading. A preload is reused only when the app later asks for
 * the IDENTICAL URL; a one-character difference makes the phone download the payload
 * twice, silently, which is slower than no hint at all.
 */
export function viewerApiPath(productSlug: string, colourSlug: string | null): string {
  return colourSlug === null
    ? `/api/public/viewer/${encodeURIComponent(productSlug)}`
    : `/api/public/viewer/${encodeURIComponent(productSlug)}/${encodeURIComponent(colourSlug)}`
}

/**
 * A garment page's path. `prefix` is `GARMENT_PATH_PREFIX` on the website and `''` on the
 * old viewer host, so a colour change keeps the visitor on the address shape they arrived on.
 */
export function buildViewerPath(
  productSlug: string,
  colourSlug: string,
  prefix: '' | typeof GARMENT_PATH_PREFIX = '',
): string {
  return `${prefix}/${productSlug}/${colourSlug}`
}
