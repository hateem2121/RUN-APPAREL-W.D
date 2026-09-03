import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Document, Transform } from '@gltf-transform/core'
import { dedup, draco, meshopt, prune } from '@gltf-transform/functions'
import { ktx2 } from 'ktx2-encoder/gltf-transform'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { createIO, readGlb } from './io'
import {
  estimateGpuTextures,
  foldConstantTextures,
  type FoldResult,
  type GpuEstimate,
} from './texture-fold'
import { censusRawDocument, type RawCensus } from './raw-census'
import type { DeadTextureRepair } from './repair-dead-textures'
import { remapUvRanges, UV_QUANTIZE_BITS, type UvRemapResult } from './uv-remap'
import { alignVariantTexCoords } from './variant-texcoord'
import { DEFAULT_STITCH_PATTERN, type TopstitchResult, reduceTopstitch } from './topstitch'
import { type PbrNormalizeResult, normalizePbr } from './pbr-normalize'
import { type AlphaProfile, NO_ALPHA_PROFILE, profileAlpha, resolveBlendAlpha } from './textures'
import {
  type AttributeSimplifier,
  type SimplifyTexturedResult,
  simplifyTextured,
} from './simplify-textured'
import {
  type TextureArtworkResult,
  compressTexturesForArtwork,
  isArtworkMaterialByName,
  isArtworkTextureByName,
} from './texture-artwork'

/**
 * Shared optimisation transforms for production GLBs. Both `merge` (multi-
 * colourway) and the single-file `optimize` command build their transform
 * chain here, so the compression policy lives in one tested place.
 *
 * Texture compression is the dominant win for CLO exports — raw CLO GLBs are
 * mostly uncompressed PNG/JPEG maps.
 *   - 'webp' (default): re-encodes via sharp — universal, no runtime decoder,
 *     the safe everyday choice.
 *   - 'ktx2': GPU-compressed Basis Universal (KHR_texture_basisu) — smallest
 *     VRAM footprint and the best-practice production target; <model-viewer>
 *     v4.3+ decodes it natively (its Basis transcoder loads from gstatic, which
 *     the viewer CSP already allows). Slower to encode; opt in with --ktx2.
 * Geometry compression (Draco or Meshopt) is opt-in and evaluated per product.
 */

/**
 * 'none' keeps original formats; 'webp' re-encodes every texture to WebP;
 * 'ktx2' encodes to Basis Universal (ETC1S for colour, UASTC for normal maps).
 */
export type TextureCodec = 'none' | 'webp' | 'ktx2'
/** Geometry codec: Meshopt decodes far faster on low-end mobile; Draco is smaller. */
export type GeometryCodec = 'none' | 'draco' | 'meshopt'

export interface OptimizeOptions {
  /** Texture re-encoding. Default 'none' (callers opt in; the CLI defaults to 'webp'). */
  texture?: TextureCodec
  /** Max texture width/height in px, aspect preserved. Applied only when texture !== 'none'. Default 2048. */
  maxTextureSize?: number
  /** WebP quality 1–100 / KTX2 ETC1S quality 1–255. Default 82. */
  textureQuality?: number
  /**
   * WebP quality for textures carrying printed artwork (logos, wordmarks,
   * decals), which are detected rather than declared — see texture-artwork.ts.
   * Higher than `textureQuality` because lossy WebP is 4:2:0 chroma only and
   * bleeds exactly the hard saturated edges artwork is made of. Default 95.
   * WebP path only; KTX2 has its own quality model.
   */
  artworkTextureQuality?: number
  /** Resize cap for artwork textures. Higher than `maxTextureSize`: thin lettering is what resampling destroys first. Default 4096. */
  artworkMaxTextureSize?: number
  /** Geometry codec. Default 'none'. */
  geometry?: GeometryCodec
  /** Legacy alias for `geometry: 'draco'`, kept for the existing merge API/tests. */
  draco?: boolean
  /**
   * Force fabric to render solid — convert alphaMode BLEND → OPAQUE and set
   * every material double-sided. CLO frequently exports opaque fabric as
   * translucent BLEND, which <model-viewer> (three.js, no order-independent
   * transparency) then draws see-through. Off unless set; the CLI turns it ON
   * by default. Opt out (`--keep-transparency`) only for genuinely sheer
   * garments (mesh, lace, tulle).
   */
  opaque?: boolean
  /**
   * Force fabric and artwork materials off metal. ON unless set to false.
   *
   * glTF defaults an absent `metallicFactor` to 1.0 and CLO omits it on some fabric,
   * which renders a garment as glossy patent leather — proven by A/B on the real
   * MATRIX-PUFF JACKET export, where the affected materials cover 76.6% of its
   * triangles. Measured across the 28 raw exports: 55 genuine offenders on 4
   * garments, against 440 legitimate hardware materials that must stay metal and
   * 3,593 that carry a metallicRoughnessTexture and are already correct per pixel.
   * See pbr-normalize.ts.
   *
   * Opt out (`--no-pbr-normalize`) for a garment with genuinely metallic fabric —
   * lamé, foil print. Nothing in the catalogue needed that as of 2026-08-27.
   */
  normalizePbr?: boolean | undefined
  /**
   * Simplify (decimate) geometry to this fraction of triangles, 0–1 — e.g. 0.05
   * keeps ~5%. CLO exports are wildly over-tessellated (millions of triangles
   * from the cloth simulation); the mesh, not the textures, is what makes them
   * huge. Off (undefined) by default. The mesh is welded first so the simplifier
   * can collapse shared edges; run before geometry compression.
   *
   * ⚠️ The `| undefined` on this and the three `simplify*` options below is
   * REQUIRED, not noise, and removing it breaks the build under
   * `exactOptionalPropertyTypes` (this package's tsconfig.json). Plain `?: number` means
   * "the key may be absent"; it does NOT permit an explicit `simplify: undefined`.
   * Both callers build their options object from parsed CLI args and pass the key
   * through unconditionally — `parseOptimizeArgs` → `optimizeGlb`, and
   * `merge-variants.ts` — so the value really is `number | undefined` at runtime.
   * Writing `?: number` here was a claim the code did not honour, which is exactly
   * the absent-vs-present-and-empty confusion that already bites this interface
   * once: see the `opaque` default mismatch in the root CLAUDE.md, where the two
   * call paths disagree about what an absent key means and decals shipped
   * see-through.
   */
  simplify?: number | undefined

