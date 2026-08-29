import {
  isBiasInBand,
  MAX_ABS_BIAS,
  MIN_ABS_BIAS,
  OVERLAY_AUTO_CONFIDENCE,
  OVERLAY_BIAS_FACTOR,
  OVERLAY_BIAS_UNITS,
  type PrimitiveReading,
} from './overlay-depth'

/**
 * Write the overlay decision INTO the asset, as glTF material `extras`.
 *
 * WHY THE ASSET AND NOT THE VIEWER. Adjacency is a property of the geometry, and the
 * pipeline is the only place that can see it — `model-viewer` at runtime has a flat list
 * of materials with no idea which panel any of them sits on. A viewer-side rule would
 * have to guess from names, which is the thing this repo has been burned by. So the
 * pipeline measures once, records the answer, and the viewer simply obeys.
 *
 * ⚠️ THE BIN CHUNK IS COPIED BYTE FOR BYTE AND THAT IS DELIBERATE. Re-serialising through
 * @gltf-transform would re-encode EXT_meshopt_compression and re-quantize every vertex
 * attribute — the root CLAUDE.md's first pipeline trap is "never run the pipeline on its
 * own output", because a second pass silently loses artwork protection. Nothing here
 * needs the binary: `extras` and the material array live entirely in the JSON chunk, and
 * adding a material never moves a bufferView. So this patches the JSON chunk and leaves
 * geometry, textures and compression bit-identical, which is verifiable rather than
 * argued — `binIdentical` in the result is asserted, not assumed.
 */

const MAGIC_GLTF = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

/** Bumped when the detector's thresholds change, so a stale annotation is identifiable. */
export const DETECTOR_VERSION = 'overlay-depth@1'

export interface DepthBiasRecord {
  enabled: true
  factor: number
  units: number
  reason: string
  confidence: number
  supportPrimitive: string | null
  distanceMm: number
  detector: string
}

/**
 * A human's override of the detector, for one material on one garment.
 *
 * ⚠️ THIS IS KEYED BY MATERIAL NAME AND THE DETECTOR IS NOT. The rule that decides what
 * gets biased is geometric on purpose (see overlay-depth.ts). This file is the escape
 * hatch for a garment the owner has LOOKED AT and disagrees with, so a name is the right
 * key — a person can read it. Nothing here runs unless a name matches exactly, and an
 * override that matches nothing is REPORTED, never silent: a stale entry after a CLO
 * re-export would otherwise read as "still applied" while doing nothing, which is the
 * failure mode `REFERENCE_PATHS` and `isArtworkMaterialByName` both had.
 */
export interface OverlayOverride {
  garment: string
  material: string
  force: 'bias' | 'skip'
  factor?: number
  note: string
}

export interface AnnotateOptions {
  /** Only these alpha modes are annotated. Default OPAQUE — see the note below. */
  alphaModes?: readonly string[]
  overrides?: readonly OverlayOverride[]
  /** Garment key the overrides are matched against (usually the file's basename). */
  garment?: string
}

export interface AnnotateResult {
  /** Materials that received a depthBias record, by glTF material index. */
  flagged: Array<{ index: number; name: string; clonedFrom?: number }>
  /** Overlay primitives whose materials were flagged. */
  overlayPrimitives: number
  /** Detected overlays held back below OVERLAY_AUTO_CONFIDENCE. Report, do not bias. */
  review: Array<{ material: string; confidence: number; reason: string; alphaMode: string }>
  /** Overrides that matched no material in this file. A stale entry, and a real fault. */
  staleOverrides: OverlayOverride[]
  clones: number
  binIdentical: boolean
  bytesIn: number
  bytesOut: number
}

interface Chunks {
  json: Record<string, unknown>
  bin: Uint8Array | null
}

function readGlb(bytes: Uint8Array): Chunks {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== MAGIC_GLTF) throw new Error('not a GLB: bad magic')
  const total = view.getUint32(8, true)
  let offset = 12
  let json: Record<string, unknown> | null = null
  let bin: Uint8Array | null = null
  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === CHUNK_JSON)
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)))
    else if (type === CHUNK_BIN) bin = bytes.subarray(start, start + length)
    offset = start + length + ((4 - (length % 4)) % 4)
  }
  if (!json) throw new Error('GLB has no JSON chunk')
  return { json, bin }
}

