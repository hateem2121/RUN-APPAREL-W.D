import { readFile, stat } from 'node:fs/promises'
import type { Primitive } from '@gltf-transform/core'
import type { KHRMaterialsVariants, MappingList } from '@gltf-transform/extensions'
import { type GlbReport, SIZE_WARNING_BYTES, describeSoftArtwork } from './glb-report'
import { checkGltfSpecFile } from './gltf-spec'
import { readGlb } from './io'
import { auditArtworkAlpha, findCrushedArtwork } from './texture-artwork'
import { CRUSHED_BYTES_PER_PIXEL, offUv0Warning, summariseUvSets } from './textures'
import { readVariantColoursSampled } from './variant-colour'

// The report's shape, the size limit and describeSoftArtwork live in glb-report.ts since
// 2026-10-03, so the shrink Worker can import them without its typecheck reaching this
// file's Node calls (see there). Re-exported so every `from './validate'` import still works.
export type { GlbReport } from './glb-report'
export { SIZE_WARNING_BYTES, describeSoftArtwork } from './glb-report'

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
      `${crushedArtwork.length} printed-artwork texture(s) are stored below ${CRUSHED_BYTES_PER_PIXEL} bytes per INK pixel — ` +
        `${crushedArtwork.map((c) => `${c.name} ${c.width}x${c.height} at ${c.bytesPerInkPixel} (${Math.round(c.inkFraction * 100)}% ink)`).join('; ')}. ` +
        'Clean detailed prints measure 0.021-0.13 per ink pixel; the crushed controls 0.007-0.009 (flat one-colour prints are exempt). Render the file and look ' +
        'at the lettering before publishing; if the garment genuinely has a flat single-colour label this is expected.',
    )
  }
  // Artwork that ended up translucent, or a cut-out whose threshold drifted.
  // <model-viewer> has no order-independent transparency, so BLEND is the "half
  // visible, half not" symptom directly — and the solidify step's OUTPUT was
  // never checked, only its inputs.
  const { problems: artworkAlphaProblems, soft: artworkSoftOnBlend } =
    await auditArtworkAlpha(document)
  const blend = artworkAlphaProblems.filter((p) => p.problem === 'blend').map((p) => p.material)
  const cutoff = artworkAlphaProblems.filter((p) => p.problem === 'cutoff').map((p) => p.material)
  if (blend.length > 0) {
    warnings.push(
      `Printed artwork left see-through on: ${blend.join(', ')}. These are hard-edged, fully opaque prints ` +
        'that the opaque step should have resolved to a cut-out (MASK, alphaCutoff 0.5) or made solid, and did ' +
        'not — a pipeline fault, not an export problem. <model-viewer> has no order-independent transparency, ' +
        'so they render half-visible and sort badly against the garment.',
    )
  }
  if (artworkSoftOnBlend.length > 0) {
    warnings.push(
      `Soft printed artwork kept see-through on: ${artworkSoftOnBlend.map(describeSoftArtwork).join('; ')}. ` +
        'The pipeline left these blended on purpose rather than cutting them out. Look at them in the viewer; ' +
        'if a print should be solid, set its opacity to 100% in CLO and re-export.',
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
    artworkSoftOnBlend,
    variantColours: await readVariantColoursSampled(document),
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
