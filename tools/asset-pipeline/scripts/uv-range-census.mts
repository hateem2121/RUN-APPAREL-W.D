/**
 * UV RANGE CENSUS — what Rank 11 (audit CT-08 / F1-10 / GEO-01) has to move.
 *
 * glTF-Transform's quantizer refuses any TEXCOORD accessor outside 0..1 (a fact, not a
 * bug: KHR_mesh_quantization stores UVs as normalised integers, which cannot hold 37.4).
 * CLO writes UVs in pattern space, so on the live catalogue 46.8% of the geometry is
 * 32-bit floats while positions are 16-bit. This prints, per primitive, every UV set's
 * range and storage, which materials draw it (default and every colourway), and which
 * of those materials already carry a KHR_texture_transform — the three facts the remap
 * needs before it touches anything.
 *
 *   npx tsx scripts/uv-range-census.mts <file.glb> [--verbose]
 */
import { readFile } from 'node:fs/promises'
import { NodeIO, type Material, type Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { attributeBytes } from '../src/attribute-bytes.ts'
import { readGltfJson } from '../src/describe.ts'

const [file, ...flags] = process.argv.slice(2)
if (!file) throw new Error('usage: uv-range-census <file.glb> [--verbose]')
const verbose = flags.includes('--verbose')

await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const document = await io.read(file)
const root = document.getRoot()

const materialsOf = (prim: Primitive): Material[] => {
  const out: Material[] = []
  const base = prim.getMaterial()
  if (base) out.push(base)
  const list = prim.getExtension<{ listMappings(): { getMaterial(): Material | null }[] }>(
    'KHR_materials_variants',
  )
  if (list)
    for (const m of list.listMappings()) {
      const mat = m.getMaterial()
      if (mat && !out.includes(mat)) out.push(mat)
    }
  return out
}
const slotsOf = (m: Material) =>
  [
    ['baseColor', m.getBaseColorTextureInfo()],
    ['normal', m.getNormalTextureInfo()],
    ['metallicRoughness', m.getMetallicRoughnessTextureInfo()],
    ['occlusion', m.getOcclusionTextureInfo()],
    ['emissive', m.getEmissiveTextureInfo()],
  ] as const

let prims = 0,
  outOfRange = 0,
  floatSets = 0,
  quantizedSets = 0,
  transformsSeen = 0,
  primsSharingAccessor = 0
const accessorUsers = new Map<object, number>()
const materialRanges = new Map<
  Material,
  { minU: number; maxU: number; minV: number; maxV: number; prims: number }
>()
const rows: string[] = []
for (const [mi, mesh] of root.listMeshes().entries()) {
  for (const [pi, prim] of mesh.listPrimitives().entries()) {
    prims++
    const mats = materialsOf(prim)
    for (const semantic of prim.listSemantics().filter((s) => s.startsWith('TEXCOORD_'))) {
      const acc = prim.getAttribute(semantic)!
      accessorUsers.set(acc, (accessorUsers.get(acc) ?? 0) + 1)
      const min = acc.getMinNormalized([]) as number[],
        max = acc.getMaxNormalized([]) as number[]
      const inRange = min.every((v) => v >= 0) && max.every((v) => v <= 1)
      if (!inRange) outOfRange++
      if (acc.getNormalized()) quantizedSets++
      else floatSets++
      for (const m of mats) {
        const r = materialRanges.get(m) ?? {
          minU: Infinity,
          maxU: -Infinity,
          minV: Infinity,
          maxV: -Infinity,
          prims: 0,
        }
        r.minU = Math.min(r.minU, min[0]!)
        r.maxU = Math.max(r.maxU, max[0]!)
        r.minV = Math.min(r.minV, min[1]!)
        r.maxV = Math.max(r.maxV, max[1]!)
        r.prims++
        materialRanges.set(m, r)
      }
      rows.push(
        `${mesh.getName() || `mesh#${mi}`}[${pi}] ${semantic} ${acc.getNormalized() ? `quantized ${acc.getComponentType()}` : 'float32'} u ${min[0]!.toFixed(3)}..${max[0]!.toFixed(3)} v ${min[1]!.toFixed(3)}..${max[1]!.toFixed(3)} ${inRange ? 'IN' : 'OUT'} ← ${mats.map((m) => m.getName()).join(' | ')}`,
      )
    }
  }
}
for (const n of accessorUsers.values()) if (n > 1) primsSharingAccessor++
const transformRows: string[] = []
for (const m of root.listMaterials())
  for (const [slot, info] of slotsOf(m)) {
    const t = info?.getExtension<{
      getOffset(): number[]
      getScale(): number[]
      getRotation(): number
    }>('KHR_texture_transform')
    if (t) {
      transformsSeen++
      transformRows.push(
        `${m.getName()} ${slot}: offset ${t.getOffset().map((v) => v.toFixed(3))} scale ${t.getScale().map((v) => v.toFixed(3))} rot ${t.getRotation().toFixed(3)}`,
      )
    }
  }
// A material drawn by several primitives with DIFFERENT ranges needs one shared remap (the union).
let materialsMultiPrim = 0
for (const r of materialRanges.values()) if (r.prims > 1) materialsMultiPrim++

const gltf = await readGltfJson(file)
const bytes = attributeBytes(gltf, (await readFile(file)).byteLength)
console.log(`${file}`)
console.log(
  `  primitives ${prims}; UV sets ${floatSets + quantizedSets} (float32 ${floatSets}, quantized ${quantizedSets}); out of 0..1: ${outOfRange}`,
)
console.log(
  `  materials ${root.listMaterials().length}, drawn by >1 primitive: ${materialsMultiPrim}; UV accessors shared by >1 primitive: ${primsSharingAccessor}`,
)
console.log(
  `  existing KHR_texture_transform: ${transformsSeen}${transformRows.length ? `\n    ${transformRows.slice(0, 8).join('\n    ')}` : ''}`,
)
console.log(
  `  bytes: ${Object.entries(bytes.bySemantic)
    .map(([k, v]) => `${k} ${(v / 1048576).toFixed(2)} MB`)
    .join(
      ', ',
    )}; geometry ${(bytes.geometryBytes / 1048576).toFixed(2)} MB; images ${(bytes.imageBytes / 1048576).toFixed(2)} MB; plausible ${bytes.plausible}`,
)
if (verbose) for (const r of rows) console.log(`  ${r}`)
else {
  const out = rows.filter((r) => r.includes(' OUT '))
  console.log(`  widest out-of-range rows:`)
  for (const r of out.sort((a, b) => b.length - a.length).slice(0, 6))
    console.log(`    ${r.slice(0, 200)}`)
}