  /**
   * Error budget for `--simplify`, as a fraction of mesh radius. The simplifier
   * stops before reaching the target ratio rather than exceed this, so a smaller
   * value protects geometry at the cost of a larger file.
   *
   * NOTE this is the binding constraint in practice: `ratio` is only a target,
   * so once the budget binds, lowering `--simplify` further changes nothing.
   * Raise the budget — or lower `simplifyUvWeight` — to get a smaller file.
   */
  simplifyError?: number | undefined
  /**
   * How heavily UV distortion counts against the error budget (0 disables the
   * attribute-aware path). This is what protects printed graphics; see
   * simplify-textured.ts for why it replaced `lockBorder`.
   */
  simplifyUvWeight?: number | undefined
  /**
   * NEGATIVE CONTROL ONLY. Lets `--simplify` reach the print pieces again, exactly as
   * every run did before 2026-09-02, so the damage can be re-measured on demand (a
   * measuring tool that has never seen a defect is not known to work). The robot
   * never emits it — pinned in strategy.test.ts — and the report names every print
   * it decimates in `artworkAtRisk`, which the shrink Worker refuses.
   */
  decimateArtwork?: boolean | undefined
  /**
   * Move every UV set into 0..1 (recording the move in KHR_texture_transform) so the
   * quantizer takes it — fix plan Rank 11, audit CT-08/F1-10/GEO-01. ON unless set to
   * false. CLO writes UVs in pattern space, which glTF-Transform's quantizer refuses,
   * so every UV set in the catalogue shipped as 32-bit floats: 47% of the skinsuit's
   * geometry bytes, 57% of the bib's. `--no-uv-remap` is the A/B control that keeps
   * the old floats; see uv-remap.ts.
   */
  uvRemap?: boolean | undefined
  /** Same for vertex normals — protects shading rather than artwork. */
  simplifyNormalWeight?: number | undefined

  /**
   * Decimate ONLY decorative topstitch meshes to this fraction, 0–1. Off by
   * default. See topstitch.ts for the measurement that motivates it: a real CLO
   * export was 99.97% stitch geometry and 0.03% garment, so the two need
   * different budgets and `--simplify` cannot express that.
   *
   * ⚠️ SAFE TO PASS ALONGSIDE `--simplify`, AND `shrinkFlagsFor` DOES — this said
   * the opposite until 2026-08-26, describing the code as it was BEFORE the guard
   * that fixed it. Decimating thread twice is what produced the frayed output the
   * owner rejected on 2026-08-21; `skipMeshes` is what stops it. When the stitch
   * pass runs it OWNS those meshes, and `buildOptimizeTransforms` hands
   * `skipMeshes: DEFAULT_STITCH_PATTERN` to the general simplifier (optimize.ts:499),
   * which honours it at simplify-textured.ts:347. So thread takes the stitch
   * budget and the garment takes the other one.
   *
   * This mattered because the advice was unfollowable: every production run goes
   * through `shrinkFlagsFor`, which returns BOTH flags for both detail levels, so
   * a reader who believed this comment would conclude the shipping configuration
   * was the broken one.
   */
  stitch?: number | undefined
  /**
   * Error budget for `--stitch`. The real aggression dial, exactly as
   * `simplifyError` is for `--simplify`. Keep it tight — a loose budget, not a low
   * ratio, is what turns a stitch cord into spikes.
   */
  stitchError?: number | undefined
  /**
   * Resize cap for textures used ONLY as normal/metallicRoughness/occlusion.
   * Falls back to `maxTextureSize`, so leaving it unset changes nothing.
   * Worth setting to half: these maps measured 9.63 MB against the artwork's
   * 7.03 MB purely because they ran at colour-map resolution. See
   * texture-artwork.ts.
   */
  dataMaxTextureSize?: number | undefined
}

export const DEFAULT_MAX_TEXTURE = 2048
export const DEFAULT_TEXTURE_QUALITY = 82
/**
 * Artwork defaults. Textures are ~2 MB of a ~19 MB garment and geometry is the
 * rest, so buying fidelity here is close to free — the trade this pipeline used
 * to make (everything at 82, capped at 2048) saved almost nothing and cost the
 * one thing on the model a customer is looking at.
 */
export const DEFAULT_ARTWORK_TEXTURE_QUALITY = 95
export const DEFAULT_ARTWORK_MAX_TEXTURE = 4096
/**
 * glTF-Transform's own default (0.01% of mesh radius). We previously hard-coded
 * 0.001 here, which is 10x looser and visibly tore printed logos apart.
 *
 * Kept as the floor even though UV error is now inside the budget
 * (simplify-textured.ts): the two protections are complementary, and callers who
 * want a smaller file should raise this deliberately via `--simplify-error`
 * rather than get a looser budget by accident.
 */
