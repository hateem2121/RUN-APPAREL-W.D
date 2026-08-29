/**
 * What a finished garment is actually MADE OF — bytes per vertex attribute, and how
 * much graphics memory its textures will need once a phone unpacks them.
 *
 * ⚠️ NOTHING IN THIS PROJECT MEASURED EITHER, WHICH IS WHY BOTH WENT UNNOTICED FOR WEEKS.
 *
 * Every size check here reads the file's TOTAL size. That hid two things:
 *
 * 1. Texture coordinates are the largest thing in a garment and the only attribute left
 *    uncompressed. Measured on the live catalogue: 46.8% of n001's geometry and 51.6% of
 *    v001's, stored as full 32-bit floats while positions are 16-bit and normals 8-bit.
 *    The cause is upstream — CLO writes UVs far outside 0..1 (measured −627.94 to
 *    +800.86 on one export) and glTF-Transform's quantizer correctly refuses them,
 *    printing `Skipping TEXCOORD_0; out of [0,1] range` where nobody reads it.
 *
 * 2. A 40 MB file ceiling is a DOWNLOAD limit being asked to serve as a MEMORY limit,
 *    and the two are wildly different numbers. Textures ship compressed and are unpacked
 *    to raw RGBA on the graphics chip: measured 0.4 MB of texture data becoming 38.1 MB
 *    of graphics memory, a 100.7x expansion. A garment can sit comfortably under 40 MB
 *    and still be far too heavy for an older phone, with no pattern visible in the file
 *    sizes — which is exactly what makes that class of crash hard to diagnose.
 *
 * ⚠️ THIS MODULE CARRIES ITS OWN SANITY CHECK, and that is not decoration. The first
 * version of this measurement reported 208 MB of indices inside a 16.56 MB file, because
 * it summed per accessor when many accessors share one bufferView. The number was
 * physically impossible and that is the only reason it was caught. `plausible` is false
 * whenever the parts exceed the whole; any caller printing these figures should say so
 * rather than print a number it cannot justify.
 */

/** Just enough of the glTF JSON chunk to do the arithmetic. */
export interface GltfForBytes {
  accessors?: { bufferView?: number; componentType?: number; count?: number; type?: string }[]
  bufferViews?: {
    byteLength?: number
    extensions?: { EXT_meshopt_compression?: { byteLength?: number } }
  }[]
  images?: { bufferView?: number; mimeType?: string }[]
  meshes?: { primitives?: { attributes?: Record<string, number>; indices?: number }[] }[]
}

export interface AttributeBytes {
  /** Compressed on-disk bytes, keyed by semantic (TEXCOORD_0 and _1 are merged). */
  bySemantic: Record<string, number>
  /** Everything in `bySemantic`, summed. */
  geometryBytes: number
  /** Embedded image bytes. */
  imageBytes: number
  /**
   * False when geometry + images exceed the file. The parts cannot be bigger than the
   * whole; if they are, the measurement is wrong and must not be reported as fact.
   */
  plausible: boolean
}

/** Bytes per component, by glTF componentType. */
const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
}
/** Components per element, by glTF accessor type. */
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

/**
 * Attribute the on-disk bytes of every bufferView to the semantic that reads it.
 *
 * ⚠️ DEDUPED BY BUFFERVIEW, NOT BY ACCESSOR. Many accessors share one bufferView, so
 * summing per accessor multiplies the answer — the mistake that produced 208 MB of
 * indices inside a 16.56 MB file.
 */
export function attributeBytes(gltf: GltfForBytes, fileBytes: number): AttributeBytes {
  const accessors = gltf.accessors ?? []
  const bufferViews = gltf.bufferViews ?? []
  const semanticsOf = new Map<number, Set<string>>()

  const note = (accessorIndex: number | undefined, semantic: string) => {
    if (accessorIndex === undefined) return
    const view = accessors[accessorIndex]?.bufferView
    if (view === undefined) return
    const set = semanticsOf.get(view) ?? new Set<string>()
    set.add(semantic)
    semanticsOf.set(view, set)
  }

  for (const mesh of gltf.meshes ?? [])
    for (const primitive of mesh.primitives ?? []) {
      // TEXCOORD_0 and TEXCOORD_1 are the same story; COLOR_0 likewise.
      for (const [semantic, index] of Object.entries(primitive.attributes ?? {}))
        note(index, semantic.replace(/_\d+$/, ''))
      note(primitive.indices, 'INDICES')
    }

  const bySemantic: Record<string, number> = {}
  let geometryBytes = 0
  for (const [view, semantics] of semanticsOf) {
    const bufferView = bufferViews[view]
    if (!bufferView) continue
    // With EXT_meshopt_compression the extension's byteLength is what is ON DISK; the
    // outer byteLength is the decompressed size.
    const bytes =
      bufferView.extensions?.EXT_meshopt_compression?.byteLength ?? bufferView.byteLength ?? 0
    geometryBytes += bytes
    // A view read by two semantics is rare and interleaved; name it honestly.
    const key = [...semantics].sort().join('+')
    bySemantic[key] = (bySemantic[key] ?? 0) + bytes
  }

  let imageBytes = 0
  for (const image of gltf.images ?? [])
    if (image.bufferView !== undefined) imageBytes += bufferViews[image.bufferView]?.byteLength ?? 0

  return {
    bySemantic,
    geometryBytes,
    imageBytes,
    plausible: fileBytes <= 0 ? false : geometryBytes + imageBytes <= fileBytes,
  }
}

