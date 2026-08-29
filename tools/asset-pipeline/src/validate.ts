import { readFile, stat } from 'node:fs/promises'
import type { Primitive } from '@gltf-transform/core'
import type { KHRMaterialsVariants, MappingList } from '@gltf-transform/extensions'
import { type SpecCheck, checkGltfSpecFile } from './gltf-spec'
import { readGlb } from './io'
import {
  type ArtworkAlphaProblem,
  type CrushedArtwork,
  findArtworkAlphaProblems,
  findCrushedArtwork,
} from './texture-artwork'
import { CRUSHED_BYTES_PER_PIXEL, offUv0Warning, summariseUvSets } from './textures'
import { type VariantColour, readVariantColours } from './variant-colour'

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

/** Uncompressed raster formats that should be re-encoded before upload. */
const UNCOMPRESSED_TEXTURE_MIME = new Set(['image/png', 'image/jpeg'])

const GLB_MAGIC = 0x46546c67 // 'glTF' little-endian
const GLB_JSON_CHUNK = 0x4e4f534a // 'JSON' little-endian

/**
 * Read `asset.generator` straight from the GLB's JSON chunk. This must NOT go
 * through gltf-transform: its reader overwrites `asset.generator` with its own
 * value on import, which would hide exactly the raw-CLO-export string we want to
 * catch. Returns '' for a non-GLB, malformed, or generator-less file.
 */
export async function readGlbGenerator(file: string): Promise<string> {
  try {
    const buf = await readFile(file)
    if (buf.length < 20 || buf.readUInt32LE(0) !== GLB_MAGIC) return ''
    const jsonLen = buf.readUInt32LE(12)
    if (buf.readUInt32LE(16) !== GLB_JSON_CHUNK || 20 + jsonLen > buf.length) return ''
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)) as {
      asset?: { generator?: unknown }
    }
    return typeof json.asset?.generator === 'string' ? json.asset.generator : ''
  } catch {
    return ''
  }
}

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
   * safe to block a publish on.
   */
  artworkAlphaProblems: ArtworkAlphaProblem[]
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

export interface VariantCheck {
  ok: boolean
  missing: string[]
  extra: string[]
}

/**
 * Inspect a GLB the same way <model-viewer>'s scenegraph does: the variant
 * list is collected from primitive-level mappings, not just the root array,
 * so unbound variants can never pass QA.
 */
