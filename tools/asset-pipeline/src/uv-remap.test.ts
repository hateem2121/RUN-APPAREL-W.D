import { type Accessor, Document, type Material, type Primitive } from '@gltf-transform/core'
import {
  KHRMaterialsVariants,
  KHRTextureTransform,
  type Transform as TextureTransform,
} from '@gltf-transform/extensions'
import { describe, expect, it } from 'vitest'
import { findArtworkTexturesByGeometry } from './artwork-geometry'
import {
  applyTextureTransform,
  composeTextureTransform,
  remapUvRanges,
  type TextureTransformValues,
  UV_QUANTIZE_BITS,
  uvRemapOf,
  uvSpanInPatternSpace,
} from './uv-remap'

/**
 * A textured quad with any UV range, in a document that also carries a texture so the
 * material has a slot to put the transform on. `existing` is the CLO-style transform
 * already sitting on the slot.
 */
function quad(document: Document, name: string, uvs: number[], material: Material): Primitive {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
    .setBuffer(buffer)
  const uv = document
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array(uvs))
    .setBuffer(buffer)
  const indices = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer)
  const prim = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(indices)
    .setMaterial(material)
  document.createMesh(name).addPrimitive(prim)
  return prim
}

function textured(document: Document, name: string, existing?: TextureTransformValues): Material {
  const texture = document
    .createTexture(`${name} picture`)
    .setImage(new Uint8Array([1, 2, 3]))
    .setMimeType('image/png')
  const material = document.createMaterial(name).setBaseColorTexture(texture)
  if (existing) {
    const t = document
      .createExtension(KHRTextureTransform)
      .createTransform()
      .setOffset(existing.offset)
      .setRotation(existing.rotation)
      .setScale(existing.scale)
    material.getBaseColorTextureInfo()?.setExtension(KHRTextureTransform.EXTENSION_NAME, t)
  }
  return material
}

function transformOf(material: Material): TextureTransformValues | null {
  const t = material
    .getBaseColorTextureInfo()
    ?.getExtension<TextureTransform>(KHRTextureTransform.EXTENSION_NAME)
  if (!t) return null
  return {
    offset: [...t.getOffset()] as [number, number],
    rotation: t.getRotation(),
    scale: [...t.getScale()] as [number, number],
  }
}

function uvsOf(prim: Primitive): number[] {
  return Array.from(prim.getAttribute('TEXCOORD_0')?.getArray() as Float32Array)
}

/** Every vertex must land on the same texel before and after: the whole point. */
function expectSameSampling(
  before: { uvs: number[]; transform: TextureTransformValues | null },
  after: { uvs: number[]; transform: TextureTransformValues | null },
  tolerance = 1e-4,
) {
  expect(after.uvs.length).toBe(before.uvs.length)
  for (let i = 0; i < before.uvs.length; i += 2) {
    const was = applyTextureTransform(
      before.transform ?? { offset: [0, 0], rotation: 0, scale: [1, 1] },
      [before.uvs[i] as number, before.uvs[i + 1] as number],
    )
    const now = applyTextureTransform(
      after.transform ?? { offset: [0, 0], rotation: 0, scale: [1, 1] },
      [after.uvs[i] as number, after.uvs[i + 1] as number],
    )
    expect(Math.abs(now[0] - was[0])).toBeLessThan(tolerance)
    expect(Math.abs(now[1] - was[1])).toBeLessThan(tolerance)
  }
}

