#!/usr/bin/env node
/**
 * Per-colourway census of the fabric colour a CLO export actually carries.
 *
 * WHY. Four of the owner's five FIXED GLBs left CLO with every colourway pointing at
 * the SAME fabric texture with a WHITE colour factor, so all five colour buttons
 * showed one garment (audit F2-02, F2-03, F1-04, CG-06). The suspect is the export
 * setting "Diffuse Color Combined on Texture", and the test is a pair of exports
 * differing only by that setting (fix plan Rank 1). This prints, for each variant,
 * every material it binds with its baseColorFactor and baseColorTexture image index,
 * so two files can be compared in one screen — reading only the JSON chunk, so a
 * 500 MB export costs what a 5 MB one costs.
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/colourway-factors.mjs <file.glb> [--all]     # --all: every material, not only fabric-like ones
 */
import { resolve } from 'node:path'
import { readGltfJson } from '../src/describe.ts'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: colourway-factors.mjs <file.glb> [--all]')
  process.exit(2)
}
const all = args.includes('--all')
const gltf = await readGltfJson(resolve(file))
const materials = gltf.materials ?? []
const variants = gltf.extensions?.KHR_materials_variants?.variants ?? []
const hex = (f) =>
  f
    ? `#${f
        .slice(0, 3)
        .map((c) =>
          Math.round(Math.min(1, Math.max(0, c)) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    : '#ffffff'
const describeMaterial = (index) => {
  const m = materials[index] ?? {}
  const pbr = m.pbrMetallicRoughness ?? {}
  const factor = pbr.baseColorFactor
  const tex = pbr.baseColorTexture?.index
  const image = tex !== undefined ? gltf.textures?.[tex]?.source : undefined
  return {
    name: m.name ?? `#${index}`,
    factor: hex(factor),
    alpha: factor ? factor[3] : 1,
    image: image ?? '-',
  }
}
const fabricLike = (name) =>
  /fabric|cloth|main|body|panel|knit|jersey|mesh|rib/i.test(name) ||
  !/logo|print|graphic|slogan|label|zipper|zip|topstitch|stitch|button|slider|puller|stopper|teeth|tape/i.test(
    name,
  )

// Which materials does each variant bind? Read off the PRIMITIVES — the root
// extension lists only the variant names.
const byVariant = variants.map(() => new Set())
const defaults = new Set()
for (const mesh of gltf.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.material !== undefined) defaults.add(prim.material)
    for (const mapping of prim.extensions?.KHR_materials_variants?.mappings ?? []) {
      for (const v of mapping.variants ?? []) byVariant[v]?.add(mapping.material)
    }
  }
}
console.log(
  `${file}\n  materials ${materials.length}, images ${(gltf.images ?? []).length}, variants ${variants.length}`,
)
if (variants.length === 0) {
  console.log('  (no KHR_materials_variants — single colourway; default materials below)')
}
const rows = variants.length
  ? variants.map((v, i) => [v.name ?? `variant ${i}`, byVariant[i]])
  : [['(default)', defaults]]
for (const [name, set] of rows) {
  const list = [...set].map(describeMaterial).filter((d) => all || fabricLike(d.name))
  const distinctFactors = new Set(list.map((d) => d.factor))
  const distinctImages = new Set(list.map((d) => d.image))
  console.log(
    `\n  ${name}: ${set.size} materials bound; ${list.length} shown; ${distinctFactors.size} distinct factor(s), ${distinctImages.size} distinct image(s)`,
  )
  for (const d of list.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`    ${d.factor}  a=${d.alpha}  img=${String(d.image).padStart(3)}  ${d.name}`)
  }
}
