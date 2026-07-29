import { readFile, stat } from 'node:fs/promises'
import type { Primitive } from '@gltf-transform/core'
import type { KHRMaterialsVariants, MappingList } from '@gltf-transform/extensions'
import { createIO } from './io'

/** Warn when a production GLB is heavier than this — QR scans are mobile-first. */
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
  const io = await createIO()
  const document = await io.read(file)
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