describe('composeTextureTransform', () => {
  it('samples the same texel through the composed transform, rotation included', () => {
    // A CLO-style fabric transform (tiny scale, offset, and a rotation to prove the
    // spec's T·R·S order is honoured) over a pattern-space range.
    const existing: TextureTransformValues = {
      offset: [15.2, 6.0],
      rotation: 0.37,
      scale: [0.016, 0.022],
    }
    const remap = {
      offset: [-136.9, -161.4] as [number, number],
      scale: [300.8, 260.0] as [number, number],
    }
    const composed = composeTextureTransform(existing, remap)
    for (const original of [
      [-136.9, -161.4],
      [163.9, 98.6],
      [0, 0],
      [12.5, -40.25],
    ] as [number, number][]) {
      const stored: [number, number] = [
        (original[0] - remap.offset[0]) / remap.scale[0],
        (original[1] - remap.offset[1]) / remap.scale[1],
      ]
      const was = applyTextureTransform(existing, original)
      const now = applyTextureTransform(composed, stored)
      expect(now[0]).toBeCloseTo(was[0], 6)
      expect(now[1]).toBeCloseTo(was[1], 6)
    }
  })

  it('without an existing transform the remap itself becomes the transform', () => {
    const remap = { offset: [0, -1] as [number, number], scale: [1, 1] as [number, number] }
    expect(composeTextureTransform(null, remap)).toEqual({
      offset: [0, -1],
      rotation: 0,
      scale: [1, 1],
    })
  })
})

