import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  CONSTANT_TEXTURE_MAX_STDEV,
  estimateGpuTextures,
  foldConstantTextures,
  type FoldResult,
  type GpuEstimate,
  gpuBytesFor,
  PHONE_GPU_BUDGET_BYTES,
} from './texture-fold'

/**
 * THE FIXTURE THE PLAN ASKS FOR (Group 9): a deliberately near-constant map must be
 * folded, one with a real weave must not. Both are built here pixel by pixel so the
 * numbers are the ones the rule is calibrated against — the live skinsuit's roughness
 * map (G 213–221, stdev 0.80) and a map that carries detail (stdev ~50).
 */
const png = (
  w: number,
  h: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) => {
  const raw = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      raw.set([r, g, b, a], (y * w + x) * 4)
    }
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer()
}
/** The skinsuit's roughness map: G jitters 213–221, B 0–3, R 0–2. */
const nearConstantOrm = () =>
  png(64, 64, (x, y) => [
    (x * 7 + y) % 3,
    // 217 almost everywhere; one pixel in 25 sits at 213 or 221 — stdev ≈ 0.6, range 8,
    // the live skinsuit's roughness map (G 213–221, stdev 0.80).
    (x * 64 + y) % 25 === 0 ? ((x + y) % 2 ? 213 : 221) : 217,
    // B: mostly 1, one pixel in 30 at 0 or 3 — stdev ≈ 0.3 (the live map: 0–3, 0.48).
    (x * 64 + y) % 30 === 0 ? ((x + y) % 2 ? 0 : 3) : 1,
    255,
  ])
/** A weave: G swings 60–230 in stripes. */
const weave = () => png(64, 64, (x) => [128, x % 8 < 4 ? 60 : 230, 128, 255])
const flatNormal = () => png(32, 32, () => [128, 128, 255, 255])
const tiltedNormal = () => png(32, 32, () => [180, 128, 220, 255])
const solidColour = () => png(32, 32, () => [200, 100, 50, 255])

async function texture(document: Document, name: string, bytes: Promise<Buffer> | Buffer) {
  return document
    .createTexture(name)
    .setMimeType('image/png')
    .setImage(new Uint8Array(await bytes))
}
const run = async (document: Document) => {
  let out: FoldResult | undefined
  await document.transform(
    foldConstantTextures({
      onResult: (r) => {
        out = r
      },
    }),
  )
  return out as FoldResult
}

describe('foldConstantTextures', () => {
  it('folds a near-constant roughness/metal map into the factors and drops the picture', async () => {
    const document = new Document()
    const orm = await texture(document, 'orm', nearConstantOrm())
    const material = document
      .createMaterial('FABRIC 3')
      .setRoughnessFactor(1)
      .setMetallicFactor(1)
      .setMetallicRoughnessTexture(orm)
    const result = await run(document)
    expect(result.folded.map((f) => f.name)).toEqual(['orm'])
    expect(material.getMetallicRoughnessTexture()).toBeNull()
    expect(material.getRoughnessFactor()).toBeCloseTo(217 / 255, 2)
    expect(material.getMetallicFactor()).toBeCloseTo(1.5 / 255, 2)
    expect(document.getRoot().listTextures()).toHaveLength(0)
    expect(result.folded[0]?.gpuBytes).toBe(gpuBytesFor(64, 64))
  })

  it('⚠️ NEGATIVE CONTROL — a real weave is never folded', async () => {
    const document = new Document()
    const map = await texture(document, 'weave', weave())
    const material = document.createMaterial('FABRIC 3').setMetallicRoughnessTexture(map)
    const result = await run(document)
    expect(result.folded).toEqual([])
    expect(material.getMetallicRoughnessTexture()).toBe(map)
    expect(result.measured).toBe(1)
  })

  it('removes a flat normal map and keeps a tilted one, saying why', async () => {
    const document = new Document()
    const flat = await texture(document, 'flat', flatNormal())
    const tilted = await texture(document, 'tilted', tiltedNormal())
    const a = document.createMaterial('A').setNormalTexture(flat)
    const b = document.createMaterial('B').setNormalTexture(tilted)
    const result = await run(document)
    expect(a.getNormalTexture()).toBeNull()
    expect(b.getNormalTexture()).toBe(tilted)
    expect(result.folded.map((f) => f.name)).toEqual(['flat'])
    expect(result.kept).toEqual([
      { name: 'tilted', reason: 'a constant but tilted normal map — no factor expresses it' },
    ])
  })

  it('folds a solid fabric colour into the base colour factor in LINEAR light', async () => {
    const document = new Document()
    const solid = await texture(document, 'solid', solidColour())
    const material = document
      .createMaterial('FABRIC 1')
      .setBaseColorFactor([1, 1, 1, 1])
      .setBaseColorTexture(solid)
    await run(document)
    expect(material.getBaseColorTexture()).toBeNull()
    const [r, g, b, a] = material.getBaseColorFactor()
    // sRGB 200/100/50 → linear 0.578/0.127/0.032
    expect(r).toBeCloseTo(0.578, 2)
    expect(g).toBeCloseTo(0.127, 2)
    expect(b).toBeCloseTo(0.032, 2)
    expect(a).toBeCloseTo(1, 5)
  })

  it('never folds printed artwork, however flat it measures', async () => {
    const document = new Document()
    const solid = await texture(document, 'solid', solidColour())
    const print = document.createMaterial('RUN LOGO_3183').setBaseColorTexture(solid)
    const result = await run(document)
    expect(print.getBaseColorTexture()).toBe(solid)
    expect(result.folded).toEqual([])
  })

  it('pins the band at the measured numbers', () => {
    expect(CONSTANT_TEXTURE_MAX_STDEV).toBe(1)
  })
})

describe('estimateGpuTextures', () => {
  it('counts every unique picture at 4 bytes a pixel plus a third for mipmaps, split by what it buys', async () => {
    const document = new Document()
    const fabricTex = await texture(document, 'fabric', weave())
    const ormTex = await texture(document, 'orm', nearConstantOrm())
    const printTex = await texture(document, 'print', solidColour())
    document
      .createMaterial('FABRIC 1')
      .setBaseColorTexture(fabricTex)
      .setMetallicRoughnessTexture(ormTex)
    document.createMaterial('RUN LOGO_1').setBaseColorTexture(printTex)
    let out: GpuEstimate | undefined
    await document.transform(
      estimateGpuTextures({
        onResult: (r) => {
          out = r
        },
      }),
    )
    const estimate = out as GpuEstimate
    expect(estimate.totalBytes).toBe(gpuBytesFor(64, 64) * 2 + gpuBytesFor(32, 32))
    expect(estimate.fabricBytes).toBe(gpuBytesFor(64, 64))
    expect(estimate.shadingBytes).toBe(gpuBytesFor(64, 64))
    expect(estimate.artworkBytes).toBe(gpuBytesFor(32, 32))
    expect(estimate.overBudget).toBe(false)
  })

  it('the arithmetic behind the numbers the audit reported', () => {
    // A 2048x2048 map: 4M pixels x 4 bytes x 4/3 = 22.4 MB — the audit's 21.33 MiB.
    expect(gpuBytesFor(2048, 2048) / 1048576).toBeCloseTo(21.33, 1)
    expect(PHONE_GPU_BUDGET_BYTES).toBe(256 * 1024 * 1024)
  })
})
