import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Document, Material, Primitive } from '@gltf-transform/core'
import { KHRMaterialsVariants } from '@gltf-transform/extensions'
import { copyToDocument } from '@gltf-transform/functions'
import { createIO } from './io'
import {
  DEFAULT_MAX_TEXTURE,
  DEFAULT_TEXTURE_QUALITY,
  type OptimizeOptions,
  optimizeDocument,
} from './optimize'

export interface MergeInput {
  /** Path to one raw per-colourway GLB (e.g. n001-navy.glb). */
  file: string
  /** KHR_materials_variants name — MUST equal the CMS variantId (e.g. N001-NAVY). */
  variantName: string
}

/**
 * Merge options are the shared optimisation options. Programmatic defaults stay
 * conservative (no re-encoding), so callers/tests opt in explicitly; the CLI
 * defaults to WebP texture compression.
 */
export type MergeOptions = OptimizeOptions

export interface MergeResult {
  outputFile: string
  variants: string[]
  primitiveCount: number
  materialCount: number
  bytes: number
}

export interface ParsedMergeArgs {
  inputs: MergeInput[]
  out: string | null
  /** Retained for the historic CLI contract; mirrors `options.geometry === 'draco'`. */
  draco: boolean
  /** Fully-resolved optimisation options passed straight to mergeVariants. */
  options: OptimizeOptions
}

/**
 * Parse `merge` command arguments. Pure and exported (kept out of cli.ts,
 * which auto-runs on import) so the CLI contract is unit-testable. Splits
 * `<file>=<VARIANT-ID>` on the LAST `=` so paths may contain `=`. Throws on a
 * malformed token.
 *
 * Best-practice defaults: WebP textures capped at 2048 px (the dominant size
 * win for CLO exports). Geometry compression stays opt-in via `--draco` /
 * `--meshopt`. `--no-webp` disables texture re-encoding.
 */
export function parseMergeArgs(rest: string[]): ParsedMergeArgs {
  const inputs: MergeInput[] = []
  let out: string | null = null
  let texture: OptimizeOptions['texture'] = 'webp'
  let geometry: OptimizeOptions['geometry'] = 'none'
  let maxTextureSize = DEFAULT_MAX_TEXTURE
  let textureQuality = DEFAULT_TEXTURE_QUALITY
  // Solid fabric is the safe default for apparel; sheer garments opt out.
  let opaque = true
  let simplify: number | undefined

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '--out') out = rest[++i] ?? null
    else if (arg === '--draco') geometry = 'draco'
    else if (arg === '--meshopt') geometry = 'meshopt'
    else if (arg === '--no-webp' || arg === '--no-textures') texture = 'none'
    else if (arg === '--webp') texture = 'webp'
    else if (arg === '--ktx2') texture = 'ktx2'
    else if (arg === '--max-texture') maxTextureSize = Number(rest[++i] ?? DEFAULT_MAX_TEXTURE)
    else if (arg === '--quality') textureQuality = Number(rest[++i] ?? DEFAULT_TEXTURE_QUALITY)
    else if (arg === '--simplify') simplify = Number(rest[++i])
    else if (arg === '--opaque') opaque = true
    else if (arg === '--no-opaque' || arg === '--keep-transparency') opaque = false
    else {
      const eq = arg.lastIndexOf('=')
      if (eq === -1) throw new Error(`Expected <file.glb>=<VARIANT-ID>, got "${arg}"`)
      inputs.push({ file: arg.slice(0, eq), variantName: arg.slice(eq + 1) })
    }
  }

  return {
    inputs,
    out,
    draco: geometry === 'draco',
    options: { texture, geometry, maxTextureSize, textureQuality, opaque, simplify },
  }
}

interface PrimitiveFingerprint {
  index: number
  meshName: string
  mode: number
  vertexCount: number
  indexCount: number
}

function listRenderPrimitives(document: Document): Primitive[] {
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
}

function fingerprint(document: Document): PrimitiveFingerprint[] {
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) =>
      mesh.listPrimitives().map((prim) => ({
        meshName: mesh.getName(),
        mode: prim.getMode(),
        vertexCount: prim.getAttribute('POSITION')?.getCount() ?? 0,
        indexCount: prim.getIndices()?.getCount() ?? 0,
      })),
    )
    .map((entry, index) => ({ index, ...entry }))
}

