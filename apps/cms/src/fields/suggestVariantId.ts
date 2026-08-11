/**
 * Pre-selecting the obvious colour match.
 *
 * SourceVariantSelect.tsx renders "Which colour in your CLO file is this?" — a
 * dropdown pointing a colour row at one of the colourways the shrink robot
 * found inside the uploaded file. When the row is called "Wine" and the robot
 * MEASURED a file colourway as wine, choosing it from that list is not a
 * decision — it is typing.
 *
 * All three conditions in suggestVariantId are required TOGETHER, never any
 * one alone:
 *   1. the field is still empty — this only fills a blank, it never overrides
 *      a choice the owner already made, including one that no longer matches
 *      anything in a re-uploaded file
 *   2. the row's own name matches a measured name, trimmed and
 *      case-insensitively
 *   3. that match is `high` confidence
 *
 * Condition 3 is the one that must never be loosened to "closest match". A
 * `low`-confidence guess applied automatically, with nobody in the loop, is
 * exactly how a maroon garment was published as "Navy" on 2026-08-03 — see
 * SourceVariantSelect.tsx's own header comment for the rest of that incident.
 * A low-confidence row still gets its swatch and its honest "not confident"
 * label there; it just never fills the dropdown by itself.
 *
 * Pure and Payload-free, same reason importColours.ts is: the decision can be
 * unit-tested with no DOM, no browser and no Payload bootstrap. The React
 * shell (reading form state, calling setValue) lives in SourceVariantSelect.tsx.
 */

/** One entry of the product's `fileColourDetails`, written by the shrink robot. */
export interface FileColourDetail {
  variantId: string
  hex: string
  name: string
  confidence: 'high' | 'low'
}

/**
 * `null` means "leave the field alone" — there is no other outcome. Callers
 * must not treat a `null` as an error; an unmatched or already-answered row is
 * the ordinary case, not a failure.
 */
export function suggestVariantId(
  rowName: string | undefined,
  details: FileColourDetail[],
  currentValue: string | undefined,
): string | null {
  // Suggestion only — an owner-entered value stands even if it no longer
  // matches anything below, or matches something with low confidence.
  if (currentValue) return null

  const name = (rowName ?? '').trim()
  if (name === '') return null

  const match = details.find(
    (detail) =>
      detail.confidence === 'high' && detail.name.trim().toLowerCase() === name.toLowerCase(),
  )
  return match ? match.variantId : null
}

/**
 * The sibling row field, derived rather than assumed.
 *
 * This field's own path is `colourways.<row index>.variantId` — Payload builds
 * every nested field path as `${parentPath}.${field.name}` (verified against
 * the @payloadcms/ui 3.86.0 actually installed here: `createNestedClientFieldPath`
 * does exactly that join, and the Array field's row path is `${path}.${i}` using
 * the row's numeric INDEX, not its `id`). A sibling field in the same row is
 * therefore always the same path with only the LAST segment swapped, regardless
 * of row index or how deeply the array is nested — which is why this walks
 * `path` instead of hardcoding a segment position.
 */
export function siblingPath(path: string, siblingField: string): string {
  const segments = path.split('.')
  segments[segments.length - 1] = siblingField
  return segments.join('.')
}
