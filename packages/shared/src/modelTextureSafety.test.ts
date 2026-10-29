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
function glb(image: Uint8Array, extraImage = false): Uint8Array {
  let json = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: image.length }],
    bufferViews: [{ buffer: 0, byteLength: image.length }],
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