function assertSameTopology(
  baseFile: string,
  base: PrimitiveFingerprint[],
  otherFile: string,
  other: PrimitiveFingerprint[],
): void {
  const fail = (detail: string): never => {
    throw new Error(
      `Colourway GLBs do not share the same geometry — cannot merge safely.\n` +
        `  base:  ${baseFile}\n  other: ${otherFile}\n  ${detail}\n` +
        `CLO exports for each colourway must come from the same garment/pose. ` +
        `If this product's exports genuinely differ, publish it with ` +
        `variantMode "separate-glb-per-colour" instead — the viewer fully supports it.`,
    )
  }
  if (base.length !== other.length) {
    fail(`primitive count differs: ${base.length} vs ${other.length}`)
  }
  for (let i = 0; i < base.length; i++) {
    const a = base[i]!
    const b = other[i]!
    if (a.mode !== b.mode || a.vertexCount !== b.vertexCount || a.indexCount !== b.indexCount) {
      fail(
        `primitive #${i} (mesh "${a.meshName}") differs: ` +
          `mode ${a.mode}/${b.mode}, vertices ${a.vertexCount}/${b.vertexCount}, ` +
          `indices ${a.indexCount}/${b.indexCount}`,
      )
    }
  }
}

/**
 * Merge one raw GLB per colourway into a single production GLB whose
 * colourways are bound as KHR_materials_variants entries named after the
 * CMS variantIds. The first input provides the geometry; every input
 * (including the first) contributes one variant's materials.
 */
export async function mergeVariants(
  inputs: MergeInput[],
  outputFile: string,
  options: MergeOptions = {},
): Promise<MergeResult> {
  if (inputs.length < 2) {
    throw new Error('Need at least two colourway GLBs to merge (one per colourway).')
  }
  const names = inputs.map((i) => i.variantName)
  if (new Set(names).size !== names.length) {
    throw new Error(`Duplicate variant names in input list: ${names.join(', ')}`)
  }

  const io = await createIO()
  const first = inputs[0]!
  const base = await io.read(first.file)
  const baseFp = fingerprint(base)
  const basePrims = listRenderPrimitives(base)
  if (basePrims.length === 0) {
    throw new Error(`${first.file} contains no mesh primitives.`)
  }

  const variantsExt = base.createExtension(KHRMaterialsVariants)

  // Variant 0: the base file's own materials.
  const baseVariant = variantsExt.createVariant(first.variantName)
  const mappingLists = basePrims.map((prim, i) => {
    const list = variantsExt.createMappingList()
    const material = prim.getMaterial()
    if (material) {
      list.addMapping(variantsExt.createMapping().setMaterial(material).addVariant(baseVariant))
    } else {
      // A KHR_materials_variants mapping requires a material. A primitive with
      // no material simply uses the default material for this variant; emitting
      // a mapping with a null material would be spec-invalid.
      console.warn(
        `[merge] primitive #${i} has no material for variant "${first.variantName}" — ` +
          `skipping its variant mapping (default material applies).`,
      )
    }
    prim.setExtension('KHR_materials_variants', list)
    return list
  })

  // Each further file contributes materials only.
  for (const input of inputs.slice(1)) {
    const source = await io.read(input.file)
    assertSameTopology(first.file, baseFp, input.file, fingerprint(source))
    const sourcePrims = listRenderPrimitives(source)

    const sourceMaterials = [
      ...new Set(sourcePrims.map((p) => p.getMaterial()).filter((m) => m !== null)),
    ]
    const copied = copyToDocument(base, source, sourceMaterials)

    const variant = variantsExt.createVariant(input.variantName)
    sourcePrims.forEach((prim, i) => {
      const material = prim.getMaterial()
      // copyToDocument returns a Map<Property, Property>; the copy of a Material
      // is a Material. Narrow the type here so the mapping is correctly typed.
      const target = material ? (copied.get(material) as Material | undefined) : null
      if (!target) {
        // No material for this primitive in this colourway → fall back to the
        // default material for this variant rather than binding a null mapping.
        console.warn(
          `[merge] primitive #${i} has no material in variant "${input.variantName}" — ` +
            `skipping its variant mapping (default material applies).`,
        )
        return
      }
      mappingLists[i]!.addMapping(
        variantsExt.createMapping().setMaterial(target).addVariant(variant),
      )
    })
  }

  // Apply the shared optimisation chain (texture/geometry compression, plus the
  // opaque + double-sided step) through the same path the `optimize` command
  // uses, so merged and single-file GLBs are treated identically.
  await optimizeDocument(base, options)

  await mkdir(dirname(outputFile), { recursive: true })
  await io.write(outputFile, base)

  const { size } = await stat(outputFile)
  return {
    outputFile,
    variants: names,
    primitiveCount: basePrims.length,
    materialCount: base.getRoot().listMaterials().length,
    bytes: size,
  }
}
