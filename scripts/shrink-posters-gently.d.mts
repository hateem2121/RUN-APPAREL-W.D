/** Types for `shrink-posters-gently.mjs`, so a TypeScript test can import it (same shape as live-products.d.mts). */

export interface WebpSettings {
  quality: number
  alphaQuality: number
  effort: number
  smartSubsample: boolean
}

export interface KnownFile {
  bytes: number
  /** lowercase hex sha256 */
  sha256: string
}

export interface GentleTrim {
  /** A LIVE_PRODUCTS slug. */
  product: string
  colour: string
  settings: WebpSettings
  /** The live poster before this task. */
  original: KnownFile
  /** What `reencode(original bytes, settings)` must produce. */
  approved: KnownFile
}

/**
 * A relation Payload populated instead of leaving bare — carries whatever fields the
 * related collection has (a Media doc's `url`, `filename`, `mimeType`, …), which is
 * why this is an index signature rather than a closed `{ id }`: a real populated
 * poster relation is not just an id with no other properties.
 */
export interface PopulatedRelation {
  id: number | string
  [key: string]: unknown
}

/**
 * A row of `Product.colourways`, as Payload sends and stores it. Relation fields
 * (`posterPreview`, `glbAsset`) may arrive bare (an id) or populated
 * (`PopulatedRelation`) depending on `depth` — see `idOf`.
 */
export interface ColourwayRow {
  id: number | string
  slug: string
  displayName: string
  variantId: string
  posterPreview: number | string | PopulatedRelation | null
  altText: string
  hexSwatch: string
  glbAsset: number | string | PopulatedRelation | null
  active: boolean
  note: string
}

export declare const VEST: WebpSettings
export declare const GENTLE_TRIMS: GentleTrim[]

export declare function sha256(bytes: string | Uint8Array): string
export declare function reencode(bytes: Buffer, settings: WebpSettings): Promise<Buffer>
export declare function reencodeProblems(original: Buffer, result: Buffer): Promise<string[]>
export declare function idOf(value: unknown): number | string | null
export declare function repointedColourways(
  rows: ColourwayRow[],
  idsBySlug: Map<string, number | string>,
): ColourwayRow[]
export declare function readBackProblems(sent: ColourwayRow[], stored: ColourwayRow[]): string[]
export declare function looksLikeInstructionText(key: string): boolean

/**
 * A verdict on a poster's CURRENT bytes against one GentleTrim, from
 * `posterState` (`shrink-posters-gently.mjs`) — resolved through the real
 * product/media relation, never a guessed filename: 'done' (already the approved
 * trim), 'ready' (still the known original, safe to re-encode), or 'changed'
 * (neither — stop).
 *
 * Named `TrimVerdict`, not `PosterVerdict` (M6, 2026-09-23) — `poster-sizes.d.mts`
 * exports its OWN unrelated `PosterVerdict` ('ok' | 'excepted' | 'flagged'), and the
 * two were never the same type despite sharing a name.
 */
export type TrimVerdict = 'done' | 'ready' | 'changed'

export interface PosterState {
  state: TrimVerdict
  /** Byte length of the CURRENT poster this was judged from. */
  bytes: number
  /** sha256 of the CURRENT poster this was judged from. */
  sha256: string
}

export declare function posterState(bytes: Uint8Array, trim: GentleTrim): PosterState

/** One colour's classification, carried alongside the trim it was judged against. */
export interface TrimState extends PosterState {
  trim: GentleTrim
}

export interface ProductWritePlan {
  /** Colours still needing a re-encode/upload this run. */
  toTrim: TrimState[]
  /** Colours already at the approved bytes — left untouched. */
  alreadyDone: TrimState[]
  /** One message per 'changed' colour; non-empty means apply() must stop. */
  problems: string[]
  /** False only when every colour is 'done' — a second full run is a no-op. */
  needsWrite: boolean
}

export declare function planProductWrite(states: TrimState[]): ProductWritePlan

/** A Media document as listed at `depth=0` — only the fields this script reads. */
export interface MediaListing {
  id: number | string
  filename?: string
  url?: string
}

export declare function candidateUploads(
  mediaDocs: MediaListing[],
  trim: GentleTrim,
): { id: number | string; url: string }[]

export declare function findExistingUpload(
  mediaDocs: MediaListing[],
  trim: GentleTrim,
): Promise<{ id: number | string; url: string } | null>

/**
 * Thrown by dryRun()/apply() in place of `process.exit()`, so a test can catch a
 * stop (`.rejects.toBeInstanceOf(Stop)`) instead of losing the test process to a
 * real exit. `code` is what `main()` passes to the real `process.exit` when this
 * reaches the top, for the one real CLI invocation.
 */
export declare class Stop extends Error {
  code: number
  constructor(code: number)
}

/** One row of dryRun()'s report — one per trim, never aggregated. */
export interface DryRunRow {
  trim: GentleTrim
  /** The live poster URL this row was judged from; null when it could not be found at all. */
  url: string | null
  status: 'done' | 'ready' | 'problem'
  note: string
}

/**
 * Round 2 (2026-09-23): now exported and takes `trims` as a parameter — see the
 * .mjs file's own doc comment on `dryRun` for why a test cannot use the real
 * GENTLE_TRIMS (its hashes are real production bytes with no local copy).
 */
export declare function dryRun(trims?: GentleTrim[]): Promise<DryRunRow[]>

/**
 * Round 2 (2026-09-23): now exported and takes the key and `trims` as parameters
 * — see the .mjs file's own doc comment on `apply` for why (a test supplies its
 * own fake key and skips the interactive prompt entirely; the owner's real
 * invocation passes neither and is unchanged). Throws `Stop` on any fatal
 * condition instead of calling `process.exit`.
 */
export declare function apply(providedKey?: string, trims?: GentleTrim[]): Promise<void>