describe('remapUvRanges', () => {
  it('moves a pattern-space panel into 0..1 and composes the material transform (same texels)', async () => {
    const document = new Document()
    const fabric = textured(document, 'FABRIC 3', {
      offset: [15.2, 6.0],
      rotation: 0,
      scale: [0.016, 0.022],
    })
    const prim = quad(
      document,
      'panel',
      [-136.9, -161.4, 163.9, -161.4, 163.9, 98.6, -136.9, 98.6],
      fabric,
    )
    const before = { uvs: uvsOf(prim), transform: transformOf(fabric) }

    let result: import('./uv-remap').UvRemapResult | undefined
    await document.transform(remapUvRanges({ onResult: (r) => (result = r) }))

    const after = { uvs: uvsOf(prim), transform: transformOf(fabric) }
    expect(Math.min(...after.uvs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...after.uvs)).toBeLessThanOrEqual(1)
    expectSameSampling(before, after)
    expect(result).toMatchObject({
      primitives: 1,
      accessors: 1,
      groups: 1,
      transforms: 1,
      skipped: [],
    })
    expect(result?.widestRange).toBeCloseTo(300.8, 3)
    // The record that lets later passes recover the pattern-space span.
    // Float32 data, so the record is float32 too: compare to the precision it carries.
    const record = uvRemapOf(prim, 'TEXCOORD_0')
    expect(record?.offset[0]).toBeCloseTo(-136.9, 3)
    expect(record?.offset[1]).toBeCloseTo(-161.4, 3)
    expect(record?.scale[0]).toBeCloseTo(300.8, 3)
    expect(record?.scale[1]).toBeCloseTo(260, 3)
    expect(uvSpanInPatternSpace(prim)).toBeCloseTo(300.8, 3)
  })

  it('a print at u 0..1, v −1..0 with CLO’s (0, 1) offset keeps sampling the same texels', async () => {
    const document = new Document()
    const print = textured(document, 'RUN LOGO', { offset: [0, 1], rotation: 0, scale: [1, 1] })
    const prim = quad(document, 'print', [0, -1, 1, -1, 1, 0, 0, 0], print)
    const before = { uvs: uvsOf(prim), transform: transformOf(print) }
    await document.transform(remapUvRanges())
    const after = { uvs: uvsOf(prim), transform: transformOf(print) }
    expectSameSampling(before, after)
    // The composed transform is the identity: CLO's flip and our move cancel.
    expect(after.transform).toEqual({ offset: [0, 0], rotation: 0, scale: [1, 1] })
    expect(uvSpanInPatternSpace(prim)).toBeCloseTo(1, 6)
  })

  it('a material drawn by two panels with different ranges gets ONE transform over the union', async () => {
    const document = new Document()
    const cotton = textured(document, 'cotton_interlock_190gsm', {
      offset: [0, 1],
      rotation: 0,
      scale: [0.015, 0.017],
    })
    const a = quad(
      document,
      'front',
      [-136.9, -161.4, 163.9, -161.4, 163.9, 98.6, -136.9, 98.6],
      cotton,
    )
    const b = quad(
      document,
      'back',
      [-204.9, -139.1, 28.1, -139.1, 28.1, 16.4, -204.9, 16.4],
      cotton,
    )
    const beforeA = { uvs: uvsOf(a), transform: transformOf(cotton) }
    const beforeB = { uvs: uvsOf(b), transform: transformOf(cotton) }
    let result: import('./uv-remap').UvRemapResult | undefined
    await document.transform(remapUvRanges({ onResult: (r) => (result = r) }))
    expectSameSampling(beforeA, { uvs: uvsOf(a), transform: transformOf(cotton) })
    expectSameSampling(beforeB, { uvs: uvsOf(b), transform: transformOf(cotton) })
    expect(result).toMatchObject({ primitives: 2, accessors: 2, groups: 1, transforms: 1 })
    // Union: u −204.9..163.9 (368.8), v −161.4..98.6 (260.0) — the same record on both.
    expect(uvRemapOf(a, 'TEXCOORD_0')).toEqual(uvRemapOf(b, 'TEXCOORD_0'))
    expect(uvRemapOf(a, 'TEXCOORD_0')?.scale[0]).toBeCloseTo(368.8, 3)
    // And each panel's own pattern-space span is recovered exactly, not the union's.
    expect(uvSpanInPatternSpace(a)).toBeCloseTo(300.8, 3)
    expect(uvSpanInPatternSpace(b)).toBeCloseTo(233, 3)
  })

  it('reaches the materials behind a colourway mapping, not just the default (the twice-missed trap)', async () => {
    const document = new Document()
    const variants = document.createExtension(KHRMaterialsVariants)
    const wine = textured(document, 'FABRIC wine', {
      offset: [1, 2],
      rotation: 0,
      scale: [0.02, 0.02],
    })
    const navy = textured(document, 'FABRIC navy', {
      offset: [3, 4],
      rotation: 0,
      scale: [0.03, 0.01],
    })
    const prim = quad(document, 'panel', [-50, -50, 50, -50, 50, 50, -50, 50], wine)
    const mapping = variants
      .createMapping()
      .setMaterial(navy)
      .addVariant(variants.createVariant('Navy'))
    prim.setExtension('KHR_materials_variants', variants.createMappingList().addMapping(mapping))
    const before = uvsOf(prim)
    const beforeNavy = transformOf(navy)
    let result: import('./uv-remap').UvRemapResult | undefined
    await document.transform(remapUvRanges({ onResult: (r) => (result = r) }))
    expect(result?.transforms).toBe(2)
    expectSameSampling(
      { uvs: before, transform: beforeNavy },
      { uvs: uvsOf(prim), transform: transformOf(navy) },
    )
  })

  it('a UV accessor shared by two pieces is rewritten once and both pieces record the move', async () => {
    const document = new Document()
    const a = textured(document, 'Teamwear Logo')
    const b = textured(document, 'RUN LOGO')
    const p1 = quad(document, 'logo', [0, -1, 1, -1, 1, 0, 0, 0], a)
    const p2 = quad(document, 'logo copy', [0, 0, 0, 0, 0, 0, 0, 0], b)
    p2.setAttribute('TEXCOORD_0', p1.getAttribute('TEXCOORD_0'))
    let result: import('./uv-remap').UvRemapResult | undefined
    await document.transform(remapUvRanges({ onResult: (r) => (result = r) }))
    expect(result).toMatchObject({ primitives: 2, accessors: 1, groups: 1, transforms: 2 })
    expect(uvRemapOf(p2, 'TEXCOORD_0')).toEqual(uvRemapOf(p1, 'TEXCOORD_0'))
  })

  it('leaves a set already inside 0..1 exactly as it is, and writes no transform for it', async () => {
    const document = new Document()
    const material = textured(document, 'in range')
    const prim = quad(document, 'quad', [0, 0, 1, 0, 1, 1, 0, 1], material)
    const before = uvsOf(prim)
    let result: import('./uv-remap').UvRemapResult | undefined
    await document.transform(remapUvRanges({ onResult: (r) => (result = r) }))
    expect(uvsOf(prim)).toEqual(before)
    expect(transformOf(material)).toBeNull()
    expect(uvRemapOf(prim, 'TEXCOORD_0')).toBeNull()
    expect(result).toMatchObject({ primitives: 0, alreadyInRange: 1, groups: 0 })
  })

  it('a flat axis takes scale 1 and still samples where it did', async () => {
    const document = new Document()
    const material = textured(document, 'strip')
    // Every vertex at v = 7: no range on that axis.
    const prim = quad(document, 'strip', [-3, 7, 5, 7, 5, 7, -3, 7], material)
    const before = { uvs: uvsOf(prim), transform: transformOf(material) }
    await document.transform(remapUvRanges())
    expectSameSampling(before, { uvs: uvsOf(prim), transform: transformOf(material) })
    expect(uvRemapOf(prim, 'TEXCOORD_0')).toEqual({ offset: [-3, 7], scale: [8, 1] })
  })

  it('skips a group whose UVs are already quantized, and says so', async () => {
    const document = new Document()
    const material = textured(document, 'already quantized')
    const prim = quad(document, 'quad', [0, 0, 1, 0, 1, 1, 0, 1], material)
    prim
      .getAttribute('TEXCOORD_0')
      ?.setArray(new Uint16Array([0, 0, 65535, 0, 65535, 65535, 0, 65535]))
      .setNormalized(true)
    // Force a range the reader calls out-of-range through a second, float piece
    // sharing the material.
    quad(document, 'other', [-5, 0, 5, 0, 5, 1, -5, 1], material)
    let result: import('./uv-remap').UvRemapResult | undefined
    await document.transform(remapUvRanges({ onResult: (r) => (result = r) }))
    expect(result?.primitives).toBe(0)
    expect(result?.skipped).toEqual(['already quantized: TEXCOORD_0 is already quantized'])
    expect(transformOf(material)).toBeNull()
  })

  it('the negative control moves the coordinates and leaves the materials alone', async () => {
    const document = new Document()
    const material = textured(document, 'control', { offset: [0, 1], rotation: 0, scale: [1, 1] })
    const prim = quad(document, 'quad', [0, -1, 1, -1, 1, 0, 0, 0], material)
    await document.transform(remapUvRanges({ composeMaterials: false }))
    expect(Math.min(...uvsOf(prim))).toBeGreaterThanOrEqual(0)
    expect(transformOf(material)).toEqual({ offset: [0, 1], rotation: 0, scale: [1, 1] })
  })
})

