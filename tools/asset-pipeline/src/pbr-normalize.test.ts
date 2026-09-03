import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { type PbrNormalizeResult, normalizePbr } from './pbr-normalize'

async function run(doc: Document): Promise<PbrNormalizeResult> {
  let captured: PbrNormalizeResult | undefined
  await doc.transform(
    normalizePbr({
      onResult: (r) => {
        captured = r
      },
    }),
  )
  if (!captured) throw new Error('normalizePbr did not report')
  return captured
}

describe('normalizePbr — cloth is not metal', () => {
  it('forces a metallic FABRIC material to metallic 0', async () => {
    const doc = new Document()
    doc.createBuffer()
    const m = doc
      .createMaterial('Nylon_Canvas Copy 1_5511')
      .setMetallicFactor(1)
      .setRoughnessFactor(0.1)
    const result = await run(doc)
    expect(m.getMetallicFactor()).toBe(0)
    expect(result.fixed).toEqual(['Nylon_Canvas Copy 1_5511'])
  })

  it('raises roughness off a mirror finish, but never lowers it', async () => {
    // METRO-SHIELD's canvas sits at 0.10 — a mirror. Cloth scatters light.
    const doc = new Document()
    doc.createBuffer()
    const mirror = doc.createMaterial('Nylon_Canvas_1').setMetallicFactor(1).setRoughnessFactor(0.1)
    const matte = doc
      .createMaterial('Cotton_Canvas_2')
      .setMetallicFactor(1)
      .setRoughnessFactor(0.95)
    await run(doc)
    expect(mirror.getRoughnessFactor()).toBeGreaterThanOrEqual(0.5)
    expect(matte.getRoughnessFactor()).toBe(0.95)
  })

  it('LEAVES a material that carries a metallicRoughnessTexture', async () => {
    // THE LOAD-BEARING NEGATIVE CONTROL. Its BLUE channel supplies metalness per
    // pixel. Measured 2026-08-27 on X-MILO's 6835x5331 MR map: mean metalness
    // 0.000, 100% of pixels non-metal, roughness 0.905. Those 3,593 materials are
    // correct, and counting them is what produced a false "hundreds" figure.
    const doc = new Document()
    doc.createBuffer()
    const tex = doc
      .createTexture('mr')
      .setImage(new Uint8Array([0]))
      .setMimeType('image/png')
    const m = doc
      .createMaterial('Nylon_Canvas Copy 1_5511')
      .setMetallicFactor(1)
      .setRoughnessFactor(0.1)
      .setMetallicRoughnessTexture(tex)
    const result = await run(doc)
    expect(m.getMetallicFactor()).toBe(1)
    expect(result.fixed).toEqual([])
    expect(result.skippedWithMrTexture).toBe(1)
  })

  it('LEAVES hardware metal', async () => {
    const doc = new Document()
    doc.createBuffer()
    const zip = doc
      .createMaterial('Zipper 1_Slider_3582')
      .setMetallicFactor(1)
      .setRoughnessFactor(0.2)
    const result = await run(doc)
    expect(zip.getMetallicFactor()).toBe(1)
    expect(zip.getRoughnessFactor()).toBe(0.2)
    expect(result.hardware).toBe(1)
  })

  it('DEFAULTS an unclassified material to matte and reports it by name (A-06, 2026-09-03)', async () => {
    // Until 2026-09-03 this bucket was reported and never touched (owner decision
    // 2026-08-26); the audit then found a trim piece shipping as polished chrome from an
    // absent metallicFactor on a name nobody could classify. Cloth is the safe default;
    // real hardware is caught by name before this bucket, and the report names the part.
    const doc = new Document()
    doc.createBuffer()
    const trim = doc.createMaterial('Trim_0091').setMetallicFactor(1).setRoughnessFactor(0.1)
    const absent = doc.createMaterial('Piece 7') // glTF default: metallic 1
    const result = await run(doc)
    expect(trim.getMetallicFactor()).toBe(0)
    expect(trim.getRoughnessFactor()).toBe(0.5)
    expect(absent.getMetallicFactor()).toBe(0)
    expect(result.unclassified).toEqual(['Trim_0091', 'Piece 7'])
    expect(result.fixed).toEqual(['Trim_0091', 'Piece 7'])
  })

  it('leaves fabric that is already correct completely alone', async () => {
    const doc = new Document()
    doc.createBuffer()
    const m = doc.createMaterial('Cotton_Canvas_2961').setMetallicFactor(0).setRoughnessFactor(0.85)
    const result = await run(doc)
    expect(m.getMetallicFactor()).toBe(0)
    expect(m.getRoughnessFactor()).toBe(0.85)
    expect(result.fixed).toEqual([])
  })

  it('fixes the four measured offenders at their real values', async () => {
    // Verbatim from the catalogue measurement, 2026-08-26.
    const doc = new Document()
    doc.createBuffer()
    const cases: [string, number, number][] = [
      ['Nylon_Canvas Copy 1_2967', 1, 0.1], // metallicFactor ABSENT -> 1.0
      ['FABRIC 2_4010', 0.46, 0.84],
      ['Cotton_Canvas_220315', 0.23, 0.27],
      ['FABRIC 1_3113', 0.29, 0.24],
    ]
    const made = cases.map(([n, m, r]) =>
      doc.createMaterial(n).setMetallicFactor(m).setRoughnessFactor(r),
    )
    const result = await run(doc)
    for (const m of made) expect(m.getMetallicFactor()).toBe(0)
    expect(result.fixed).toHaveLength(4)
  })

  it('touches NOTHING but metalness and roughness', async () => {
    const doc = new Document()
    doc.createBuffer()
    const tex = doc
      .createTexture('base')
      .setImage(new Uint8Array([0]))
      .setMimeType('image/png')
    const m = doc
      .createMaterial('Cotton_Canvas_1')
      .setMetallicFactor(1)
      .setAlphaMode('BLEND')
      .setDoubleSided(true)
      .setBaseColorTexture(tex)
    await run(doc)
    expect(m.getAlphaMode()).toBe('BLEND')
    expect(m.getDoubleSided()).toBe(true)
    expect(m.getBaseColorTexture()).toBe(tex)
  })
})