function writeGlb(json: Record<string, unknown>, bin: Uint8Array | null): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0
  const total = 12 + 8 + jsonBytes.length + jsonPad + (bin ? 8 + bin.length + binPad : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, MAGIC_GLTF, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.length + jsonPad, true)
  view.setUint32(16, CHUNK_JSON, true)
  out.set(jsonBytes, 20)
  // JSON is padded with SPACES and BIN with ZEROES. Required by the spec; a zero-padded
  // JSON chunk parses in Node and is rejected by some loaders.
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad)
  if (bin) {
    const at = 20 + jsonBytes.length + jsonPad
    view.setUint32(at, bin.length + binPad, true)
    view.setUint32(at + 4, CHUNK_BIN, true)
    out.set(bin, at + 8)
  }
  return out
}

type GltfPrimitive = {
  material?: number
  extensions?: {
    KHR_materials_variants?: { mappings?: Array<{ material: number; variants: number[] }> }
  }
}
type GltfMesh = { primitives?: GltfPrimitive[] }
type GltfMaterial = { name?: string; alphaMode?: string; extras?: Record<string, unknown> }

/**
 * Annotate every material reachable from an overlay primitive, including its colourways.
 *
 * ⚠️ THE COLOURWAY LOOP IS NOT OPTIONAL AND ITS ABSENCE IS A SHIPPED BUG IN THIS REPO.
 * A primitive carries one base material plus one KHR_materials_variants mapping per
 * colourway, and they are DIFFERENT materials: Minecut's graphic panel resolves to
 * materials #3, #19, #32, #45 and #58. Flagging only the base would fix one colourway of
 * five — exactly the shape of the 2026-08-27 decal fix that reached 6 of 26 decals.
 */
