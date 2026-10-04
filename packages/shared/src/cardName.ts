/**
 * A garment name's words, with each hyphenated one marked to stay in one piece on its card.
 *
 * ⚠️ A BROWSER MAY BREAK A LINE AFTER A HYPHEN, AND ON A TWO-UP PHONE CARD IT DID. Measured
 * 2026-10-02 with the live catalogue's 40 names in the real card: "V-" at the end of one line and
 * "NECK" on the next at 390px (ZIP-UP too, and SCUBA-NECK, METRO-SHIELD and ARMOR-TECH at
 * 320-375px). The owner's call that day: a name shrinks to fit rather than split a word (site.css,
 * `.product-card__name` below 560px), and V-NECK and ZIP-UP stay whole. CSS cannot take the break
 * opportunity away from a hyphen, so `ProductCardItem` wraps each such word in
 * `.product-card__word`, which moves to the next line whole and still wraps inside itself when it
 * alone is wider than the card, so nothing is ever clipped.
 *
 * Shared since polish S6 (2026-10-04): a garment page's "More from this category" cards are two to
 * a row on a phone as well, and keep the same rule (`RelatedGarments.tsx`, `.related__word`).
 *
 * A dash with a space either side ("TEE - BLACK") or a hyphen at a word's edge is not a compound and
 * is left alone. `at` is the segment's place in the name: a stable key that is not an array index.
 */
export type NameSegment = { text: string; whole: boolean; at: number }

export function nameSegments(name: string): NameSegment[] {
  const segments: NameSegment[] = []
  const pieces = /\S+|\s+/g
  for (let match = pieces.exec(name); match; match = pieces.exec(name)) {
    segments.push({ text: match[0], whole: /\S-\S/.test(match[0]), at: match.index })
  }
  return segments
}
