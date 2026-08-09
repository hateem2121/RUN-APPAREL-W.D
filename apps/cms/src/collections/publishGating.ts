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
  /**
   * What the pipeline concluded about the printed artwork on the attached model.
   * `'damaged'` blocks; `'ok'` and absent/null do not. Absent is the honest value
   * for every file uploaded before this check existed.
   */
  artworkVerdict?: string | null
  /** Free text. Any non-blank value lets a `'damaged'` model publish anyway. */
  artworkOverrideReason?: unknown
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

/**
 * The fields whose value decides whether a product may be published. A write that
 * leaves all of them untouched cannot make the product any more or less
 * publishable, so re-running the gate on it achieves nothing.
 */
export const GATED_FIELDS = ['status', 'variantMode', 'glbAsset', 'colourways'] as const

/**
 * Did a LIVE product just lose its verified colour mapping?
 *
 * `fileColours` is deliberately absent from GATED_FIELDS above: gating it once
 * blocked the shrink robot's own write on a published-but-model-less product,
 * which prevented recovery from exactly the state the gate was complaining
 * about (Products.ts documents the incident in full).
 *
 * That is the right call and it leaves a gap. Re-upload a garment whose CLO
 * colourways are named differently and a published product's stored variantIds
 * stop matching the file: the colour buttons on the live page quietly select
 * nothing. Refusing the write would re-create the 2026-07-29 bug; saying nothing
 * is how the page stays broken. So this reports rather than blocks.
 *
 * Only the true → false transition is worth a word. Already-broken is not news,
 * and a draft is allowed to be half-finished — that is what drafts are for.
 */
export function becameUnverifiedWhilePublished(
  status: unknown,
  before: unknown,
  after: unknown,
): boolean {
  return status === 'published' && before === true && after === false
}

/**
 * Reduce a value to something comparable across representations. Uploads and
 * relationships arrive as a bare id in one place and a populated document in
 * another depending on depth; both mean the same thing, and a naive comparison
 * would call that a change.
 */
function fingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fingerprint)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    // A populated relationship/upload reduces to its id.
    if ('id' in record && !('slug' in record)) return record.id
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      if (key === 'id') continue // array-row ids are noise
      out[key] = fingerprint(record[key])
    }
    return out
  }
  return value ?? null
}

/**
 * True when `data` changes at least one of `fields` relative to `originalDoc`.
 *
 * Fails SAFE: anything it cannot compare cleanly reads as changed, so the caller
 * re-runs its checks rather than skipping them.
 */
export function changesAnything(
  fields: readonly string[],
  data: Record<string, unknown> | undefined,
  originalDoc: Record<string, unknown> | undefined,
): boolean {
  // A create has nothing to compare against — always check.
  if (!originalDoc) return true
  if (!data) return false
  return fields.some((field) => {
    if (!(field in data)) return false
    try {
      return (
        JSON.stringify(fingerprint(data[field])) !== JSON.stringify(fingerprint(originalDoc[field]))
      )
    } catch {
      return true
    }
  })
}

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

  assertArtworkAcceptable(input)
}

/**
 * For a B2B garment reference the printed artwork IS the product, so a model
 * with a torn logo is worse than no model: it publishes silently and passes
 * every other check. N001 shipped exactly that on 2026-07-29 and the system
 * never noticed — a human saw holes in the wordmark.
 *
 * `null`/absent means nobody checked, which is true of every file uploaded
 * before this existed. Treating unknown as damaged would make the entire
 * existing catalogue unpublishable the moment this deploys, so unknown passes.
 *
 * The override exists because a gate with no way past it gets worked around
 * instead of used — and the reason is required so the decision is recoverable
 * six months later rather than a mystery checkbox.
 */
function assertArtworkAcceptable(input: PublishGateInput): void {
  if (input.artworkVerdict !== 'damaged') return
  if (text(input.artworkOverrideReason) !== '') return
  // The remedy is deliberately NOT "re-upload at Highest quality" any more.
  // `damaged` covers two mechanisms with different fixes, and this message
  // prescribed the decimation one for both until 2026-08-04: Detail moves the
  // triangle budget, so it does nothing for a graphic that came out see-through
  // or boxed over, which is an alphaMode decision made identically at every
  // level. Sending the owner at the one knob guaranteed not to move is worse
  // than saying "read the report".
  throw new Error(
    'The printed artwork on this model was damaged when the file was shrunk, so publishing it would ' +
      'show buyers a torn logo. Read the Report on the raw upload — it names the parts and says which ' +
      'kind of damage it was. If the logos are SMEARED, upload the file again with the Detail setting ' +
      'on “Highest quality — bigger file”. If they are SEE-THROUGH, boxed over, or missing, Detail will ' +
      'not change anything: the graphic needs re-exporting from CLO on its own opaque piece. If this ' +
      'garment genuinely has no printed artwork, write why in “Publish anyway — reason” on the 3D file, ' +
      'and it will publish.',
  )
}
