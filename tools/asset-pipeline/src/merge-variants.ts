import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Document, Primitive } from '@gltf-transform/core'
import { KHRMaterialsVariants } from '@gltf-transform/extensions'
import { copyToDocument, dedup, draco, prune } from '@gltf-transform/functions'
import { createIO } from './io'

export interface MergeInput {
  /** Path to one raw per-colourway GLB (e.g. n001-navy.glb). */
  file: string
  /** KHR_materials_variants name — MUST equal the CMS variantId (e.g. N001-NAVY). */
  variantName: string
}

export interface MergeOptions {
  /** Apply Draco compression to the merged output. Off by default — evaluate case-by-case. */
  draco?: boolean
}

export interface MergeResult {
  outputFile: string
  variants: string[]
  primitiveCount: number
  materialCount: number
  bytes: number
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
  const mappingLists = basePrims.map((prim) => {
    const list = variantsExt.createMappingList()
    list.addMapping(
      variantsExt.createMapping().setMaterial(prim.getMaterial()).addVariant(baseVariant),
    )
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
      const target = material ? copied.get(material) : null
      mappingLists[i]!.addMapping(
        variantsExt
          .createMapping()
          .setMaterial((target ?? null) as never)
          .addVariant(variant),
      )
    })
  }

  const transforms = [dedup(), prune({ keepExtras: true })]
  if (options.draco) transforms.push(draco())
  await base.transform(...transforms)

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
