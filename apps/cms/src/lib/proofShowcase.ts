/**
 * №03's garment and the words around it (D43, owner, 2026-10-15/16): which garment it shows, how its
 * count reads, and how the chosen colour's pill is painted.
 */

/**
 * The Capsule Core Hoodie (owner, 2026-10-15). Until then №03 showed the first published garment with
 * a poster, the X-Milo Pro Bib (live, read 2026-10-16), which №02's Teamwear card also showed: one
 * garment twice on one page.
 */
export const PROOF_GARMENT = 'r-cch'

/**
 * The owner's garment, or, if it is ever retired, the first published garment with a poster (what №03
 * showed before), so the section never advertises a garment the gallery no longer carries.
 */
export function pickProofGarment<T extends { slug: string; posterUrl: string | null }>(
  products: readonly T[],
): T | null {
  return (
    products.find((product) => product.slug === PROOF_GARMENT && product.posterUrl) ??
    products.find((product) => product.posterUrl) ??
    null
  )
}

/** "41 garments", read live beside "See products in 3D" (owner, 2026-10-16); "1 garment" in a test database. */
export function garmentCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'garment' : 'garments'}`
}

/** WCAG 2.2's relative luminance of a `#rrggbb` colour; `null` for anything else. */
export function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return null
  const [r, g, b] = match.slice(1).map((pair) => {
    const c = Number.parseInt(pair, 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** The site's two fixed inks (packages/ui/src/tokens.css: the same in both themes). */
const INK = '#1d1f1a'
const PAPER = '#f1efea'

/**
 * How the chosen colour's pill is painted: in its own colour, with whichever of ink or paper reads
 * better on it, as long as that reaches 4.5:1 for the name; else on ink with paper words, the colour
 * then shown by the dot inside the pill alone.
 *
 * ⚠️ A MID-TONE CAN REACH 4.5:1 WITH NEITHER INK. Ink and paper tie at a luminance of about 0.19,
 * where both give 3.8:1, so a colour between about 0.15 and 0.23 (#808080 is 0.22) would put its
 * name under the contrast floor in either colour. The hoodie's five all clear it, the closest being
 * Bay Leaf / Matcha with paper at 4.75:1 (measured 2026-10-16); a later garment might not.
 */
export function pillPaint(swatch: string | null | undefined): {
  surface: 'swatch' | 'ink'
  text: string
} {
  const own = swatch ? luminance(swatch) : null
  if (own === null) return { surface: 'ink', text: PAPER }
  const ink = contrast(own, luminance(INK) ?? 0)
  const paper = contrast(own, luminance(PAPER) ?? 1)
  const best = Math.max(ink, paper)
  if (best < 4.5) return { surface: 'ink', text: PAPER }
  return { surface: 'swatch', text: ink >= paper ? INK : PAPER }
}
