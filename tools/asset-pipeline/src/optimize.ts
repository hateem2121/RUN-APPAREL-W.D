import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Document, Transform } from '@gltf-transform/core'
import { dedup, draco, meshopt, prune } from '@gltf-transform/functions'
import { ktx2 } from 'ktx2-encoder/gltf-transform'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { createIO } from './io'
import {
  type AlphaProfile,
  CUTOUT_MID_FRACTION,
  CUTOUT_MIN_TRANSPARENT,
  profileAlpha,
} from './textures'
import {
  type AttributeSimplifier,
  type SimplifyTexturedResult,
  simplifyTextured,
} from './simplify-textured'
import { type TextureArtworkResult, compressTexturesForArtwork } from './texture-artwork'

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
  /** Same for vertex normals — protects shading rather than artwork. */
  simplifyNormalWeight?: number | undefined
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

/** Below this base-colour alpha a material is doing something deliberate with transparency. */
const OPAQUE_FACTOR_THRESHOLD = 0.99

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
      const alpha: AlphaProfile = image
        ? await profileAlpha(image)
        : { character: 'none', transparentFraction: 0, opaqueFraction: 0, midFraction: 0 }
      const factor = material.getBaseColorFactor()[3] ?? 1

      // A cutout is "hardly any partial alpha" AND "actually cut out somewhere".
      // The second half is not decoration: a uniformly translucent inset has
      // little partial alpha too, and MASKing it at 0.5 deletes it outright
      // rather than hardening it. See CUTOUT_MIN_TRANSPARENT.
      const cutout =
        alpha.character === 'binary' ||
        (alpha.midFraction <= CUTOUT_MID_FRACTION &&
          alpha.transparentFraction >= CUTOUT_MIN_TRANSPARENT)

      if (factor < OPAQUE_FACTOR_THRESHOLD) {
        // An explicit declaration on the material beats anything inferred from
        // its pixels. glTF effective alpha is factor.a * texel.a, so a material
        // that declares itself sheer at 0.4 can never reach alphaCutoff 0.5 —
        // MASK would discard every fragment and render it as nothing at all,
        // silently, passing every gate.
        result.keptBlend++
      } else if (cutout) {
        // A real cutout. Keep the shape, lose the sorting problem.
        material.setAlphaMode('MASK').setAlphaCutoff(0.5)
        result.masked++
      } else if (alpha.character === 'graded') {
        // Deliberate translucency. Leave it and say so — the operator can still
        // decide this garment is not sheer and re-export it.
        result.keptBlend++
      } else {
        material.setAlphaMode('OPAQUE')
        result.opaqued++
      }
    }

    if (material.getAlphaMode() !== 'MASK') {
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
  /** Present only when a simplify pass ran. */
  simplify?: SimplifyTexturedResult
  /** Present only when the WebP texture pass ran. */
  textures?: TextureArtworkResult
  /** Present only when the opaque/solidify pass ran. */
  solidify?: SolidifyResult
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
  const transforms: Transform[] = [dedup(), prune({ keepExtras: true })]

  // Force fabric solid before texture/geometry passes touch the materials. CLO
  // often marks opaque fabric as translucent (alphaMode BLEND); model-viewer has
  // no OIT and would render it see-through. Opt in — the CLI defaults it on.
  if (options.opaque === true) {
    transforms.push(async (document: Document) => {
      telemetry.solidify = await solidifyMaterials(document)
    })
  }

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
        onResult: (result) => {
          telemetry.textures = result
        },
      }),
    )
  } else if (options.texture === 'ktx2') {
    const imageDecoder = makeImageDecoder(max)
    // Two passes, following Basis Universal best practice:
    //  - Normal maps → UASTC (preserves the surface detail lossy ETC1S would smear).
    //  - Colour / data maps → ETC1S (far higher compression where it is safe).
    // The normal pass runs first; the ETC1S pass is scoped to colour slots so it
    // never touches the already-encoded normal maps.
    transforms.push(
      ktx2({ isUASTC: true, generateMipmap: true, imageDecoder, slots: /normalTexture/i }),
      ktx2({
        isUASTC: false,
        qualityLevel: options.textureQuality ?? DEFAULT_TEXTURE_QUALITY,
        generateMipmap: true,
        imageDecoder,
        slots: /(baseColor|emissive|occlusion|metallicRoughness)Texture/i,
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
        onResult: (result) => {
          telemetry.simplify = result
        },
      }),
    )
  }

  const geometry = resolveGeometry(options)
  if (geometry === 'draco') {
    transforms.push(draco())
  } else if (geometry === 'meshopt') {
    await MeshoptEncoder.ready
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  }

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
  /** How each translucent material was resolved, when the opaque pass ran. */
  solidify?: SolidifyResult
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
  const document = await io.read(inputFile)
  const telemetry: OptimizeTelemetry = {}
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
    ...(telemetry.simplify ? { simplify: telemetry.simplify } : {}),
    ...(telemetry.textures ? { textures: telemetry.textures } : {}),
    ...(telemetry.solidify ? { solidify: telemetry.solidify } : {}),
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
  let simplify: number | undefined
  let simplifyError: number | undefined
  let simplifyUvWeight: number | undefined
  let simplifyNormalWeight: number | undefined

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '--out') out = rest[++i] ?? null
    else if (arg === '--no-webp' || arg === '--no-textures') texture = 'none'
    else if (arg === '--webp') texture = 'webp'
    else if (arg === '--ktx2') texture = 'ktx2'
    else if (arg === '--draco') geometry = 'draco'
    else if (arg === '--meshopt') geometry = 'meshopt'
    else if (arg === '--max-texture') maxTextureSize = Number(rest[++i] ?? DEFAULT_MAX_TEXTURE)
    else if (arg === '--quality') textureQuality = Number(rest[++i] ?? DEFAULT_TEXTURE_QUALITY)
    else if (arg === '--artwork-quality')
      artworkTextureQuality = Number(rest[++i] ?? DEFAULT_ARTWORK_TEXTURE_QUALITY)
    else if (arg === '--artwork-max-texture')
      artworkMaxTextureSize = Number(rest[++i] ?? DEFAULT_ARTWORK_MAX_TEXTURE)
    else if (arg === '--simplify') simplify = Number(rest[++i])
    else if (arg === '--simplify-error') simplifyError = Number(rest[++i])
    else if (arg === '--uv-weight') simplifyUvWeight = Number(rest[++i])
    else if (arg === '--normal-weight') simplifyNormalWeight = Number(rest[++i])
    else if (arg === '--opaque') opaque = true
    else if (arg === '--no-opaque' || arg === '--keep-transparency') opaque = false
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
      simplify,
      simplifyError,
      simplifyUvWeight,
      simplifyNormalWeight,
    },
  }
}
