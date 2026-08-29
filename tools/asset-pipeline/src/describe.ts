import { open, stat } from 'node:fs/promises'
import { classifyMaterialName } from './material-class'

/**
 * Read a raw CLO export's SHAPE without processing it.
 *
 * WHY THIS EXISTS. Every garment runs identical hardcoded flags from
 * `shrinkFlagsFor`, so compression strength cannot explain why some render
 * perfectly and others come back with damaged artwork. The INPUTS differ.
 * Measured 2026-08-26 across all 28 raw exports: 15 are texture-heavy, 12 are
 * geometry-heavy, and `shrink.ts` justifies its whole strategy on a comment that
 * is true of only one of them. This makes that difference visible in two seconds
 * instead of a pipeline run.
 *
 * ⚠️ READS THE JSON CHUNK ONLY — never the binary payload. That is why a 1,253 MB
 * export takes the same time as a 5 MB one. Do NOT "simplify" this to
 * `readFile(file)` the way `readGlbGenerator` (validate.ts) does: on the Cycling
 * Bib that pulls 1.3 GB into a Buffer, against a default V8 heap of ~4.09 GB.
 *
 * ⚠️ NOT gltf-transform, for the same reason `readGlbGenerator` is not. Its reader
 * normalises what it imports — it fills in an absent `metallicFactor` and
 * overwrites `asset.generator`. Both are exactly the raw-CLO shapes this has to
 * see. Reading the JSON directly is the only way to observe the file as it is.
 */

const GLB_MAGIC = 0x46546c67 // 'glTF' little-endian
const GLB_JSON_CHUNK = 0x4e4f534a // 'JSON' little-endian

/** At or above this fraction of bytes-in-textures, geometry levers have nothing to pull. */
export const TEXTURE_FAMILY_MIN_FRACTION = 0.6
/** Below this, the file is what `shrink.ts` was built for and today's flags are right. */
export const GEOMETRY_FAMILY_MAX_FRACTION = 0.4

/**
 * Metalness above this on a fabric material is a defect worth reporting.
 *
 * Cloth should be 0. The four measured offenders sit at 0.23, 0.29, 0.46 and
 * ABSENT (which glTF defaults to 1.0). 0.1 clears sensor noise without missing
 * any of them.
 */
const METALLIC_SUSPECT_MIN = 0.1

/** Which meshes are decorative thread. Same pattern topstitch.ts decimates against. */
const STITCH_NAME = /^topstitch/i

export type GlbFamily = 'geometry' | 'texture' | 'mixed'

export interface PbrSuspect {
  index: number
  name: string
  /** Resolved, i.e. glTF's default of 1.0 already applied when the key is absent. */
  metallicFactor: number
  roughnessFactor: number
}

export interface GlbMaterialCensus {
  total: number
  opaque: number
  blend: number
  mask: number
  doubleSided: number
}

export interface GlbDescription {
  file: string
  /** From the filesystem, not the header's own length field. */
  bytes: number
  generator: string
  family: GlbFamily
  textureBytes: number
  geometryBytes: number
  /** textureBytes / (textureBytes + geometryBytes). 0 when the file has neither. */
  textureFraction: number
  triangles: number
  stitchTriangles: number
  stitchFraction: number
  materials: GlbMaterialCensus
  /** Fabric or artwork, metallic, and with no MR texture to override it. Fixable. */
  pbrSuspects: PbrSuspect[]
  /** Metallic, no MR texture, and a name this cannot classify. REPORTED, never fixed. */
  unclassifiedMetallic: PbrSuspect[]
  colourways: { count: number; names: string[]; fullyMapped: boolean }
  /** `named` is expected to be 0 on every CLO export — a tripwire for a future change. */
  images: { total: number; named: number }
  /** Null on success. Set instead of throwing, so one bad file cannot break a batch. */
  error: string | null
}

/** Minimal shape of the bits of glTF JSON this reads. Everything else is ignored. */
interface RawPrimitive {
  mode?: number
  indices?: number
  attributes?: { POSITION?: number }
  extensions?: { KHR_materials_variants?: unknown }
}

