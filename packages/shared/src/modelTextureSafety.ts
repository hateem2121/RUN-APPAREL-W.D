declare const TextDecoder: { new (): { decode(bytes: Uint8Array): string } }

/** Header-only acceptance check. This bounds raster dimensions, not total device memory. */
export const MODEL_TEXTURE_MAX_EDGE = 4096
/** Existing project review budget; this is not an iPhone memory guarantee. */
export const MODEL_TEXTURE_REVIEW_BYTES = 256 * 1024 * 1024

export interface ModelTextureCheck {
  version: 1
  ok: boolean
  /** RGBA8 plus mipmaps, not a measured process footprint or a device safety promise. */
  estimatedTextureBytes: number
  unmeasured: number
  images: { index: number; width: number | null; height: number | null; pixels: number | null }[]
  problems: string[]
}

/** Standard PNG/JPEG/WebP headers only; never allocate decoded pixels to inspect a file. */
export function rasterDimensions(bytes: Uint8Array): [number, number] | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (at: number, size: number) => new TextDecoder().decode(bytes.subarray(at, at + size))
  if (
    bytes.length >= 33 &&
    v.getUint32(0) === 0x89504e47 &&
    v.getUint32(4) === 0x0d0a1a0a &&
    text(12, 4) === 'IHDR'
  ) {
    return [v.getUint32(16), v.getUint32(20)]
  }
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    let at = 12
    while (at + 8 <= bytes.length) {
      const kind = text(at, 4)
      const size = v.getUint32(at + 4, true)
      const start = at + 8
      if (size > bytes.length - start) return null
      if (kind === 'VP8X' && size >= 10) {
        const u24 = (p: number) =>
          (bytes[p] ?? 0) + ((bytes[p + 1] ?? 0) << 8) + ((bytes[p + 2] ?? 0) << 16)
        return [1 + u24(start + 4), 1 + u24(start + 7)]
      }
      if (
        kind === 'VP8 ' &&
        size >= 10 &&
        bytes[start + 3] === 0x9d &&
        bytes[start + 4] === 1 &&
        bytes[start + 5] === 0x2a
      ) {
        return [v.getUint16(start + 6, true) & 0x3fff, v.getUint16(start + 8, true) & 0x3fff]
      }
      if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
        const bits = v.getUint32(start + 1, true)
        return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
      }
      at = start + size + (size % 2)
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return null
      while (bytes[at] === 0xff) at++
      const marker = bytes[at++] ?? 0
      if (marker === 0xd9 || marker === 0xda) return null
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (at + 2 > bytes.length) return null
      const size = v.getUint16(at)
      if (size < 2 || at + size > bytes.length) return null
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        size >= 7
      ) {
        return [v.getUint16(at + 5), v.getUint16(at + 3)]
      }
      at += size
    }
  }
  return null
}

interface TextureDefinition {
  source?: number
  sampler?: number
  extensions?: {
    EXT_texture_webp?: { source?: number }
    KHR_texture_basisu?: { source?: number }
  }
}
interface TextureJson {
  asset?: { version?: string }
  textures?: TextureDefinition[]
  samplers?: { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }[]
  materials?: unknown[]
  buffers?: { byteLength: number; uri?: string }[]
  images?: { bufferView?: number; uri?: string }[]
  bufferViews?: {
    buffer?: number
    byteOffset?: number
    byteLength: number
    extensions?: Record<string, unknown>
  }[]
}

const textureSource = (texture: TextureDefinition) =>
  texture.extensions?.EXT_texture_webp?.source ??
  texture.extensions?.KHR_texture_basisu?.source ??
  texture.source