export const DEFAULT_SIMPLIFY_ERROR = 0.0001
/**
 * Error budget for `--stitch`. Measured 2026-08-21 on the Cycling-Bib export by
 * rendering a 4° macro crop of a seam at each setting — the only view that can see
 * this damage; at the default 18° crop a ruined cord looks identical to an intact
 * one.
 *
 * 0.0005 asked to keep 3% of the thread and kept 3.99%, stopping early rather than
 * damaging the cord. That self-limiting behaviour is the point: the budget cannot
 * be pushed into fraying the stitching by asking for a lower ratio. A 20x looser
 * 0.01 is what produced the frayed, spiky output that was rejected on sight.
 */
export const DEFAULT_STITCH_ERROR = 0.0005
/**
 * Default UV weight for attribute-aware simplification. meshoptimizer's guidance
 * is that "a weight around 1.0 is usually appropriate" for normalized attributes,
 * which UVs in 0–1 are.
 */
export const DEFAULT_SIMPLIFY_UV_WEIGHT = 1
/** Default normal weight — half the UV weight: shading matters, artwork matters more. */
export const DEFAULT_SIMPLIFY_NORMAL_WEIGHT = 0.5

/**
 * Node image decoder for the KTX2 encoder: sharp turns the source PNG/JPEG into
 * raw RGBA (the browser build uses a canvas; Node must supply this). Resizing to
 * the size cap happens here so a single decode both shrinks and feeds the
 * encoder. Aspect ratio is preserved and images are never enlarged.
 */
function makeImageDecoder(maxSize: number) {
  return async (
    buffer: Uint8Array,
  ): Promise<{ data: Uint8Array; width: number; height: number }> => {
    const { data, info } = await sharp(buffer)
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return { data: new Uint8Array(data), width: info.width, height: info.height }
  }
}

/** Resolve the geometry codec from the (possibly legacy) options. */
export function resolveGeometry(options: OptimizeOptions): GeometryCodec {
  if (options.geometry) return options.geometry
  return options.draco ? 'draco' : 'none'
}

export interface SolidifyResult {
  /** Materials whose alphaMode was changed BLEND → OPAQUE. */
  opaqued: number
  /** Materials changed BLEND → MASK: a real cutout, kept rather than filled in. */
  masked: number
  /** Materials left on BLEND because their alpha is genuinely graded. */
  keptBlend: number
  /** Total materials made double-sided. */
  doubleSided: number
}

// The BLEND decision — OPAQUE_FACTOR_THRESHOLD, the DECORATIVE_ALPHA_* trio, the cutout
// test and their order — lives in textures.ts as `resolveBlendAlpha` since 2026-09-02,
// so the gate that polices this step (`auditArtworkAlpha`) shares its exact rule. The
// measurements behind every number moved with them.

/**
 * Force fabric to render solid — deciding per material from its actual alpha
 * data rather than by blanket rule.
 *
 * THE PROBLEM. CLO exports frequently mark opaque fabric as alphaMode BLEND
 * (from a stray fabric opacity value, or an unused alpha channel left in the
 * base-colour texture). <model-viewer> — three.js underneath, with NO
 * order-independent transparency — then draws that fabric see-through, showing
 * the garment's back faces through the front.
 *
 * WHY NOT JUST FORCE EVERYTHING OPAQUE, WHICH IS WHAT THIS USED TO DO. Because
 * "alphaMode is BLEND" covers two completely different situations. Stray fabric
 * opacity should become OPAQUE. A printed decal with a real cutout should not —
 * flattening it to OPAQUE fills the cutout back in with whatever the base colour
 * is, which reads as artwork that is half there. Both were being treated the
 * same, and the second case is one of the leading suspects for the damage on the
 * first real garment.
 *
 * WHY MASK RATHER THAN LEAVING IT ON BLEND. `--keep-transparency` looks like the
 * fix and is not: with no OIT, BLEND on a multi-part garment produces
 * depth-sorting artefacts, trading one "half visible" for another. MASK with
 * alphaCutoff 0.5 is order-independent, renders solid, and keeps the cutout.
 *
 * So, per material, read the base-colour alpha and decide:
 *   - no alpha channel, or every pixel solid, and baseColorFactor[3] ≈ 1
 *       → OPAQUE. The stray-opacity case; the original behaviour, and correct.
 *   - a hard binary cutout  → MASK, alphaCutoff 0.5. The decal case.
 *   - genuinely graded      → leave BLEND. Real translucency (mesh, lace, tulle);
 *                             destroying it is not this function's call.
 *   - undecodable (KTX2)    → OPAQUE, the previous behaviour, and reported.
 *
 * DOUBLE-SIDING. Single-layer ("Thin") CLO fabric must stay visible from the
 * inside — necklines, cuffs, open plackets — so it is still applied broadly.
 * But NOT to MASK materials: a decal is a thin surface sitting just off the
 * fabric, and drawing its back faces is a source of exactly the speckled
 * z-fighting that damages printed graphics. Materials are never set
 * single-sided, only left as the source had them.
 *
 * Genuinely sheer garments must skip all of this — see `--keep-transparency`.
 */