interface RawGltf {
  asset?: { generator?: unknown }
  bufferViews?: { byteLength?: number }[]
  images?: { bufferView?: number; name?: unknown; uri?: unknown }[]
  accessors?: { bufferView?: number; count?: number }[]
  meshes?: { name?: string; primitives?: RawPrimitive[] }[]
  nodes?: { name?: string; mesh?: number }[]
  materials?: {
    name?: string
    alphaMode?: string
    doubleSided?: boolean
    pbrMetallicRoughness?: {
      metallicFactor?: number
      roughnessFactor?: number
      metallicRoughnessTexture?: unknown
    }
  }[]
  extensions?: { KHR_materials_variants?: { variants?: { name?: string }[] } }
}

function emptyDescription(file: string, error: string | null): GlbDescription {
  return {
    file,
    bytes: 0,
    generator: '',
    family: 'mixed',
    textureBytes: 0,
    geometryBytes: 0,
    textureFraction: 0,
    triangles: 0,
    stitchTriangles: 0,
    stitchFraction: 0,
    materials: { total: 0, opaque: 0, blend: 0, mask: 0, doubleSided: 0 },
    pbrSuspects: [],
    unclassifiedMetallic: [],
    colourways: { count: 0, names: [], fullyMapped: false },
    images: { total: 0, named: 0 },
    error,
  }
}

/** Pick the family from the texture fraction. The band between is deliberately named. */
export function familyFor(textureFraction: number): GlbFamily {
  if (textureFraction >= TEXTURE_FAMILY_MIN_FRACTION) return 'texture'
  if (textureFraction < GEOMETRY_FAMILY_MAX_FRACTION) return 'geometry'
  return 'mixed'
}

/**
 * Read and parse a GLB's JSON chunk with three positional reads and no full load.
 * Throws; `describeGlb` is what converts that into an `error` field.
 */
export async function readGltfJson(file: string): Promise<RawGltf> {
  const handle = await open(file, 'r')
  try {
    const size = (await handle.stat()).size
    if (size < 20) throw new Error('File is too short to be a GLB.')

    const head = Buffer.alloc(12)
    await handle.read(head, 0, 12, 0)
    if (head.readUInt32LE(0) !== GLB_MAGIC) throw new Error('File is not a GLB (bad magic).')

    const chunkHead = Buffer.alloc(8)
    await handle.read(chunkHead, 0, 8, 12)
    const jsonLength = chunkHead.readUInt32LE(0)
    if (chunkHead.readUInt32LE(4) !== GLB_JSON_CHUNK) {
      throw new Error('First GLB chunk is not JSON.')
    }
    // A corrupt length field must never become a multi-gigabyte Buffer.alloc.
    if (jsonLength <= 0 || 20 + jsonLength > size) {
      throw new Error(`JSON chunk length ${jsonLength} does not fit in a ${size}-byte file.`)
    }

    const json = Buffer.alloc(jsonLength)
    await handle.read(json, 0, jsonLength, 20)
    return JSON.parse(json.toString('utf8')) as RawGltf
  } finally {
    await handle.close()
  }
}

/** Triangles in one primitive. `mode` defaults to 4 (TRIANGLES) per the glTF spec. */
function primitiveTriangles(
  primitive: RawPrimitive,
  accessors: NonNullable<RawGltf['accessors']>,
): number {
  if ((primitive.mode ?? 4) !== 4) return 0
  const accessor =
    primitive.indices !== undefined
      ? accessors[primitive.indices]
      : accessors[primitive.attributes?.POSITION ?? -1]
  return Math.floor((accessor?.count ?? 0) / 3)
}

