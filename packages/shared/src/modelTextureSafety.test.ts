import { describe, expect, it } from 'vitest'
import { checkModelTextures, MODEL_TEXTURE_MAX_EDGE, rasterDimensions } from './modelTextureSafety'

declare const TextEncoder: { new (): { encode(text: string): Uint8Array } }
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33)
  const v = new DataView(b.buffer)
  v.setUint32(0, 0x89504e47)
  v.setUint32(4, 0x0d0a1a0a)
  b.set([73, 72, 68, 82], 12)
  v.setUint32(16, width)
  v.setUint32(20, height)
  return b
}
function glb(
  image: Uint8Array,
  extraImage = false,
  buffer: { byteLength?: unknown; uri?: unknown } | null = { byteLength: image.length },
  imageViewExtensions?: Record<string, unknown>,
  geometryViewExtensions?: Record<string, unknown>,
): Uint8Array {
  let json = JSON.stringify({
    asset: { version: '2.0' },
    buffers: buffer === null ? undefined : [buffer],
    bufferViews: [
      { buffer: 0, byteLength: image.length, extensions: imageViewExtensions },
      ...(geometryViewExtensions
        ? [{ buffer: 0, byteLength: image.length, extensions: geometryViewExtensions }]
        : []),
    ],
    images: extraImage ? [{ bufferView: 0 }, { bufferView: 0 }] : [{ bufferView: 0 }],
  })
  json = json.padEnd(Math.ceil(json.length / 4) * 4)
  const padded = Math.ceil(image.length / 4) * 4
  const b = new Uint8Array(28 + json.length + padded)
  const v = new DataView(b.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, b.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  b.set(new TextEncoder().encode(json), 20)
  v.setUint32(20 + json.length, padded, true)
  v.setUint32(24 + json.length, 0x004e4942, true)
  b.set(image, 28 + json.length)
  return b
}

function allocationGlb(definition: Record<string, unknown>): Uint8Array {
  const image = png(4096, 4096)
  let json = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: image.length }],
    bufferViews: [{ buffer: 0, byteLength: image.length }],
    images: [{ bufferView: 0 }],
    ...definition,
  })
  json = json.padEnd(Math.ceil(json.length / 4) * 4)
  const bytes = new Uint8Array(28 + json.length + 36)
  const v = new DataView(bytes.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, bytes.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  bytes.set(new TextEncoder().encode(json), 20)
  v.setUint32(20 + json.length, 36, true)
  v.setUint32(24 + json.length, 0x004e4942, true)
  bytes.set(image, 28 + json.length)
  return bytes
}