describe('the artwork-by-shape rule after the remap', () => {
  it('still tells a print (span 1) from a panel (span 300) once every accessor spans ≤ 1', async () => {
    const document = new Document()
    const fabric = textured(document, 'FABRIC 3', {
      offset: [15.2, 6.0],
      rotation: 0,
      scale: [0.016, 0.022],
    })
    const print = textured(document, 'Asset 2', { offset: [0, 1], rotation: 0, scale: [1, 1] })
    const panel = quad(
      document,
      'panel',
      [-136.9, -161.4, 163.9, -161.4, 163.9, 98.6, -136.9, 98.6],
      fabric,
    )
    quad(document, 'print', [0, -1, 1, -1, 1, 0, 0, 0], print)
    await document.transform(remapUvRanges())
    // Raw spans are now both ≤ 1 — the rule would call the panel a print without the record.
    const raw = panel.getAttribute('TEXCOORD_0') as Accessor
    expect(raw.getMaxNormalized([])[0]).toBeLessThanOrEqual(1)
    const artwork = findArtworkTexturesByGeometry(document)
    expect(artwork.has(print.getBaseColorTexture() as never)).toBe(true)
    expect(artwork.has(fabric.getBaseColorTexture() as never)).toBe(false)
  })

  it('reads a quantized accessor through its normalised values, never the raw integers', () => {
    const document = new Document()
    const material = textured(document, 'quantized')
    const prim = quad(document, 'quad', [0, 0, 1, 0, 1, 1, 0, 1], material)
    prim
      .getAttribute('TEXCOORD_0')
      ?.setArray(new Uint16Array([0, 0, 65535, 0, 65535, 65535, 0, 65535]))
      .setNormalized(true)
    prim.setExtras({ uvRemap: { TEXCOORD_0: { offset: [-10, -10], scale: [20, 20] } } })
    expect(uvSpanInPatternSpace(prim)).toBeCloseTo(20, 6)
  })

  it('the storage precision is the one the header argues for', () => {
    expect(UV_QUANTIZE_BITS).toBe(16)
  })
})