export async function describeGlb(file: string): Promise<GlbDescription> {
  let gltf: RawGltf
  let bytes = 0
  try {
    bytes = (await stat(file)).size
    gltf = await readGltfJson(file)
  } catch (error) {
    const failed = emptyDescription(file, error instanceof Error ? error.message : String(error))
    failed.bytes = bytes
    return failed
  }

  const out = emptyDescription(file, null)
  out.bytes = bytes
  out.generator = typeof gltf.asset?.generator === 'string' ? gltf.asset.generator : ''

  const views = gltf.bufferViews ?? []
  const accessors = gltf.accessors ?? []

  // Bytes are attributed by WHO REFERENCES a bufferView, and each view is counted
  // once — a view referenced twice is not twice the bytes.
  const imageViews = new Set<number>()
  for (const image of gltf.images ?? []) {
    if (image.bufferView !== undefined) imageViews.add(image.bufferView)
  }
  const accessorViews = new Set<number>()
  for (const accessor of accessors) {
    if (accessor.bufferView !== undefined) accessorViews.add(accessor.bufferView)
  }
  for (const index of imageViews) out.textureBytes += views[index]?.byteLength ?? 0
  for (const index of accessorViews) out.geometryBytes += views[index]?.byteLength ?? 0

  const classified = out.textureBytes + out.geometryBytes
  out.textureFraction = classified > 0 ? out.textureBytes / classified : 0
  out.family = familyFor(out.textureFraction)

  const meshes = gltf.meshes ?? []
  const meshTriangles = meshes.map((mesh) =>
    (mesh.primitives ?? []).reduce((sum, p) => sum + primitiveTriangles(p, accessors), 0),
  )
  for (let i = 0; i < meshes.length; i++) {
    const count = meshTriangles[i] ?? 0
    out.triangles += count
    if (STITCH_NAME.test(meshes[i]?.name ?? '')) out.stitchTriangles += count
  }
  // Some CLO exports name the NODE and leave the mesh anonymous. Only consulted
  // when the mesh names found nothing, so a file naming both is not double-counted.
  if (out.stitchTriangles === 0) {
    for (const node of gltf.nodes ?? []) {
      if (node.mesh !== undefined && STITCH_NAME.test(node.name ?? '')) {
        out.stitchTriangles += meshTriangles[node.mesh] ?? 0
      }
    }
  }
  out.stitchFraction = out.triangles > 0 ? out.stitchTriangles / out.triangles : 0

  const materials = gltf.materials ?? []
  out.materials.total = materials.length
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i]
    if (!material) continue
    const alphaMode = material.alphaMode ?? 'OPAQUE'
    if (alphaMode === 'BLEND') out.materials.blend++
    else if (alphaMode === 'MASK') out.materials.mask++
    else out.materials.opaque++
    if (material.doubleSided === true) out.materials.doubleSided++

    const pbr = material.pbrMetallicRoughness ?? {}
    // glTF defaults BOTH factors to 1.0 when the key is absent. That default is
    // the entire defect: CLO omits metallicFactor on fabric, and the format then
    // says "fully metal". See the design document, finding 3.
    const metallicFactor = pbr.metallicFactor ?? 1
    const roughnessFactor = pbr.roughnessFactor ?? 1
    const hasMrTexture = pbr.metallicRoughnessTexture !== undefined

    // THE LOAD-BEARING CHECK. An MR texture's BLUE channel supplies metalness per
    // pixel and overrides the factor entirely, so a material carrying one is not a
    // defect however high its factor reads. 3,593 materials are in exactly that
    // state; counting them is what produced a false "hundreds of materials" figure
    // that this reduced to 55.
    if (metallicFactor <= METALLIC_SUSPECT_MIN || hasMrTexture) continue

    const name = material.name ?? ''
    const record: PbrSuspect = { index: i, name, metallicFactor, roughnessFactor }
    const bucket = classifyMaterialName(name)
    if (bucket === 'fabric') out.pbrSuspects.push(record)
    else if (bucket === 'unclassified') out.unclassifiedMetallic.push(record)
    // 'hardware' is legitimately metal and is neither fixed nor reported.
  }

  const variants = gltf.extensions?.KHR_materials_variants?.variants ?? []
  out.colourways.count = variants.length
  out.colourways.names = variants.map((variant) => variant.name ?? '')
  let primitives = 0
  let mapped = 0
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      primitives++
      if (primitive.extensions?.KHR_materials_variants !== undefined) mapped++
    }
  }
  out.colourways.fullyMapped = primitives > 0 && mapped === primitives

  const images = gltf.images ?? []
  out.images.total = images.length
  out.images.named = images.filter((image) => Boolean(image.name) || Boolean(image.uri)).length

  return out
}