export async function inspectGlb(file: string): Promise<GlbReport> {
  // A garment that cannot be READ cannot be validated, and six of the 28 raw
  // exports cannot — see repair-dead-textures.ts.
  const { document } = await readGlb(file)
  const root = document.getRoot()

  const variants = new Set<string>()
  const primitives: Primitive[] = root.listMeshes().flatMap((m) => m.listPrimitives())
  for (const prim of primitives) {
    const mappingList = prim.getExtension<MappingList>('KHR_materials_variants')
    if (!mappingList) continue
    for (const mapping of mappingList.listMappings()) {
      for (const variant of mapping.listVariants()) {
        const name = variant.getName()
        if (name) variants.add(name)
      }
    }
  }

  // Declaration order, straight off the extension. gltf-transform's reader builds
  // its variant list by mapping the file's `extensions.KHR_materials_variants
  // .variants` array in order, so listVariants() preserves it — unlike the sorted
  // set above. Filtered to the ones actually bound to a primitive, so the two
  // lists always describe the same set and only differ in order.
  const variantsExtension = root
    .listExtensionsUsed()
    .find((extension) => extension.extensionName === 'KHR_materials_variants') as
    | KHRMaterialsVariants
    | undefined
  const variantsInFileOrder = (variantsExtension?.listVariants() ?? [])
    .map((variant) => variant.getName())
    .filter((name) => name !== '' && variants.has(name))

  const { size } = await stat(file)
  const generator = await readGlbGenerator(file)
  const textures = root.listTextures()
  const uncompressedTextureCount = textures.filter((t) =>
    UNCOMPRESSED_TEXTURE_MIME.has(t.getMimeType()),
  ).length
  const materials = root.listMaterials()
  // alphaMode BLEND = translucent. <model-viewer> (three.js, no OIT) renders it
  // see-through — the classic CLO "my garment is transparent" symptom.
  const translucentMaterialCount = materials.filter((m) => m.getAlphaMode() === 'BLEND').length
  // Pixel-free: this walks material/texture metadata only, so reporting it on
  // every shrink job costs nothing.
  const { texCoordsInUse, usagesOffUv0, materialsWithMultipleUvSets, alphaModeCounts } =
    summariseUvSets(document)

  const warnings: string[] = []
  // A raw CLO export must never be published — it has not been merged,
  // variant-bound, or compressed. This is the single most common failure.
  if (/\bCLO\b/i.test(generator)) {
    warnings.push(
      `Generator is "${generator}" — this looks like a RAW CLO export. Run merge/optimize before uploading; never publish a raw CLO GLB.`,
    )
  }
  if (size > SIZE_WARNING_BYTES) {
    warnings.push(
      `File is ${(size / 1024 / 1024).toFixed(1)} MB (> ${SIZE_WARNING_BYTES / 1024 / 1024} MB) — heavy for mobile QR-scan loads. Run "pnpm pipeline optimize" (WebP/KTX2 textures + Meshopt/Draco geometry).`,
    )
  }
  if (uncompressedTextureCount > 0) {
    warnings.push(
      `${uncompressedTextureCount}/${textures.length} textures are raw PNG/JPEG — re-encode to WebP or KTX2 (usually the dominant size win for CLO exports).`,
    )
  }
  if (translucentMaterialCount > 0) {
    warnings.push(
      `${translucentMaterialCount}/${materials.length} materials are alphaMode BLEND (translucent) — <model-viewer> has no order-independent transparency, so the garment renders see-through. Re-run "pnpm pipeline optimize" (the opaque step is on by default), unless this garment is genuinely sheer.`,
    )
  }
  // Artwork on a UV set the simplifier does not weight — the leading suspect for
  // the damage on the first real garment. Reported here so it is visible on the
  // raw file, before any processing has had a chance to hide it.
  const offUv0 = offUv0Warning(materialsWithMultipleUvSets, usagesOffUv0)
  if (offUv0) warnings.push(offUv0)
  // The measurement that was already defined and never connected. N001's live
  // file has a 2048x2048 colour map at 0.003 bpp; this is the line that says so
  // on every job instead of only when somebody runs `pipeline textures` by hand.
  const crushedArtwork = await findCrushedArtwork(document)
  if (crushedArtwork.length > 0) {
    warnings.push(
      `${crushedArtwork.length} printed-artwork texture(s) are stored below ${CRUSHED_BYTES_PER_PIXEL} bytes/pixel — ` +
        `${crushedArtwork.map((c) => `${c.name} ${c.width}x${c.height} at ${c.bytesPerPixel}`).join('; ')}. ` +
        'A clean encode of flat artwork lands around 0.05-0.15, so this is far past it. Render the file and look ' +
        'at the lettering before publishing; if the garment genuinely has a flat single-colour label this is expected.',
    )
  }
  // Artwork that ended up translucent, or a cut-out whose threshold drifted.
  // <model-viewer> has no order-independent transparency, so BLEND is the "half
  // visible, half not" symptom directly — and the solidify step's OUTPUT was
  // never checked, only its inputs.
  const artworkAlphaProblems = await findArtworkAlphaProblems(document)
  const blend = artworkAlphaProblems.filter((p) => p.problem === 'blend').map((p) => p.material)
  const cutoff = artworkAlphaProblems.filter((p) => p.problem === 'cutoff').map((p) => p.material)
  if (blend.length > 0) {
    warnings.push(
      `Printed artwork left see-through on: ${blend.join(', ')}. <model-viewer> has no order-independent ` +
        'transparency, so these render half-visible and sort badly against the garment. The opaque step ' +
        'should have resolved them to a cut-out (MASK, alphaCutoff 0.5).',
    )
  }
  if (cutoff.length > 0) {
    warnings.push(
      `Cut-out threshold is not 0.5 on: ${cutoff.join(', ')}. Anything else thins or fattens the lettering.`,
    )
  }
  if (primitives.length === 0) warnings.push('No mesh primitives found.')

  return {
    file,
    bytes: size,
    variants: [...variants].sort(),
    variantsInFileOrder,
    meshCount: root.listMeshes().length,
    primitiveCount: primitives.length,
    materialCount: root.listMaterials().length,
    textureCount: textures.length,
    generator,
    uncompressedTextureCount,
    translucentMaterialCount,
    texCoordsInUse,
    alphaModeCounts,
    crushedArtwork,
    artworkAlphaProblems,
    variantColours: readVariantColours(document),
    spec: await checkGltfSpecFile(file),
    warnings,
  }
}

/** Compare bound variants against the CMS colourway variantId list. Order-insensitive, exact set match. */
export function checkVariants(report: GlbReport, expected: string[]): VariantCheck {
  const have = new Set(report.variants)
  const want = new Set(expected)
  const missing = expected.filter((v) => !have.has(v)).sort()
  const extra = report.variants.filter((v) => !want.has(v)).sort()
  return { ok: missing.length === 0 && extra.length === 0, missing, extra }
}