export async function solidifyMaterials(document: Document): Promise<SolidifyResult> {
  const materials = document.getRoot().listMaterials()
  const result: SolidifyResult = { opaqued: 0, masked: 0, keptBlend: 0, doubleSided: 0 }

  for (const material of materials) {
    if (material.getAlphaMode() === 'BLEND') {
      const image = material.getBaseColorTexture()?.getImage()
      // An untextured material has no pixels to profile: zero of everything, so
      // it can never satisfy the cutout test and falls through to OPAQUE, which
      // is the CLO stray-opacity case this step was built for.
      const alpha: AlphaProfile = image ? await profileAlpha(image) : NO_ALPHA_PROFILE
      const factor = material.getBaseColorFactor()[3] ?? 1

      // ONE decision, shared with the gate that checks this step's output — see
      // resolveBlendAlpha in textures.ts for every branch and the measurement behind
      // it. 'keep' is deliberate translucency (soft-edged alpha, an explicit sheer
      // factor, or a picture that would not decode) and the report says so; the
      // operator can still decide the garment is not sheer and re-export it.
      const resolution = resolveBlendAlpha(alpha, factor)
      if (resolution === 'keep') {
        result.keptBlend++
      } else if (resolution === 'MASK') {
        // A real cutout. Keep the shape, lose the sorting problem.
        material.setAlphaMode('MASK').setAlphaCutoff(0.5)
        result.masked++
      } else {
        material.setAlphaMode('OPAQUE')
        result.opaqued++
      }
    }

    // Double-siding exists to fix FABRIC: CLO exports panels single-sided, so from
    // behind they vanish and the garment looks hollow. It must not be applied to
    // printed artwork, which has a front and a back on purpose.
    //
    // ⚠️ THIS EXEMPTION USED TO BE `!== 'MASK'` ALONE, AND THAT SHIPPED A VISIBLE
    // BUG. Found 2026-08-21 by the owner looking at the rendered garment: the
    // Cycling-Bib care label ("A SUBSIDIARY OF … MADE IN PAKISTAN") is authored on
    // the INSIDE and single-sided, so backface culling correctly hides it from
    // outside. Forcing it double-sided rendered its back face through the fabric —
    // **mirrored**, with the text reversed, on the outside of the garment.
    //
    // The old condition was not wrong about MASK, it was too narrow: it exempted
    // decals only when they had reached MASK, and this label stays BLEND (graded
    // alpha), so it missed the exemption it plainly deserved. Judging it on what
    // the texture IS, rather than on which alphaMode it happened to land in, is
    // the same rule the MASK branch was already reaching for.
    //
    // Name-only classification on purpose (`isArtworkTextureByName`, not the async
    // `isArtworkTexture`): this decides SIDEDNESS, nothing else. It must not widen
    // `isArtworkTexture` -> `findArtworkAlphaProblems`, which throws and saves
    // nothing — widening a blocking gate to fix a rendering bug would be a bad
    // trade. Pinned by a test with a negative control in pipeline.test.ts —
    // there is no optimize.test.ts, and this comment named one until 2026-08-29.
    // BOTH signals, because a CLO export names the MATERIAL and leaves every
    // texture anonymous — 0 of 24 textures had a name or URI on the file this was
    // measured against, so the texture-only check was completely inert.
    const baseColour = material.getBaseColorTexture()
    const isPrintedArtwork =
      isArtworkMaterialByName(material) || (baseColour ? isArtworkTextureByName(baseColour) : false)
    if (material.getAlphaMode() !== 'MASK' && !isPrintedArtwork) {
      material.setDoubleSided(true)
      result.doubleSided++
    }
  }

  return result
}

/**
 * What the run actually did, as opposed to what it was asked to do.
 *
 * Filled in as the chain executes and reported to the owner. The gap between the
 * two is where the artwork investigation kept losing time: a `--uv-weight` that
 * was never applied because every primitive took the fallback path looks
 * identical, from the outside, to one that was applied and did not help.
 */
export interface OptimizeTelemetry {
  /** What CLO wrote, measured before any pass (fix plan Rank 13). */
  raw?: RawCensus
  /** Dead texture references the reader had to strip to read the file at all (HG-06). */
  repair?: DeadTextureRepair
  /** What normalizePbr changed, left alone, and could not classify. */
  pbr?: PbrNormalizeResult
  /** Present only when a simplify pass ran. */
  simplify?: SimplifyTexturedResult
  /** Texture bindings repointed because prune renumbered a UV set out from under a colourway. */
  variantTexCoords?: string[]
  /** Present only when the WebP texture pass ran. */
  textures?: TextureArtworkResult
  /** Near-constant shading maps folded into material factors (fix plan Rank 10). */
  fold?: FoldResult
  uvRemap?: UvRemapResult
  /** What the finished file costs a phone's GPU, counted after every pass (Rank 10). */
  gpu?: GpuEstimate
  /** Present only when the opaque/solidify pass ran. */
  solidify?: SolidifyResult
  /** Present only when the topstitch pass ran. */
  stitch?: TopstitchResult
}

/**
 * Build the ordered transform chain. Always dedups + prunes; conditionally
 * compresses textures and geometry. Async because Meshopt's encoder must be
 * awaited to ready before use.
 *
 * `telemetry` is written into as the chain runs, so callers can report what
 * happened without threading return values back through gltf-transform.
 */
