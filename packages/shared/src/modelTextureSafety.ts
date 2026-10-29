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
    const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd))) as {
      asset?: { version?: string }
      textures?: {
        source?: number
        extensions?: {
          EXT_texture_webp?: { source?: number }
          KHR_texture_basisu?: { source?: number }
        }
      }[]
      images?: { bufferView?: number; uri?: string }[]
      bufferViews?: { buffer?: number; byteOffset?: number; byteLength: number }[]
    }
    if (gltf.asset?.version !== '2.0') throw new Error('Unsupported glTF version.')
    for (const [index, texture] of (gltf.textures ?? []).entries()) {
      const source =
        texture.extensions?.EXT_texture_webp?.source ??
        texture.extensions?.KHR_texture_basisu?.source ??
        texture.source
      if (!Number.isInteger(source) || source === undefined || source < 0 || !gltf.images?.[source])
        result.problems.push(`Texture ${index}: its required image could not be verified.`)
    }
    const binStart = jsonEnd + 8
    const hasBin =
      binStart <= bytes.length &&
      v.getUint32(jsonEnd + 4, true) === 0x004e4942 &&
      binStart + v.getUint32(jsonEnd, true) <= bytes.length
    const measured = new Set<string>()
    for (const [index, image] of (gltf.images ?? []).entries()) {
      const view = image.bufferView === undefined ? undefined : gltf.bufferViews?.[image.bufferView]
      const offset = view?.byteOffset ?? 0
      let dimensions: [number, number] | null = null
      if (
        hasBin &&
        view &&
        (view.buffer ?? 0) === 0 &&
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        Number.isSafeInteger(view.byteLength) &&
        view.byteLength > 0 &&
        offset + view.byteLength <= v.getUint32(jsonEnd, true)
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
      const key = `${offset}:${view?.byteLength}`
      if (!measured.has(key)) {
        measured.add(key)
        result.estimatedTextureBytes += Math.round(pixels * 4 * (4 / 3))
      }
      if ((width ?? 0) > MODEL_TEXTURE_MAX_EDGE || (height ?? 0) > MODEL_TEXTURE_MAX_EDGE)
        result.problems.push(
          `Image ${index}: ${width} × ${height} exceeds the ${MODEL_TEXTURE_MAX_EDGE}-pixel output limit. Rebuild from the original CLO export and review the print.`,
        )
    }
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
