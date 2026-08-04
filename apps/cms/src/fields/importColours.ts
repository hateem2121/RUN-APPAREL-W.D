/**
 * Turning the colours found inside a CLO file into colour rows on the product.
 *
 * WHY. On 2026-08-03 N001's file contained five colourways and the CMS mapped
 * three. The other two were invisible to every buyer, and nothing anywhere said
 * so — the owner would have had to open the GLB to find out they existed.
 *
 * WHAT THIS MUST NEVER DO, and each has its own test:
 *
 *   1. Rewrite an existing `slug`. It is printed on physical QR tags and cannot
 *      be recalled. A new row that collides gets a suffix; the old row is never
 *      touched.
 *   2. Reorder rows. The first switched-on row is the default colourway, so a
 *      reorder changes what a bare /n001 link resolves to — i.e. it repoints
 *      printed tags at a different garment.
 *   3. Switch anything on. Every imported row arrives `active: false`, so a
 *      human decides what reaches the live page.
 *   4. Guess. A low-confidence colour match arrives with an empty name for the
 *      owner to fill, because a confident wrong name is exactly how "Navy" came
 *      to be printed on a maroon garment.
 *
 * Pure and Payload-free so it can be unit-tested without a database or a browser;
 * ImportColoursFromFile.tsx is the thin React shell over it.
 */

/** One entry of the product's `fileColourDetails`, written by the shrink robot. */
export interface FileColour {
  variantId: string
  hex: string
  name: string
  slug: string
  deltaE: number
  confidence: 'high' | 'low'
}

/** Only the fields of an existing colour row this module looks at. */
export interface ExistingRow {
  variantId?: unknown
  slug?: unknown
}

export interface ImportedRow {
  displayName: string
  slug: string
  hexSwatch: string
  variantId: string
  active: false
}

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Colours inside the file that no colour row points at yet. */
export function unmappedFileColours(
  fileColours: FileColour[],
  rows: ExistingRow[],
): FileColour[] {
  const claimed = new Set(rows.map((row) => trimmed(row.variantId)).filter((id) => id !== ''))
  return fileColours.filter((colour) => !claimed.has(colour.variantId))
}

/**
 * Build the row to append for one file colour.
 *
 * `taken` is every existing slug on the product. A collision gets `-2`, `-3`, …
 * rather than reusing or editing the existing one — see rule 1 above.
 */
export function buildImportedRow(colour: FileColour, rows: ExistingRow[]): ImportedRow {
  // A poor match contributes a swatch and nothing else. The hex is measured off
  // the file; the NAME is the part that was guessed, and a wrong one printed on
  // a colour button is worse than a blank the owner has to fill in.
  if (colour.confidence !== 'high') {
    return {
      displayName: '',
      slug: '',
      hexSwatch: colour.hex,
      variantId: colour.variantId,
      active: false,
    }
  }

  const taken = new Set(rows.map((row) => trimmed(row.slug)).filter((slug) => slug !== ''))
  let slug = colour.slug
  let suffix = 1
  while (taken.has(slug)) {
    suffix += 1
    slug = `${colour.slug}-${suffix}`
  }

  return {
    displayName: colour.name,
    slug,
    hexSwatch: colour.hex,
    variantId: colour.variantId,
    active: false,
  }
}

/** Parse the product's `fileColourDetails` json defensively. */
export function toFileColours(value: unknown): FileColour[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const variantId = trimmed(record.variantId)
    const hex = trimmed(record.hex)
    if (variantId === '' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return []
    return [
      {
        variantId,
        hex,
        name: trimmed(record.name),
        slug: trimmed(record.slug),
        deltaE: typeof record.deltaE === 'number' ? record.deltaE : Number.POSITIVE_INFINITY,
        confidence: record.confidence === 'high' ? 'high' : 'low',
      },
    ]
  })
}