export async function buildOptimizeTransforms(
  options: OptimizeOptions,
  telemetry: OptimizeTelemetry = {},
): Promise<Transform[]> {
  const transforms: Transform[] = [
    // FIRST, before dedup merges the duplicate pictures it is there to count: what CLO
    // wrote — duplicate and oversized pictures, thread by both names, flat cloth, print
    // finishes (fix plan Rank 13). Measures, reports, changes nothing.
    censusRawDocument({
      onResult: (census) => {
        telemetry.raw = census
      },
    }),
    dedup(),
    prune({ keepExtras: true }),
    // Immediately after prune, because prune is what renumbers UV sets — and it
    // updates only the material bound as each primitive's DEFAULT, leaving every
    // colourway-only material pointing at an attribute that no longer exists. See
    // variant-texcoord.ts. The spec gate in `validate` is the backstop if a later
    // pass ever renumbers again.
    alignVariantTexCoords({
      onResult: (fixed) => {
        telemetry.variantTexCoords = fixed
      },
    }),
  ]

  // Metalness first: a pure material edit that nothing downstream reads. Running it
  // before solidifyMaterials keeps the two decisions independent — that one reads
  // alpha, this one reads metalness, and neither should see the other's output.
  // Default ON; `--no-pbr-normalize` is the opt-out.
  if (options.normalizePbr !== false) {
    transforms.push(
      /*
       * ⚠️ EVERY NON-DECIMATION PASS ADDED HERE MUST ALSO BE ADDED TO THE BASELINE IN
       * scripts/eval-artwork-legibility.mjs, OR THAT GATE GOES RED FOR THE WRONG REASON.
       *
       * The eval renders the raw fixture as its baseline and compares the optimized
       * render against it, promising in its own header that "the only variable is the
       * decimation". `normalizePbr` broke that promise the day it was added: it runs on
       * the optimized side only, so the eval measured decimation damage PLUS a
       * legitimate shading correction and every row jumped together —
       * fidelity 1.650 -> 15.290, balanced 3.070 -> 16.070, CONTROL 9.370 -> 18.760,
       * against a 5.000% ceiling. That reads as catastrophic artwork damage and was
       * not: rendered and looked at, the letterforms were intact and merely lighter,
       * because a wrongly-metallic surface renders dark and a corrected one does not.
       *
       * It cost a branch. All three rows moving TOGETHER, control included, is the
       * signature of a constant offset rather than damage — check for that first.
       */
      normalizePbr({
        onResult: (result) => {
          telemetry.pbr = result
        },
      }),
    )
  }

  // Force fabric solid before texture/geometry passes touch the materials. CLO
  // often marks opaque fabric as translucent (alphaMode BLEND); model-viewer has
  // no OIT and would render it see-through. Opt in — the CLI defaults it on.
  if (options.opaque === true) {
    transforms.push(async (document: Document) => {
      telemetry.solidify = await solidifyMaterials(document)
    })
  }

  // FOLD BEFORE ENCODING (fix plan Rank 10, audit TEX-06): a 2048² roughness map that
  // holds eight values costs 21 MB of phone memory for two numbers a factor expresses.
  // Folded first, it is never encoded, never de-duplicated, never counted.
  transforms.push(
    foldConstantTextures({
      onResult: (result) => {
        telemetry.fold = result
      },
    }),
  )
  const max = options.maxTextureSize ?? DEFAULT_MAX_TEXTURE
  if (options.texture === 'webp') {
    // Not glTF-Transform's textureCompress: it cannot reach `smartSubsample`,
    // which is the setting that addresses WebP's 4:2:0 chroma bleed on printed
    // artwork. See texture-artwork.ts.
    transforms.push(
      compressTexturesForArtwork({
        quality: options.textureQuality ?? DEFAULT_TEXTURE_QUALITY,
        maxSize: max,
        artworkQuality: options.artworkTextureQuality ?? DEFAULT_ARTWORK_TEXTURE_QUALITY,
        artworkMaxSize: options.artworkMaxTextureSize ?? DEFAULT_ARTWORK_MAX_TEXTURE,
        // Absent → falls back to `maxSize` inside the encoder, i.e. old behaviour.
        ...(options.dataMaxTextureSize === undefined
          ? {}
          : { dataMaxSize: options.dataMaxTextureSize }),
        onResult: (result) => {
          telemetry.textures = result
        },
      }),
    )
  } else if (options.texture === 'ktx2') {
    const imageDecoder = makeImageDecoder(max)
    // Three passes, following Basis Universal best practice — and, since 2026-09-03,
    // with the colour space said EXPLICITLY on every one (fix plan Rank 14, audits
    // TEX-03 / TEX-12): the encoder writes the file's transfer function from
    // `isSetKTX2SRGBTransferFunc`, and until now no pass set it, so colour and data
    // maps were stamped alike. A normal or roughness map read through an sRGB
    // transfer is a different surface; a colour map read as linear is a different
    // colour. That, not ETC1S vs UASTC, was the variable in the 2026-08-21 refusal.
    //  - Normal maps → UASTC, linear (preserves the surface detail ETC1S would smear).
    //  - Colour maps (baseColor, emissive) → ETC1S, sRGB.
    //  - Other data maps (occlusion, metallicRoughness) → ETC1S, linear.
    // Each pass is scoped by slot so none re-encodes another's output.
    const ktx2Quality = options.textureQuality ?? DEFAULT_TEXTURE_QUALITY
    transforms.push(
      ktx2({
        isUASTC: true,
        generateMipmap: true,
        imageDecoder,
        slots: /normalTexture/i,
        isSetKTX2SRGBTransferFunc: false,
      }),
      ktx2({
        isUASTC: false,
        qualityLevel: ktx2Quality,
        generateMipmap: true,
        imageDecoder,
        slots: /(baseColor|emissive)Texture/i,
        isSetKTX2SRGBTransferFunc: true,
      }),
      ktx2({
        isUASTC: false,
        qualityLevel: ktx2Quality,
        generateMipmap: true,
        imageDecoder,
        slots: /(occlusion|metallicRoughness)Texture/i,
        isSetKTX2SRGBTransferFunc: false,
      }),
    )
  }

  // Decimate the mesh before compressing geometry. Raw CLO simulation meshes run
  // to millions of triangles — orders of magnitude past what a web viewer needs —
  // and that geometry, not the textures, is what makes the file huge (measured:
  // textures were 2.1 MB in every variant of a 373 MB export).
  //
  // simplifyTextured() welds first, then decimates with UV *and* normal error
  // inside the budget, so printed artwork survives without freezing every mesh
  // border. See simplify-textured.ts for why `lockBorder` was the wrong tool —
  // it protected the logos but produced 58.3 MB, over the 40 MB publish ceiling.
  // Topstitch runs BEFORE the general decimator, and on a garment shaped like the
  // Cycling-Bib export it runs INSTEAD of it — `Cloth_mesh` at 11,128 triangles
  // needs no decimation, so `--simplify` would only be a second pass over thread
  // that has already been reduced. Doing both is what frayed the cord. See
  // topstitch.ts.
  // Captured as a value, not a boolean: a separate `stitchRan` flag does not
  // narrow `options.stitch` for TypeScript, and `exactOptionalPropertyTypes` makes
  // that a hard error rather than an implicit `undefined` reaching the simplifier.
  // ⚠️ DE-DUPLICATE AGAIN AFTER RE-ENCODING (audit TEX-05). The first dedup() runs on
  // the raw export, where two copies of one picture can differ by a byte of metadata;
  // after both are re-encoded they are byte-identical, and the live skinsuit shipped a
  // 640x640 twin (the bib a 2048x1863 normal map) that only a second pass sees.
  transforms.push(dedup(), prune({ keepExtras: true }))
  const stitchRatio =
    typeof options.stitch === 'number' && options.stitch > 0 && options.stitch < 1
      ? options.stitch
      : null
  if (stitchRatio !== null) {
    transforms.push(
      reduceTopstitch({
        simplifier: MeshoptSimplifier as unknown as AttributeSimplifier,
        ratio: stitchRatio,
        error: options.stitchError ?? DEFAULT_STITCH_ERROR,
        onResult: (result) => {
          telemetry.stitch = result
        },
      }),
    )
  }

  if (typeof options.simplify === 'number' && options.simplify > 0 && options.simplify < 1) {
    transforms.push(
      simplifyTextured({
        simplifier: MeshoptSimplifier as unknown as AttributeSimplifier,
        ratio: options.simplify,
        // `ratio` is a TARGET, not a guarantee — the simplifier stops early once
        // it would exceed this error, so the budget is what actually decides the
        // output size once it binds.
        error: options.simplifyError ?? DEFAULT_SIMPLIFY_ERROR,
        uvWeight: options.simplifyUvWeight ?? DEFAULT_SIMPLIFY_UV_WEIGHT,
        normalWeight: options.simplifyNormalWeight ?? DEFAULT_SIMPLIFY_NORMAL_WEIGHT,
        ...(options.decimateArtwork ? { decimateArtwork: true } : {}),
        // If the stitch pass ran, it OWNS those meshes — decimating them again
        // here is what frayed the cord on 2026-08-21. Passing both flags is
        // therefore safe: thread takes the stitch budget, garment takes this one.
        ...(stitchRatio !== null ? { skipMeshes: DEFAULT_STITCH_PATTERN } : {}),
        onResult: (result) => {
          telemetry.simplify = result
        },
      }),
    )
  }

  // UVs INTO 0..1, LAST BEFORE THE CODEC (fix plan Rank 11; audit CT-08, F1-10,
  // GEO-01). glTF-Transform's quantizer — which meshopt() runs — refuses any UV set
  // outside 0..1, and CLO writes every one in pattern space, so until this pass the
  // largest attribute in every garment shipped as 32-bit floats. Runs after the
  // decimator (which prices UV error in the export's own units) and after everything
  // that reads a raw UV span; whatever runs later reads spans through
  // `uvSpanInPatternSpace`. Sixteen bits for the reason in uv-remap.ts: the widest
  // fabric group in the catalogue quantizes to 0.19 px at 16 bits and 3.1 px at 12.
  const uvRemap = options.uvRemap !== false
  if (uvRemap) {
    transforms.push(
      remapUvRanges({
        onResult: (result) => {
          telemetry.uvRemap = result
        },
      }),
    )
  }

  const geometry = resolveGeometry(options)
  const texcoordBits = uvRemap ? { quantizeTexcoord: UV_QUANTIZE_BITS } : {}
  if (geometry === 'draco') {
    transforms.push(draco(texcoordBits))
  } else if (geometry === 'meshopt') {
    await MeshoptEncoder.ready
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'high', ...texcoordBits }))
  }

  // LAST, so it counts what ships (fix plan Rank 10, audit TEX-04/TEX-07/LIVE-07).
  transforms.push(
    estimateGpuTextures({
      onResult: (result) => {
        telemetry.gpu = result
      },
    }),
  )
  return transforms
}

