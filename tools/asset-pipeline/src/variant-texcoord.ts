import type { Document, Material, Primitive, Transform } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import { createTransform } from '@gltf-transform/functions'

/**
 * Re-point variant-only materials at UV sets their primitive actually has.
 *
 * THE DEFECT. `prune()` renumbers a primitive's UV attributes — its own comment in
 * `tools/asset-pipeline/CLAUDE.md` warns that "a lone second UV set becomes
 * `TEXCOORD_0` before decimation" — and it updates the material bound as the
 * primitive's DEFAULT. It does not walk `KHR_materials_variants`, so a material
 * reachable only through a colourway mapping keeps sampling `TEXCOORD_1` after that
 * attribute has been renumbered away.
 *
 * The result is not merely a spec violation. The default colourway renders
 * correctly and every OTHER colourway looks for a UV set that no longer exists, so
 * its printed artwork draws with wrong or absent coordinates — visible only after
 * the visitor clicks a colour.
 *
 * ⚠️ THE SECOND TIME IN ONE DAY THAT VARIANT-ONLY MATERIALS WERE SKIPPED BY
 * SOMETHING THAT HANDLES THE EAGER ONE CORRECTLY. The other was the viewer's decal
 * depth bias, which reached 6 of 26 decals for exactly the same reason. When a
 * pass touches materials, ask what it does with the ones behind a variant.
 *
 * ⚠️ LATENT, NOT OBSERVED IN PRODUCTION — and said so rather than implied.
 * Measured 2026-08-27 across all 28 raw CLO exports: **not one material samples a
 * texCoord other than 0**, so no real garment can reach this today. It was found
 * because `placeholders.ts` puts its artwork on a second UV set deliberately, and
 * the Khronos validator reported 12 `MESH_PRIMITIVE_TOO_FEW_TEXCOORDS` errors the
 * first time it ran. Keep the fixture's second UV set: it is the only thing in this
 * repo that exercises the renumbering path at all.
 */
export function alignVariantTexCoords(
  options: { onResult?: (fixed: string[]) => void } = {},
): Transform {
  return createTransform('alignVariantTexCoords', async (document: Document): Promise<void> => {
    const fixed: string[] = []

    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const available = availableTexCoords(primitive)
        // No UV attributes at all: nothing to point at, and clamping to 0 would be
        // a guess. Leave it — the validator will still say so, loudly.
        if (!available.size) continue
        const fallback = Math.max(...available)

        for (const material of variantMaterials(primitive)) {
          for (const info of listTextureInfos(material)) {
            const texCoord = info.getTexCoord()
            if (available.has(texCoord)) continue
            info.setTexCoord(fallback)
            fixed.push(`${material.getName() || '(unnamed)'} TEXCOORD_${texCoord}→${fallback}`)
          }
        }
      }
    }

    options.onResult?.(fixed)
    if (fixed.length) {
      document
        .getLogger()
        .debug(`alignVariantTexCoords: repointed ${fixed.length} texture binding(s).`)
    }
  })
}

/** UV set indices this primitive actually carries, e.g. {0} after prune renumbers. */
function availableTexCoords(primitive: Primitive): Set<number> {
  const sets = new Set<number>()
  for (const name of primitive.listSemantics()) {
    const match = /^TEXCOORD_(\d+)$/.exec(name)
    if (match?.[1] !== undefined) sets.add(Number(match[1]))
  }
  return sets
}

/**
 * Materials reachable from this primitive ONLY through a variant mapping.
 *
 * The default material is deliberately excluded: `prune()` already renumbered it,
 * and touching it again could undo correct work.
 */
function variantMaterials(primitive: Primitive): Material[] {
  const mappingList = primitive.getExtension<MappingList>('KHR_materials_variants')
  if (!mappingList) return []
  const fallback = primitive.getMaterial()
  const out: Material[] = []
  for (const mapping of mappingList.listMappings()) {
    const material = mapping.getMaterial()
    if (material && material !== fallback) out.push(material)
  }
  return out
}

/** Every TextureInfo a material carries, across core and extension slots. */
function listTextureInfos(
  material: Material,
): { getTexCoord(): number; setTexCoord(n: number): unknown }[] {
  const infos = [
    material.getBaseColorTextureInfo(),
    material.getMetallicRoughnessTextureInfo(),
    material.getNormalTextureInfo(),
    material.getOcclusionTextureInfo(),
    material.getEmissiveTextureInfo(),
  ]
  return infos.filter((i): i is NonNullable<typeof i> => i !== null)
}