export function annotateGlbOverlays(
  bytes: Uint8Array,
  readings: readonly PrimitiveReading[],
  options: AnnotateOptions = {},
): { bytes: Uint8Array; result: AnnotateResult } {
  const alphaModes = options.alphaModes ?? ['OPAQUE']
  const overrides = options.overrides ?? []
  const garment = options.garment ?? ''
  const { json, bin } = readGlb(bytes)
  const materials = (json.materials as GltfMaterial[] | undefined) ?? []
  const meshes = (json.meshes as GltfMesh[] | undefined) ?? []

  const overrideFor = (name: string): OverlayOverride | undefined =>
    overrides.find((o) => o.material === name && (!o.garment || o.garment === garment))
  const used = new Set<OverlayOverride>()

  // Decide per primitive. A reading is annotated when the geometry says overlay AND the
  // confidence clears the bar, unless a human override says otherwise.
  const review: AnnotateResult['review'] = []
  const chosen: PrimitiveReading[] = []
  for (const reading of readings) {
    const override = overrideFor(reading.materialName)
    if (override) used.add(override)
    if (override?.force === 'skip') continue
    const forced = override?.force === 'bias'
    if (!forced) {
      if (!reading.verdict.overlay) continue
      if (!alphaModes.includes(reading.alphaMode)) continue
      if (reading.verdict.confidence < OVERLAY_AUTO_CONFIDENCE) {
        review.push({
          material: reading.materialName,
          confidence: reading.verdict.confidence,
          reason: reading.verdict.reason,
          alphaMode: reading.alphaMode,
        })
        continue
      }
    }
    chosen.push(reading)
  }

  // Map each chosen primitive to its raw-JSON primitive, and assert the two agree.
  // gltf-transform preserves mesh and primitive ORDER, but "preserves" is exactly the
  // kind of claim this repo has paid for assuming. The material name is checked on every
  // primitive, so a reader change fails loudly instead of annotating the wrong surface.
  const overlayPrimitives: GltfPrimitive[] = []
  for (const reading of chosen) {
    const primitive = meshes[reading.meshIndex]?.primitives?.[reading.primitiveIndex]
    if (!primitive)
      throw new Error(`primitive ${reading.meshIndex}/${reading.primitiveIndex} not in JSON`)
    const name = primitive.material === undefined ? '' : (materials[primitive.material]?.name ?? '')
    if (name !== reading.materialName)
      throw new Error(
        `primitive order drifted: JSON says "${name}", detector says "${reading.materialName}" ` +
          `at mesh ${reading.meshIndex} primitive ${reading.primitiveIndex}`,
      )
    overlayPrimitives.push(primitive)
  }

  /** Every material index a primitive can resolve to, across all colourways. */
  const resolved = (primitive: GltfPrimitive): number[] => {
    const out: number[] = []
    if (primitive.material !== undefined) out.push(primitive.material)
    for (const m of primitive.extensions?.KHR_materials_variants?.mappings ?? [])
      out.push(m.material)
    return out
  }

  const overlaySet = new Set(overlayPrimitives)
  const wanted = new Set<number>()
  for (const primitive of overlayPrimitives) for (const i of resolved(primitive)) wanted.add(i)

  // A material shared with a BODY primitive must be cloned, or biasing the overlay would
  // drag the body forward too — the failure the viewer's own comment guards against.
  const bodyUsers = new Map<number, number>()
  for (const mesh of meshes)
    for (const primitive of mesh.primitives ?? []) {
      if (overlaySet.has(primitive)) continue
      for (const i of resolved(primitive)) bodyUsers.set(i, (bodyUsers.get(i) ?? 0) + 1)
    }

  const cloneOf = new Map<number, number>()
  let clones = 0
  for (const index of wanted) {
    if (!bodyUsers.has(index)) continue
    const source = materials[index]
    if (!source) continue
    materials.push(structuredClone(source) as GltfMaterial)
    const at = materials.length - 1
    const clone = materials[at]
    if (clone) clone.name = `${source.name ?? `material_${index}`}__overlay`
    cloneOf.set(index, at)
    clones++
  }
  if (clones) {
    for (const primitive of overlayPrimitives) {
      if (primitive.material !== undefined)
        primitive.material = cloneOf.get(primitive.material) ?? primitive.material
      for (const m of primitive.extensions?.KHR_materials_variants?.mappings ?? [])
        m.material = cloneOf.get(m.material) ?? m.material
    }
  }

  const record: Omit<DepthBiasRecord, 'reason' | 'confidence' | 'supportPrimitive' | 'distanceMm'> =
    {
      enabled: true,
      factor: OVERLAY_BIAS_FACTOR,
      units: OVERLAY_BIAS_UNITS,
      detector: DETECTOR_VERSION,
    }
  const byMaterial = new Map<number, PrimitiveReading>()
  for (const reading of chosen) {
    const primitive = meshes[reading.meshIndex]?.primitives?.[reading.primitiveIndex]
    if (!primitive) continue
    for (const i of resolved(primitive)) if (!byMaterial.has(i)) byMaterial.set(i, reading)
  }

  const flagged: AnnotateResult['flagged'] = []
  for (const [index, reading] of byMaterial) {
    const material = materials[index]
    if (!material) continue
    const override = overrideFor(reading.materialName)
    const factor = override?.factor ?? OVERLAY_BIAS_FACTOR
    if (!isBiasInBand(factor))
      throw new Error(
        `override factor ${factor} for "${reading.materialName}" is outside the ` +
          `[-${MAX_ABS_BIAS}, -${MIN_ABS_BIAS}] band the viewer will obey`,
      )
    const bias: DepthBiasRecord = {
      ...record,
      factor,
      units: factor,
      reason: override ? `override: ${override.note}` : reading.verdict.reason,
      confidence: override ? 1 : reading.verdict.confidence,
      supportPrimitive: reading.supportPrimitive,
      distanceMm: Number(reading.gapMm.toFixed(4)),
    }
    material.extras = { ...(material.extras ?? {}), depthBias: bias }
    const from = [...cloneOf.entries()].find(([, to]) => to === index)?.[0]
    flagged.push({
      index,
      name: material.name ?? '',
      ...(from === undefined ? {} : { clonedFrom: from }),
    })
  }

  const out = writeGlb(json, bin)
  const after = readGlb(out)
  const binIdentical =
    !bin ||
    (!!after.bin &&
      after.bin.length === bin.length &&
      Buffer.from(after.bin).equals(Buffer.from(bin)))

  return {
    bytes: out,
    result: {
      flagged,
      overlayPrimitives: overlayPrimitives.length,
      review,
      staleOverrides: overrides.filter(
        (o) => !used.has(o) && (!o.garment || o.garment === garment),
      ),
      clones,
      binIdentical,
      bytesIn: bytes.length,
      bytesOut: out.length,
    },
  }
}