// The Basis Universal WASM encoder prints per-slice progress to stdout via
// Emscripten's console.log. Drop only those specific lines so the pipeline's own
// output (and CI logs) stay readable; anything else passes through untouched.
const BASIS_NOISE = /^(Total slices:|Slice: \d|Mode: (ETC1S|UASTC)|basis_compressor::)/
async function withQuietBasisLogs<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.log
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && BASIS_NOISE.test(args[0])) return
    original(...args)
  }
  try {
    return await fn()
  } finally {
    console.log = original
  }
}

/** Apply the optimisation chain to an in-memory document (mutates + returns it). */
export async function optimizeDocument(
  document: Document,
  options: OptimizeOptions,
  telemetry: OptimizeTelemetry = {},
): Promise<Document> {
  const transforms = await buildOptimizeTransforms(options, telemetry)
  const run = () => document.transform(...transforms)
  // Only the KTX2 path is chatty; wrap just that so nothing else is filtered.
  if (options.texture === 'ktx2') await withQuietBasisLogs(run)
  else await run()
  return document
}

export interface OptimizeResult {
  outputFile: string
  bytesBefore: number
  bytesAfter: number
  textureCount: number
  /** Distinct image mime-types remaining in the output, e.g. ['image/webp']. */
  textureFormats: string[]
  geometry: GeometryCodec
  /** Whether the opaque + double-sided step ran. */
  opaque: boolean
  /**
   * Simplify counters, when a simplify pass ran. `fallback` is the one to read:
   * those primitives were decimated position-only with borders locked, so
   * `--uv-weight` did nothing for them.
   */
  simplify?: SimplifyTexturedResult
  /** How textures were classified and encoded, when the WebP pass ran. */
  textures?: TextureArtworkResult
  /** What CLO wrote, measured before any pass — the report's raw-export lines (Rank 13). */
  raw?: RawCensus
  /** Present only when the reader had to strip dead texture references (HG-06). */
  repair?: DeadTextureRepair
  fold?: FoldResult
  /** Present whenever the UV remap ran (default on); absent under --no-uv-remap. */
  uvRemap?: UvRemapResult
  gpu?: GpuEstimate
  /** What the metalness pass changed, left alone, and could not classify. */
  pbr?: PbrNormalizeResult
  /** How each translucent material was resolved, when the opaque pass ran. */
  solidify?: SolidifyResult
  /** Stitch vs garment triangle split, when the topstitch pass ran. */
  stitch?: TopstitchResult
}

