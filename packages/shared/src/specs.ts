/**
 * THE GARMENT'S FACTS AS FOUR GROUPS OF BULLETS (polish D10, owner-approved 2026-10-03; Q4, Q18).
 *
 * Fabric, Weight, Fit and Performance, each a list even with one item, so all four look alike:
 * "things that look alike are read as belonging together" (NN/g, "Similarity Principle in Visual
 * Design", 6 Sep 2020). On a computer each group sits in a corner of the 3D window; elsewhere they
 * sit under the description, in two columns that mirror the corners (the viewer's SpecGroups).
 *
 * Each bullet may carry a one-line note that opens under it. The notes are the glossary in
 * `specNotes.ts`, looked up by the bullet's words (`noteKey`), so a term reads the same on every
 * garment that lists it: the 40 live garments list 187 features but only 158 different ones
 * (counted 2026-10-04), which is the 158 of the owner's answer Q18.
 *
 * Built by the CMS for the garment data (`ViewerProduct.specs`), and by the viewer from the plain
 * fields, without notes, when an answer cached before the field existed has none.
 */

export type SpecGroupKey = 'fabric' | 'weight' | 'fit' | 'performance'

export interface SpecItem {
  /** The bullet's words, as the CMS holds them. */
  text: string
  /** One line saying what it means for the buyer, or null when the glossary has none. */
  note: string | null
}

export interface SpecGroup {
  key: SpecGroupKey
  heading: string
  items: SpecItem[]
}

export const SPEC_HEADINGS: Record<SpecGroupKey, string> = {
  fabric: 'Fabric',
  weight: 'Weight',
  fit: 'Fit',
  performance: 'Performance',
}

/**
 * A fabric's parts, one per bullet: "85% Recycled Polyester / 15% Spandex" is two. Every live
 * composition separates its parts with " / " (all 40 read 2026-10-04, e.g. "Shell: 100% Polyester
 * Taslon / Lining: 100% Polyester Taffeta"), and a slash with no spaces is kept whole, so a name
 * that contains one is not cut.
 */
export function fabricParts(composition: string): string[] {
  return (
    composition
      // One space-like character each side is enough to find " / ", and the trim below takes the
      // rest. `\s+\/\s+` re-scans a run of spaces from every position (the code scan, PR #128).
      .split(/\s\/\s/)
      .map((part) => part.trim())
      .filter(Boolean)
  )
}

/**
 * The glossary's key for a bullet: lower case, single spaces, without a "Shell:"-style label or a
 * percentage, so "85% Recycled Polyester" and "100% Recycled Polyester" share one note.
 */
export function noteKey(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/^\s*[a-z]+:\s*/, '')
      // Every number is matched once, and dropped only when a "%" follows it. Requiring the "%"
      // made a run of digits with none re-scan from every digit (the code scan, PR #128).
      .replace(/\d+(?:\.\d+)?(\s*%\s*)?/g, (number, percent) => (percent ? '' : number))
      .replace(/\s+/g, ' ')
      .trim()
  )
}

type SpecFields = {
  fabricComposition: string
  gsm: string
  garmentFit: string
  performanceFeatures: readonly string[]
}

/**
 * The four groups, in corner order (Fabric, Weight, Fit, Performance), each with its bullets; a
 * group with nothing in it is left out. `noteFor` supplies the notes (the CMS passes `specNote`);
 * without it every note is null.
 */
export function specGroups(
  product: SpecFields,
  noteFor: (group: SpecGroupKey, text: string) => string | null = () => null,
): SpecGroup[] {
  const item = (group: SpecGroupKey, text: string): SpecItem => ({
    text,
    note: noteFor(group, text),
  })
  const one = (text: string) => (text.trim() ? [text.trim()] : [])
  const lists: Record<SpecGroupKey, string[]> = {
    fabric: fabricParts(product.fabricComposition),
    weight: one(product.gsm),
    fit: one(product.garmentFit),
    performance: product.performanceFeatures.map((feature) => feature.trim()).filter(Boolean),
  }
  return (Object.keys(SPEC_HEADINGS) as SpecGroupKey[])
    .map((key) => ({
      key,
      heading: SPEC_HEADINGS[key],
      items: lists[key].map((text) => item(key, text)),
    }))
    .filter((group) => group.items.length > 0)
}
