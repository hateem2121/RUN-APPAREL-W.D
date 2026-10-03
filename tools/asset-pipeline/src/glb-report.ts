import type { SpecCheck } from './gltf-spec'
import type { ArtworkAlphaProblem, CrushedArtwork, SoftArtworkOnBlend } from './texture-artwork'
import type { VariantColour } from './variant-colour'

/*
 * The shape of a validation report, and the two pieces of validate.ts the shrink Worker
 * reads, kept in a file of their own so that the Worker's typecheck never reaches
 * validate.ts. validate.ts re-exports all three, so nothing else had to change.
 *
 * ⚠️ WHY THIS FILE EXISTS (2026-10-03). apps/shrink typechecks container/report.ts under
 * Cloudflare's Worker types and no Node types. Importing ANYTHING from validate.ts, even
 * with `import type`, puts that whole file in the program (`tsc --explainFiles` named
 * report.ts and containerReport.test.ts as the only importers), and readGlbGenerator's
 * Node Buffer calls fail there on every @cloudflare/workers-types from 5.20260808.1 on.
 * That held the package at 5.20260804.1 in apps/shrink from 2026-08-12 to 2026-10-03
 * (docs/DEPENDENCY-HOLDS.md). Keep this file free of Node imports, and keep apps/shrink
 * importing from here, never from validate.ts (apps/cms/src/dependencyPolicy.test.ts).
 */

/**
 * Warn when a production GLB is heavier than this — QR scans are mobile-first.
 *
 * DELIBERATELY A SECOND COPY of `SIZE_WARNING_BYTES` in
 * `packages/shared/src/media.ts`, not an import. This package is installed with
 * plain `npm install` inside the shrink container's Docker image
 * (apps/shrink/Dockerfile), where a `workspace:*` dependency cannot resolve — so
 * depending on @run-apparel/shared here would break the container build.
 *
 * The copies are pinned equal by a drift test in validate.test.ts, which is the
 * same arrangement GLB_HARD_MAX_BYTES already has at
 * apps/cms/src/collections/mediaRules.test.ts:94. Two unpinned copies of a
 * number the CMS enforces and the pipeline reports against is how a file passes
 * `validate` and is then rejected on upload.
 */
export const SIZE_WARNING_BYTES = 8 * 1024 * 1024

export interface GlbReport {
  file: string
  bytes: number
  /** KHR_materials_variants names actually bound to primitives — what <model-viewer> will report as availableVariants. Sorted; use `variantsInFileOrder` when position matters. */
  variants: string[]
  /**
   * The same names, in the order the file DECLARES them.
   *
   * `variants` is sorted, which is right for set comparison and wrong for
   * anything positional. The CMS shows this list to the owner so they can point
   * each of their colours at one of the names CLO happened to use — so "the
   * second colourway in the file" has to still be second here.
   */
  variantsInFileOrder: string[]
  meshCount: number
  primitiveCount: number
  materialCount: number
  textureCount: number
  /** The glTF asset.generator string, e.g. "CLO Standalone OnlineAuth" for a raw CLO export. */
  generator: string
  /** Count of textures still stored as raw PNG/JPEG (should be WebP or KTX2). */
  uncompressedTextureCount: number
  /** Count of materials with alphaMode BLEND — translucent, will render see-through (no OIT in model-viewer). */
  translucentMaterialCount: number
  /**
   * UV sets the materials actually sample, e.g. [0, 1]. Informational on its
   * own — `prune()` renumbers a lone second set down to 0 before decimation.
   * The hazard is materials sampling two or more sets at once; see the warning
   * that `offUv0Warning` produces.
   */
  texCoordsInUse: number[]
  /** Material counts by alphaMode, e.g. { OPAQUE: 12, MASK: 1 }. */
  alphaModeCounts: Record<string, number>
  /**
   * Printed-artwork textures stored below CRUSHED_BYTES_PER_PIXEL. Advisory —
   * a flat label encodes just as small as a smashed wordmark — but it is the
   * cheapest measurement of the reported damage, and it was sitting unwired in
   * textures.ts while the automated path published a file that trips it.
   */
  crushedArtwork: CrushedArtwork[]
  /**
   * Artwork materials left translucent, or whose MASK threshold drifted off 0.5.
   * Structural rather than statistical, so unlike `crushedArtwork` this one is
   * safe to block a publish on. Since 2026-09-02 `blend` means a print the opaque
   * step would have cut out or made solid is STILL blended — a pipeline regression —
   * and never a print the step chose to keep soft; those are `artworkSoftOnBlend`.
   */
  artworkAlphaProblems: ArtworkAlphaProblem[]
  /**
   * Printed artwork the pipeline deliberately left translucent: soft-edged alpha, an
   * explicit sheer factor from CLO's opacity slider, or a picture it could not read.
   * Reported loudly and NEVER refused — the 2026-09 audit found the old gate refusing
   * finished garments for exactly the decision solidifyMaterials had just made.
   */
  artworkSoftOnBlend: SoftArtworkOnBlend[]
  /**
   * A suggested colour name per variant, read from the file itself. Purely
   * advisory: the CMS shows it beside the variant so the owner cannot map
   * "Navy" onto a maroon garment without seeing the mismatch. Nothing here ever
   * renames a colourway — see variant-colour.ts.
   */
  variantColours: VariantColour[]
  /**
   * Khronos glTF-Validator's verdict on this file.
   *
   * ⚠️ THIS JUDGES OUR OUTPUT, NOT THE CUSTOMER'S EXPORT. All 28 raw CLO exports
   * are spec-valid; what is not guaranteed valid is what this pipeline writes —
   * quantised geometry, re-encoded textures, thousands of rewritten alphaModes,
   * and a JSON chunk patched byte-wise by `repair-dead-textures.ts`. Nothing else
   * in this repo checks that. `spec.errors` is structural with no false-positive
   * case, which is the same bar the other blocking gates meet; warnings and infos
   * are reported and never block. See gltf-spec.ts for what it deliberately does
   * NOT catch.
   */
  spec: SpecCheck
  warnings: string[]
}

/** One phrase per soft print, e.g. "RUN BRUSH LOGO (soft edges — 51% of pixels part-transparent)". */
export function describeSoftArtwork(soft: SoftArtworkOnBlend): string {
  const why =
    soft.reason === 'sheer-factor'
      ? `declared ${Math.round(soft.factor * 100)}% opaque in CLO`
      : soft.reason === 'undecodable'
        ? 'picture could not be read'
        : `soft edges — ${Math.round(soft.midFraction * 100)}% of pixels part-transparent`
  return `${soft.material} (${why})`
}