/**
 * Optimise a single GLB file → GLB file. Used by the `optimize` CLI command so
 * separate-glb-per-colour products (and any single production GLB) get the same
 * compression as merged ones.
 */
export async function optimizeGlb(
  inputFile: string,
  outputFile: string,
  options: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const io = await createIO()
  const bytesBefore = (await stat(inputFile)).size
  // readGlb, not io.read: six of the 28 raw exports declare a texture pointing at
  // no image, and the READER dies on them before any transform runs. See
  // repair-dead-textures.ts. A healthy export takes the identical path.
  const { document, repair } = await readGlb(inputFile)
  if (repair.referencesRemoved) {
    // Reported, never silent — this is a defect in the CLO export, and the owner
    // decides what to do about it. Same treatment as STRUCTURE POLO SET's unbound
    // colourways, which `describe` refuses to hide.
    console.warn(
      `[optimize] REPAIRED ${repair.deadTextures.length} texture(s) with no image: ` +
        `removed ${repair.referencesRemoved} ${repair.slots.join('/')} reference(s). ` +
        'Without this the file cannot be read at all. Re-export from CLO to fix it properly.',
    )
  }
  const telemetry: OptimizeTelemetry = {}
  // Carried into the result (fix plan Rank 13, audit HG-06): a repair used to be a
  // console line and nothing else, so a stripped COLOUR map — the garment's own picture —
  // would have shipped silently. The robot refuses that case (apps/shrink repairGate.ts).
  if (repair.referencesRemoved) telemetry.repair = repair
  await optimizeDocument(document, options, telemetry)

  await mkdir(dirname(outputFile), { recursive: true })
  await io.write(outputFile, document)
  const bytesAfter = (await stat(outputFile)).size

  const textures = document.getRoot().listTextures()
  const textureFormats = [...new Set(textures.map((t) => t.getMimeType()).filter(Boolean))].sort()

  return {
    outputFile,
    bytesBefore,
    bytesAfter,
    textureCount: textures.length,
    textureFormats,
    geometry: resolveGeometry(options),
    opaque: options.opaque === true,
    ...(telemetry.raw ? { raw: telemetry.raw } : {}),
    ...(telemetry.repair ? { repair: telemetry.repair } : {}),
    ...(telemetry.simplify ? { simplify: telemetry.simplify } : {}),
    ...(telemetry.textures ? { textures: telemetry.textures } : {}),
    ...(telemetry.fold ? { fold: telemetry.fold } : {}),
    ...(telemetry.uvRemap ? { uvRemap: telemetry.uvRemap } : {}),
    ...(telemetry.gpu ? { gpu: telemetry.gpu } : {}),
    ...(telemetry.pbr ? { pbr: telemetry.pbr } : {}),
    ...(telemetry.solidify ? { solidify: telemetry.solidify } : {}),
    ...(telemetry.stitch ? { stitch: telemetry.stitch } : {}),
  }
}

export interface ParsedOptimizeArgs {
  input: string | null
  out: string | null
  options: OptimizeOptions
}

/**
 * Parse `optimize` arguments. Pure + exported so the CLI contract is testable.
 * Defaults reflect best practice: WebP textures capped at 2048 px. Geometry
 * compression stays opt-in (`--draco` / `--meshopt`).
 */
/**
 * Read a numeric flag value, or fail naming the flag.
 *
 * L8, 2026-08-18. Eight numeric flags were read as `Number(rest[++i])`. Four had
 * no fallback at all; the other four had a `??` fallback that could never help,
 * because `??` tests for null and undefined and NOT for NaN — `NaN ?? 0.0001`
 * evaluates to NaN, verified in node. There were no isNaN or Number.isFinite
 * guards anywhere in this package and no test for a malformed numeric argument.
 *
 * `--simplify-error` is the documented aggression control and `--uv-weight 0` is
 * the NEGATIVE CONTROL the artwork eval uses to represent destroyed artwork. A NaN
 * there is an undefined value on the axis that decides whether printed letters
 * survive decimation — and the three blocking gates test alphaMode, which
 * decimation does not change, so nothing downstream would have objected.
 *
 * Zero is valid and must pass; `eval:artwork` runs `--uv-weight 0` and would fail
 * loudly if this rejected it.
 */
export function finiteNumber(raw: string | undefined, flagName: string): number {
  const value = Number(raw)
  if (raw === undefined || raw === '' || !Number.isFinite(value)) {
    throw new Error(
      `${flagName} needs a number, received ${raw === undefined ? '(nothing)' : `"${raw}"`}. ` +
        'A NaN here would be accepted silently and used as if it were a real value.',
    )
  }
  return value
}