describe('renderer allocation identities', () => {
  const allocation = Math.round((4096 * 4096 * 4 * 4) / 3)

  it('refuses four distinct image views over the same bytes: the loader creates four Sources', () => {
    const result = checkModelTextures(
      allocationGlb({
        bufferViews: Array.from({ length: 4 }, () => ({ buffer: 0, byteLength: 33 })),
        images: Array.from({ length: 4 }, (_, bufferView) => ({ bufferView })),
        textures: Array.from({ length: 4 }, (_, source) => ({ source })),
      }),
    )
    expect(result.estimatedTextureBytes).toBe(4 * allocation)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('256 MiB')
  })

  it('counts aliases sharing the same image view and sampler cache only once', () => {
    const result = checkModelTextures(
      allocationGlb({
        images: Array.from({ length: 4 }, () => ({ bufferView: 0 })),
        textures: Array.from({ length: 4 }, (_, source) => ({ source, sampler: 0 })),
        samplers: [{}],
      }),
    )
    expect(result.estimatedTextureBytes).toBe(allocation)
    expect(result.ok).toBe(true)
  })

  it('refuses four effective sampler allocations from one shared image Source', () => {
    const result = checkModelTextures(
      allocationGlb({
        textures: Array.from({ length: 4 }, (_, sampler) => ({ source: 0, sampler })),
        samplers: [
          { magFilter: 9728, wrapS: 33071 },
          { magFilter: 9729, wrapS: 33071 },
          { magFilter: 9728, wrapS: 10497 },
          { magFilter: 9729, wrapS: 10497 },
        ],
      }),
    )
    expect(result.estimatedTextureBytes).toBe(4 * allocation)
    expect(result.ok).toBe(false)
  })

  it('shares identical effective sampler parameters despite different sampler IDs and defaults', () => {
    const result = checkModelTextures(
      allocationGlb({
        textures: [{ source: 0 }, { source: 0, sampler: 0 }, { source: 0, sampler: 1 }],
        samplers: [{}, { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
      }),
    )
    expect(result.estimatedTextureBytes).toBe(allocation)
    expect(result.ok).toBe(true)
  })

  it('does not merge distinct Sources with identical sampler settings just because their views alias', () => {
    const result = checkModelTextures(
      allocationGlb({
        images: [{ bufferView: 0 }, { bufferView: 0 }],
        textures: [
          { source: 0, sampler: 0 },
          { source: 1, sampler: 1 },
        ],
        samplers: [{}, {}],
      }),
    )
    expect(result.estimatedTextureBytes).toBe(2 * allocation)
  })

  it('bounds ambiguous cache aliases without assuming which image Source loads first', () => {
    const result = checkModelTextures(
      allocationGlb({
        images: [{ bufferView: 0 }, { bufferView: 0 }],
        textures: [
          { source: 0, sampler: 0 },
          { source: 1, sampler: 0 },
          { source: 1, sampler: 1 },
        ],
        samplers: [{}, {}],
      }),
    )
    // Cache 0 may load source 0 while cache 1 loads source 1. They then cannot
    // share GPU memory, despite identical sampler settings and byte ranges.
    expect(result.estimatedTextureBytes).toBe(2 * allocation)
    expect(result.ok).toBe(true)
  })

  it('bounds colour-space copies when image Sources serve both colour and data maps', () => {
    const result = checkModelTextures(
      allocationGlb({
        bufferViews: [
          { buffer: 0, byteLength: 33 },
          { buffer: 0, byteLength: 33 },
        ],
        images: [{ bufferView: 0 }, { bufferView: 1 }],
        textures: [{ source: 0 }, { source: 1 }],
        materials: [0, 1].map((index) => ({
          pbrMetallicRoughness: { baseColorTexture: { index, texCoord: 1 } },
          normalTexture: { index, texCoord: 2 },
        })),
      }),
    )
    expect(result.estimatedTextureBytes).toBe(4 * allocation)
    expect(result.ok).toBe(false)
  })

  it('does not count UV and transform clones twice within the same colour-space role', () => {
    const result = checkModelTextures(
      allocationGlb({
        textures: [{ source: 0 }],
        materials: [
          { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
          { emissiveTexture: { index: 0, texCoord: 1 } },
          {
            extensions: {
              KHR_materials_sheen: {
                sheenColorTexture: {
                  index: 0,
                  extensions: { KHR_texture_transform: { offset: [0.1, 0] } },
                },
              },
            },
          },
        ],
      }),
    )
    expect(result.estimatedTextureBytes).toBe(allocation)
    expect(result.ok).toBe(true)
  })
})

describe('model raster acceptance', () => {
  it('rejects the production-sized 335-million-pixel image despite a tiny header', () => {
    const result = checkModelTextures(glb(png(17787, 18856)))
    expect(result.ok).toBe(false)
    expect(result.images[0]?.pixels).toBe(335391672)
    expect(result.estimatedTextureBytes).toBeGreaterThan(1024 ** 3)
    expect(result.problems.join(' ')).toContain('4096')
  })
  it('accepts the existing artwork cap, counts one shared embedded image once', () => {
    const result = checkModelTextures(glb(png(MODEL_TEXTURE_MAX_EDGE, 2048), true))
    expect(result.ok).toBe(true)
    expect(result.images).toHaveLength(2)
    expect(result.estimatedTextureBytes).toBe(Math.round((4096 * 2048 * 4 * 4) / 3))
  })
  it.each(['https://example.invalid/oversized.bin', 'data:application/octet-stream;base64,AAAA'])(
    'rejects a buffer URI instead of measuring the embedded decoy: %s',
    (uri) => {
      const result = checkModelTextures(glb(png(64, 64), false, { byteLength: 33, uri }))
      expect(result.ok).toBe(false)
      expect(result.unmeasured).toBe(1)
      expect(result.images[0]?.width).toBeNull()
    },
  )
  it.each([
    null,
    {},
    { byteLength: 0 },
    { byteLength: -1 },
    { byteLength: 33.5 },
    { byteLength: '33' },
    { byteLength: 32 },
    { byteLength: 37 },
    { byteLength: 33, uri: null },
  ])('rejects missing, invalid or insufficient declared buffer bounds: %j', (buffer) => {
    const result = checkModelTextures(glb(png(64, 64), false, buffer))
    expect(result.ok).toBe(false)
    expect(result.unmeasured).toBe(1)
  })
  it('allows the three BIN padding bytes after a declared 33-byte image buffer', () => {
    const result = checkModelTextures(glb(png(64, 64)))
    expect(result.ok).toBe(true)
    expect(result.images[0]?.width).toBe(64)
  })
  it.each([
    {
      EXT_meshopt_compression: {
        buffer: 0,
        byteOffset: 0,
        byteLength: 33,
        byteStride: 1,
        count: 33,
        mode: 'ATTRIBUTES',
      },
    },
    { VENDOR_image_transform: {} },
  ])(
    'refuses transformed image views instead of measuring their decoy fallback: %j',
    (extensions) => {
      const result = checkModelTextures(glb(png(64, 64), false, { byteLength: 33 }, extensions))
      expect(result.ok).toBe(false)
      expect(result.unmeasured).toBe(1)
      expect(result.images[0]?.width).toBeNull()
    },
  )
  it('does not reject geometry-view compression when the image view is untransformed', () => {
    // The second view represents unrelated geometry; its decode is outside this
    // image-only gate. Only the image's actual view must have inspectable bytes.
    const result = checkModelTextures(
      glb(png(64, 64), false, { byteLength: 33 }, undefined, { EXT_meshopt_compression: {} }),
    )
    expect(result.ok).toBe(true)
    expect(result.images[0]?.width).toBe(64)
  })
  it('keeps texture-free GLBs valid without a buffer declaration or BIN chunk', () => {
    const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}'.padEnd(28))
    const bytes = new Uint8Array(20 + json.length)
    const v = new DataView(bytes.buffer)
    v.setUint32(0, 0x46546c67, true)
    v.setUint32(4, 2, true)
    v.setUint32(8, bytes.length, true)
    v.setUint32(12, json.length, true)
    v.setUint32(16, 0x4e4f534a, true)
    bytes.set(json, 20)
    expect(checkModelTextures(bytes).ok).toBe(true)
  })
  it.each([new Uint8Array(0), new Uint8Array([1, 2, 3]), png(0, 10)])(
    'never counts unreadable dimensions as a passed check',
    (image) => {
      const result = checkModelTextures(glb(image))
      expect(result.ok).toBe(false)
      expect(result.unmeasured).toBe(1)
    },
  )
  it('rejects incomplete containers and unsafe buffer bounds', () => {
    const b = glb(png(64, 64))
    expect(checkModelTextures(b.subarray(0, b.length - 1)).ok).toBe(false)
    b[0] = 0
    expect(checkModelTextures(b).ok).toBe(false)
  })
  it('handles lossless and extended WebP dimensions without decoding', () => {
    const b = new Uint8Array(30)
    b.set([82, 73, 70, 70], 0)
    b.set([87, 69, 66, 80], 8)
    b.set([86, 80, 56, 88], 12)
    new DataView(b.buffer).setUint32(16, 10, true)
    b[24] = 63
    b[27] = 31
    expect(rasterDimensions(b)).toEqual([64, 32])
    b.set([86, 80, 56, 76], 12)
    b[20] = 0x2f
    new DataView(b.buffer).setUint32(21, 63 + (31 << 14), true)
    expect(rasterDimensions(b)).toEqual([64, 32])
  })
  it('reads baseline JPEG and rejects a truncated segment', () => {
    const b = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 32, 0, 64, 1])
    expect(rasterDimensions(b)).toEqual([64, 32])
    expect(rasterDimensions(b.subarray(0, 8))).toBeNull()
  })
})

