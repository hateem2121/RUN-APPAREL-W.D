/**
 * Publish-gating rules for Products — pure, so the security-critical invariants
 * are unit-testable without a database. The Products.beforeChange hook is a thin
 * adapter that resolves the fields and calls this.
 *
 * Colours now arrive inline on the product document rather than as separate
 * `colourways` rows, so this no longer needs a database read at all. Three
 * invariants disappeared with the old shape and are NOT missing by accident:
 *
 *   - "exactly one default colourway"    → the topmost switched-on colour is the
 *                                          default, so it cannot be violated
 *   - "product default == marked default" → there is only one place to state it
 *   - "variantId starts with the product code" → a colour's variantId is now the
 *                                          name CLO chose, which we neither
 *                                          control nor need to
 *
 * What replaces the last one is stronger: the name must actually be present in
 * the file the robot processed.
 */

export interface PublishGateInput {
  id: unknown
  status: string | undefined
  variantMode: string | undefined
  glbAsset: unknown
  variantsVerified: unknown
}

/** One colour of the product, flattened to just what the gate cares about. */
export interface GateColourway {
  displayName: string
  active: boolean
  /** The colour's name inside the CLO file, chosen by the owner. */
  variantId: string
  hasPoster: boolean
  hasAltText: boolean
  hasOwnGlb: boolean
}

/** An upload/relationship value is an id, a populated doc, or nothing. */
const isSet = (value: unknown): boolean => {
  if (value == null || value === '') return false
  if (typeof value === 'object') return 'id' in (value as Record<string, unknown>)
  return true
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Normalise raw array rows from the document into the gate's flat shape. */
export function toGateColourways(rows: unknown): GateColourway[] {
  if (!Array.isArray(rows)) return []
  return rows.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>
    return {
      displayName: text(row.displayName) || text(row.slug) || 'Untitled colour',
      // `active` defaults to true, so only an explicit false hides a colour.
      active: row.active !== false,
      variantId: text(row.variantId),
      hasPoster: isSet(row.posterPreview),
      hasAltText: text(row.altText).length > 0,
      hasOwnGlb: isSet(row.glbAsset),
    }
  })
}

/** The names the shrink robot reported from inside the processed CLO file. */
const toFileColours = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/**
 * "Colours checked" is derived, never typed. It is true when there is something
 * to check against and every colour on show points at a colour that is really
 * inside the processed file.
 */
export function deriveVariantsVerified(colourways: GateColourway[], fileColours: unknown): boolean {
  const available = toFileColours(fileColours)
  if (available.length === 0) return false
  const shown = colourways.filter((c) => c.active)
  if (shown.length === 0) return false
  return shown.every((c) => c.variantId !== '' && available.includes(c.variantId))
}

const list = (names: string[]): string => names.map((n) => `“${n}”`).join(', ')

/**
 * Throw a plain-English Error if the product may NOT be published. A no-op for
 * non-published saves. Every message names the colour at fault, because "invalid"
 * costs the owner a round-trip to work out which of five rows it meant.
 */
export function assertPublishable(input: PublishGateInput, colourways: GateColourway[]): void {
  if (input.status !== 'published') return

  const active = colourways.filter((c) => c.active)
  if (active.length === 0) {
    throw new Error(
      colourways.length === 0
        ? 'This product has no colours yet. Add at least one on the Colours tab before publishing.'
        : 'Every colour is switched off, so there would be nothing to show. Tick “Show this colour on the website” for at least one.',
    )
  }

  const noPoster = active.filter((c) => !c.hasPoster).map((c) => c.displayName)
  if (noPoster.length > 0) {
    throw new Error(
      `${list(noPoster)} ${noPoster.length === 1 ? 'has' : 'have'} no photo. Add “Photo of this colour” on the Colours tab, or switch the colour off.`,
    )
  }

  const noAlt = active.filter((c) => !c.hasAltText).map((c) => c.displayName)
  if (noAlt.length > 0) {
    throw new Error(
      `${list(noAlt)} ${noAlt.length === 1 ? 'needs' : 'need'} a photo description, so people using a screen reader know what the picture shows. Add it on the Colours tab.`,
    )
  }

  if (input.variantMode === 'separate-glb-per-colour') {
    const missing = active.filter((c) => !c.hasOwnGlb).map((c) => c.displayName)
    if (missing.length > 0) {
      throw new Error(
        `This product is set to “A separate file for each colour”, so every colour needs its own 3D file. ${list(missing)} ${missing.length === 1 ? 'is' : 'are'} missing one.`,
      )
    }
    return
  }

  // ── "One file with all colours" ────────────────────────────────────────────
  if (!isSet(input.glbAsset)) {
    throw new Error(
      'There is no finished 3D file yet, so the page would show an empty space where the garment should spin. Upload your CLO file on the “3D file” tab and pick the finished file once it says Ready to review.',
    )
  }

  if (!input.variantsVerified) {
    const unmatched = active.filter((c) => c.variantId === '').map((c) => c.displayName)
    throw new Error(
      unmatched.length > 0
        ? `${list(unmatched)} ${unmatched.length === 1 ? 'has' : 'have'} no colour picked from your CLO file. Open the Colours tab and answer “Which colour in your CLO file is this?” for each — the colour buttons will not work otherwise.`
        : 'The colours you picked do not match what is inside the processed file. Re-check “Which colour in your CLO file is this?” on the Colours tab, or upload the file again.',
    )
  }
}
