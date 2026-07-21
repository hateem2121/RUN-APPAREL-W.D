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
 * Parse a viewer path ("/n001/navy") into product + colourway slugs.
 * Returns null when the path does not match /:productSlug/:colourSlug.
 */
export function parseViewerPath(
  pathname: string,
): { productSlug: string; colourSlug: string } | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length !== 2) return null
  const productSlug = normalizeSlug(decodeURIComponent(segments[0]!))
  const colourSlug = normalizeSlug(decodeURIComponent(segments[1]!))
  if (!productSlug || !colourSlug) return null
  return { productSlug, colourSlug }
}

export function buildViewerPath(productSlug: string, colourSlug: string): string {
  return `/${productSlug}/${colourSlug}`
}