/** Header-only allocation bound, following THREE 0.183.2 rather than deduplicating image bytes. */
function textureAllocationBytes(gltf: TextureJson, images: ModelTextureCheck['images']): number {
  const roles = new Map<number, Set<string>>()
  const pending: unknown[] = [...(gltf.materials ?? [])]
  const colourSlots = new Set([
    'baseColorTexture',
    'emissiveTexture',
    'sheenColorTexture',
    'specularColorTexture',
  ])
  // Include every material/variant and extension texture slot: these can accumulate
  // during a visit. UV/transform clones share Source; colour-space copies may not
  // share the GPU allocation. Counting both roles is conservative when no clone occurs.
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    for (const [name, child] of Object.entries(value)) {
      if (name.endsWith('Texture') && child && typeof child === 'object') {
        const index = (child as { index?: number }).index
        if (index !== undefined && Number.isInteger(index)) {
          const set = roles.get(index) ?? new Set<string>()
          set.add(colourSlots.has(name) ? 'srgb' : 'data')
          roles.set(index, set)
        }
      }
      if (child && typeof child === 'object') pending.push(child)
    }
  }
  const caches = new Map<
    string,
    { source: number; pixels: number; ambiguous: boolean; sampler: string; roles: Set<string> }
  >()
  const referenced = new Set<number>()
  const referencedViews = new Set<number>()
  for (const [index, texture] of (gltf.textures ?? []).entries()) {
    const source = textureSource(texture)
    if (source === undefined || !images[source]?.pixels) continue
    referenced.add(source)
    const image = gltf.images?.[source]
    if (image?.bufferView !== undefined) referencedViews.add(image.bufferView)
    // GLTFLoader.loadTextureImage caches by URI/bufferView ID + sampler ID.
    // Distinct views over identical byte ranges still create independent Sources.
    const key = `${image?.uri || image?.bufferView}:${texture.sampler}`
    const sampler = gltf.samplers?.[texture.sampler ?? -1]
    const effective = [
      [9728, 9729].includes(sampler?.magFilter ?? 0) ? sampler?.magFilter : 9729,
      [9728, 9729, 9984, 9985, 9986, 9987].includes(sampler?.minFilter ?? 0)
        ? sampler?.minFilter
        : 9987,
      [33071, 33648, 10497].includes(sampler?.wrapS ?? 0) ? sampler?.wrapS : 10497,
      [33071, 33648, 10497].includes(sampler?.wrapT ?? 0) ? sampler?.wrapT : 10497,
    ].join(':')
    const cache = caches.get(key) ?? {
      source,
      pixels: images[source]?.pixels ?? 0,
      ambiguous: false,
      sampler: effective,
      roles: new Set<string>(),
    }
    cache.ambiguous ||= cache.source !== source
    cache.pixels = Math.max(cache.pixels, images[source]?.pixels ?? 0)
    for (const role of roles.get(index) ?? ['data']) cache.roles.add(role)
    caches.set(key, cache)
  }
  const allocations = new Set<string>()
  let bytes = 0
  for (const [key, cache] of caches) {
    // Texture.clone preserves Source. WebGLTextures keys GPU allocations by
    // Source + effective sampler parameters + colour space, not sampler ID.
    // Aliased image IDs competing for one loader cache entry depend on load order;
    // keep that entry separate to bound either possible Source selection safely.
    const identity = cache.ambiguous ? `cache:${key}` : `source:${cache.source}`
    for (const role of cache.roles) {
      const allocation = `${identity}:${cache.sampler}:${role}`
      if (allocations.has(allocation)) continue
      allocations.add(allocation)
      bytes += Math.round(cache.pixels * 4 * (4 / 3))
    }
  }
  // Keep the existing conservative floor for embedded images without a texture
  // reference. Sharing requires the same view ID, never just equal byte ranges.
  const unreferenced = new Set<number>()
  for (const image of images) {
    const view = gltf.images?.[image.index]?.bufferView
    if (
      referenced.has(image.index) ||
      view === undefined ||
      referencedViews.has(view) ||
      unreferenced.has(view)
    )
      continue
    unreferenced.add(view)
    bytes += Math.round((image.pixels ?? 0) * 4 * (4 / 3))
  }
  return bytes
}