it('refuses a texture without its required image, even when the JSON itself is readable', () => {
  let json = JSON.stringify({ asset: { version: '2.0' }, textures: [{}] })
  json = json.padEnd(Math.ceil(json.length / 4) * 4)
  const bytes = new Uint8Array(20 + json.length)
  const v = new DataView(bytes.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, bytes.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  bytes.set(new TextEncoder().encode(json), 20)
  const check = checkModelTextures(bytes)
  expect(check.ok).toBe(false)
  expect(check.problems[0]).toContain('required image')
})

it('refuses the cumulative project budget rather than considering only each image edge', () => {
  const count = 6,
    stride = 36
  let json = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: count * stride }],
    images: Array.from({ length: count }, (_, bufferView) => ({ bufferView })),
    bufferViews: Array.from({ length: count }, (_, index) => ({
      buffer: 0,
      byteOffset: index * stride,
      byteLength: 33,
    })),
  })
  json = json.padEnd(Math.ceil(json.length / 4) * 4)
  const bytes = new Uint8Array(28 + json.length + count * stride)
  const v = new DataView(bytes.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, bytes.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  bytes.set(new TextEncoder().encode(json), 20)
  v.setUint32(20 + json.length, count * stride, true)
  v.setUint32(24 + json.length, 0x004e4942, true)
  for (let i = 0; i < count; i++) bytes.set(png(4096, 4096), 28 + json.length + i * stride)
  const check = checkModelTextures(bytes)
  expect(check.images.every((image) => image.width === 4096)).toBe(true)
  expect(check.ok).toBe(false)
  expect(check.problems.join(' ')).toContain('Combined raster texture estimate')
})
