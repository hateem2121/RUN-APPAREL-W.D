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
 * Parse a viewer path into product + colourway slugs.
 *
 * Two shapes are valid:
 *   /n001/navy → { productSlug: 'n001', colourSlug: 'navy' }
 *   /n001      → { productSlug: 'n001', colourSlug: null }
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
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length < 1 || segments.length > 2) return null
  const productSlug = normalizeSlug(decodeURIComponent(segments[0]!))
  if (!productSlug) return null
  if (segments.length === 1) return { productSlug, colourSlug: null }
  const colourSlug = normalizeSlug(decodeURIComponent(segments[1]!))
  if (!colourSlug) return null
  return { productSlug, colourSlug }
}

export function buildViewerPath(productSlug: string, colourSlug: string): string {
  return `/${productSlug}/${colourSlug}`
}