/** Flags that consume the token after them. Anything else must start with `--`. */
const VALUE_TAKING_FLAGS = new Set([
  '--out',
  '--max-texture',
  '--quality',
  '--artwork-quality',
  '--artwork-max-texture',
  '--simplify',
  '--simplify-error',
  '--uv-weight',
  '--normal-weight',
  '--stitch',
  '--stitch-error',
  '--data-max-texture',
  // `pnpm pipeline review --port 4180`. Listed here so assertFlagsOnly does not
  // read the port NUMBER as a bare positional and reject the command.
  '--port',
])

/**
 * Reject anything in a flags array that is neither a `--` flag nor the value of one.
 *
 * M6, 2026-08-18. `apps/shrink/container/server.ts` commented that it accepted
 * only `--`-prefixed flags and their values, "so a malformed request can never
 * smuggle in a second input path". It did not: it filtered on
 * `typeof flag === 'string'`, and parseOptimizeArgs ends its loop by treating any
 * non-`--` token as the INPUT PATH. Measured — appending '/etc/passwd' to
 * ['in.glb', '--out', 'o.glb'] changed the input to /etc/passwd.
 *
 * Never reachable in production: shrinkFlagsFor returns hardcoded literals chosen
 * by a two-value enum, and THAT upstream fact is what made the container safe, not
 * the filter the comment pointed at — which is exactly why the comment was
 * dangerous. This makes the container safe on its own terms, for the day someone
 * adds an operator-editable flags field.
 */
export function assertFlagsOnly(flags: string[]): void {
  for (let i = 0; i < flags.length; i++) {
    const token = flags[i]!
    if (token.startsWith('--')) {
      if (VALUE_TAKING_FLAGS.has(token)) i++ // its value is consumed, whatever it is
      continue
    }
    throw new Error(
      `Refusing flag list: "${token}" is not a --flag and does not follow one. ` +
        'A bare token here would be parsed as the input path.',
    )
  }
}

export function parseOptimizeArgs(rest: string[]): ParsedOptimizeArgs {
  let input: string | null = null
  let out: string | null = null
  let texture: TextureCodec = 'webp'
  let geometry: GeometryCodec = 'none'
  let maxTextureSize = DEFAULT_MAX_TEXTURE
  let textureQuality = DEFAULT_TEXTURE_QUALITY
  let artworkTextureQuality = DEFAULT_ARTWORK_TEXTURE_QUALITY
  let artworkMaxTextureSize = DEFAULT_ARTWORK_MAX_TEXTURE
  // Solid fabric is the safe default for apparel; sheer garments opt out.
  let opaque = true
  // `boolean | undefined`, not `boolean`: exactOptionalPropertyTypes is on and this
  // object is built from parsed args then passed through unconditionally — the same
  // shape that made the four simplify* fields need it.
  let normalizePbrOption: boolean | undefined
  let simplify: number | undefined
  let simplifyError: number | undefined
  let simplifyUvWeight: number | undefined
  let decimateArtwork = false
  let uvRemap = true
  let simplifyNormalWeight: number | undefined
  let stitch: number | undefined
  let stitchError: number | undefined
  let dataMaxTextureSize: number | undefined

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '--out') out = rest[++i] ?? null
    else if (arg === '--no-webp' || arg === '--no-textures') texture = 'none'
    else if (arg === '--webp') texture = 'webp'
    else if (arg === '--ktx2') texture = 'ktx2'
    else if (arg === '--draco') geometry = 'draco'
    else if (arg === '--meshopt') geometry = 'meshopt'
    else if (arg === '--max-texture') maxTextureSize = finiteNumber(rest[++i], '--max-texture')
    else if (arg === '--quality') textureQuality = finiteNumber(rest[++i], '--quality')
    else if (arg === '--artwork-quality')
      artworkTextureQuality = finiteNumber(rest[++i], '--artwork-quality')
    else if (arg === '--artwork-max-texture')
      artworkMaxTextureSize = finiteNumber(rest[++i], '--artwork-max-texture')
    else if (arg === '--simplify') simplify = finiteNumber(rest[++i], '--simplify')
    else if (arg === '--simplify-error') simplifyError = finiteNumber(rest[++i], '--simplify-error')
    else if (arg === '--uv-weight') simplifyUvWeight = finiteNumber(rest[++i], '--uv-weight')
    else if (arg === '--normal-weight')
      simplifyNormalWeight = finiteNumber(rest[++i], '--normal-weight')
    else if (arg === '--stitch') stitch = finiteNumber(rest[++i], '--stitch')
    else if (arg === '--stitch-error') stitchError = finiteNumber(rest[++i], '--stitch-error')
    else if (arg === '--data-max-texture')
      dataMaxTextureSize = finiteNumber(rest[++i], '--data-max-texture')
    else if (arg === '--opaque') opaque = true
    else if (arg === '--no-opaque' || arg === '--keep-transparency') opaque = false
    else if (arg === '--no-pbr-normalize') normalizePbrOption = false
    else if (arg === '--decimate-artwork') decimateArtwork = true
    else if (arg === '--no-uv-remap') uvRemap = false
    else if (!arg.startsWith('--')) input = arg
  }

  return {
    input,
    out,
    options: {
      texture,
      geometry,
      maxTextureSize,
      textureQuality,
      artworkTextureQuality,
      artworkMaxTextureSize,
      opaque,
      normalizePbr: normalizePbrOption,
      simplify,
      simplifyError,
      simplifyUvWeight,
      ...(decimateArtwork ? { decimateArtwork: true } : {}),
      ...(uvRemap ? {} : { uvRemap: false }),
      simplifyNormalWeight,
      stitch,
      stitchError,
      dataMaxTextureSize,
    },
  }
}