/** The bytes being uploaded are checked, never a client-supplied “passed” field. */
export function checkModelTextures(bytes: Uint8Array): ModelTextureCheck {
  const result: ModelTextureCheck = {
    version: 1,
    ok: false,
    estimatedTextureBytes: 0,
    unmeasured: 0,
    images: [],
    problems: [],
  }
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (
      bytes.length < 20 ||
      v.getUint32(0, true) !== 0x46546c67 ||
      v.getUint32(4, true) !== 2 ||
      v.getUint32(8, true) !== bytes.length ||
      v.getUint32(16, true) !== 0x4e4f534a
    )
      throw new Error('Invalid GLB header.')
    const jsonEnd = 20 + v.getUint32(12, true)
    if (jsonEnd > bytes.length) throw new Error('Truncated GLB JSON.')
    const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd))) as TextureJson
    if (gltf.asset?.version !== '2.0') throw new Error('Unsupported glTF version.')
    for (const [index, texture] of (gltf.textures ?? []).entries()) {
      const source = textureSource(texture)
      if (!Number.isInteger(source) || source === undefined || source < 0 || !gltf.images?.[source])
        result.problems.push(`Texture ${index}: its required image could not be verified.`)
    }
    const binStart = jsonEnd + 8
    const hasBin =
      binStart <= bytes.length &&
      v.getUint32(jsonEnd + 4, true) === 0x004e4942 &&
      binStart + v.getUint32(jsonEnd, true) <= bytes.length
    const binLength = hasBin ? v.getUint32(jsonEnd, true) : 0
    const embeddedBuffer = gltf.buffers?.[0]
    // GLTFLoader follows buffer 0's URI when present, even inside a GLB. Measuring
    // a decoy BIN in that case would approve different bytes from those the viewer loads.
    const verifiedEmbeddedBuffer =
      hasBin &&
      embeddedBuffer?.uri === undefined &&
      Number.isSafeInteger(embeddedBuffer?.byteLength) &&
      (embeddedBuffer?.byteLength ?? 0) > 0 &&
      (embeddedBuffer?.byteLength ?? 0) <= binLength &&
      binLength - (embeddedBuffer?.byteLength ?? 0) <= 3
    for (const [index, image] of (gltf.images ?? []).entries()) {
      const view = image.bufferView === undefined ? undefined : gltf.bufferViews?.[image.bufferView]
      const offset = view?.byteOffset ?? 0
      let dimensions: [number, number] | null = null
      if (
        verifiedEmbeddedBuffer &&
        view &&
        // Meshopt (or another transforming extension) can replace the fallback
        // bytes. A small PNG header there cannot verify the image the loader uses.
        Object.keys(view.extensions ?? {}).length === 0 &&
        view.buffer === 0 &&
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        Number.isSafeInteger(view.byteLength) &&
        view.byteLength > 0 &&
        offset + view.byteLength <= (embeddedBuffer?.byteLength ?? 0) &&
        offset + view.byteLength <= binLength
      ) {
        dimensions = rasterDimensions(
          bytes.subarray(binStart + offset, binStart + offset + view.byteLength),
        )
      }
      const width = dimensions?.[0] ?? null
      const height = dimensions?.[1] ?? null
      const pixels = width && height ? width * height : null
      result.images.push({ index, width, height, pixels })
      if (!pixels || !Number.isSafeInteger(pixels)) {
        result.unmeasured++
        result.problems.push(
          `Image ${index}: dimensions could not be verified. Use embedded PNG, JPEG or WebP images.`,
        )
        continue
      }
      if ((width ?? 0) > MODEL_TEXTURE_MAX_EDGE || (height ?? 0) > MODEL_TEXTURE_MAX_EDGE)
        result.problems.push(
          `Image ${index}: ${width} × ${height} exceeds the ${MODEL_TEXTURE_MAX_EDGE}-pixel output limit. Rebuild from the original CLO export and review the print.`,
        )
    }
    result.estimatedTextureBytes = textureAllocationBytes(gltf, result.images)
    if (result.estimatedTextureBytes > MODEL_TEXTURE_REVIEW_BYTES)
      result.problems.push(
        'Combined raster texture estimate exceeds the project’s 256 MiB review budget. Rebuild from the original export, review artwork and test the target phone before replacement.',
      )
    result.ok = result.problems.length === 0
  } catch {
    result.problems.push(
      'The model could not be inspected. Upload a complete GLB file processed from the original CLO export.',
    )
  }
  return result
}
