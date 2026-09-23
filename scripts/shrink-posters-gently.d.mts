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

export declare const MEDIA_ORIGIN: string
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
