/**
 * A fact's value, split into the numbers the count-up animates and the text between them.
 * `'100,000'` → one number; `'21–45'` → two numbers around an en dash. Anything else is
 * `null`, and the caller shows the value as the plain text it already is — a count-up must
 * never be the reason a figure reads NaN.
 */
export type FactPart = { n: number } | { sep: string }

const NUMBER = /^\d{1,3}(?:,\d{3})*$|^\d+$/

export function parseFactValue(value: string): FactPart[] | null {
  const pieces = value.trim().split(/(–)/)
  if (pieces.length === 0 || pieces[0] === '') return null
  const parts: FactPart[] = []
  for (const piece of pieces) {
    if (piece === '–') {
      parts.push({ sep: piece })
      continue
    }
    if (!NUMBER.test(piece)) return null
    const n = Number(piece.replaceAll(',', ''))
    if (!Number.isFinite(n)) return null
    parts.push({ n })
  }
  return parts
}