/** Uncompressed size of one image on the graphics chip, including its mipmaps. */
export function textureVramBytes(width: number, height: number): number {
  // 4 bytes per pixel (RGBA8), plus a full mipmap chain, which converges to 1/3 extra.
  return Math.round(width * height * 4 * (4 / 3))
}

/**
 * Uncompressed accessor size, for reporting what quantization did or did not save.
 * Returns 0 for an accessor the file does not describe.
 */
export function accessorBytes(accessor: {
  componentType?: number
  count?: number
  type?: string
}): number {
  const component = COMPONENT_BYTES[accessor.componentType ?? -1] ?? 0
  const components = TYPE_COMPONENTS[accessor.type ?? ''] ?? 0
  return (accessor.count ?? 0) * component * components
}

/** A one-line-per-part summary, largest first. Empty when the numbers are implausible. */
export function formatAttributeBytes(bytes: AttributeBytes): string[] {
  if (!bytes.plausible) {
    return [
      'Composition: not reported — the measured parts exceed the file size, so the figure would be wrong.',
    ]
  }
  const mb = (n: number) => (n / 1024 / 1024).toFixed(2)
  const total = bytes.geometryBytes
  const rows = Object.entries(bytes.bySemantic)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => {
      const share = total > 0 ? ((100 * value) / total).toFixed(1) : '0.0'
      return `  ${name.padEnd(12)} ${mb(value).padStart(8)} MB  ${share.padStart(5)}% of geometry`
    })
  return [`Made of: ${mb(total)} MB geometry, ${mb(bytes.imageBytes)} MB images.`, ...rows]
}

/** The minimum a texture record must carry to be weighed in graphics memory. */
export interface SizedTexture {
  name?: string
  width: number | null
  height: number | null
  bytes?: number
}

export interface VramSummary {
  /** Total graphics memory once every texture is unpacked, in bytes. */
  totalBytes: number
  /** How many textures had no readable dimensions and are therefore NOT counted. */
  unmeasured: number
  /** The heaviest few, largest first — where the memory actually goes. */
  heaviest: { name: string; bytes: number; width: number; height: number }[]
}

/**
 * Weigh every texture in graphics memory.
 *
 * ⚠️ `unmeasured` IS PART OF THE ANSWER, NOT AN ERROR CODE. A texture whose dimensions
 * could not be read contributes nothing to the total, so a file full of unreadable
 * images reports a reassuringly small number. That is the failure this project keeps
 * paying for — an instrument reporting success while measuring nothing — so the count
 * travels with the total and the formatter refuses to stay quiet about it.
 */
export function summariseVram(textures: SizedTexture[], heaviestCount = 3): VramSummary {
  let totalBytes = 0
  let unmeasured = 0
  const sized: { name: string; bytes: number; width: number; height: number }[] = []

  for (const texture of textures) {
    const { width, height } = texture
    if (!width || !height) {
      unmeasured++
      continue
    }
    const bytes = textureVramBytes(width, height)
    totalBytes += bytes
    sized.push({ name: texture.name || '(unnamed)', bytes, width, height })
  }

  return {
    totalBytes,
    unmeasured,
    heaviest: sized.sort((a, b) => b.bytes - a.bytes).slice(0, heaviestCount),
  }
}

/**
 * The graphics-memory lines for a report.
 *
 * `fileBytes` is quoted alongside deliberately: the whole point is that the two numbers
 * are not related. A 40 MB file ceiling is a DOWNLOAD limit being asked to serve as a
 * MEMORY limit, and a garment can sit comfortably under it while being far too heavy for
 * an older phone — with no pattern visible in the file sizes.
 */
export function formatVram(summary: VramSummary, fileBytes: number): string[] {
  if (summary.totalBytes === 0) {
    return ['  graphics memory: not measured — no texture dimensions could be read.']
  }
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  const expansion = fileBytes > 0 ? (summary.totalBytes / fileBytes).toFixed(1) : '?'
  const lines = [
    `  graphics memory: ~${mb(summary.totalBytes)} MB once a phone unpacks these textures ` +
      `— ${expansion}x the ${mb(fileBytes)} MB file. These are not the same number, and only ` +
      'the second one is capped anywhere.',
  ]
  for (const t of summary.heaviest) {
    lines.push(`    ${t.name.padEnd(28)} ${t.width}x${t.height}  ${mb(t.bytes).padStart(7)} MB`)
  }
  if (summary.unmeasured > 0) {
    lines.push(
      `    ⚠️ ${summary.unmeasured} texture(s) had unreadable dimensions and are NOT in that total.`,
    )
  }
  return lines
}
