import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CRUSHED_BYTES_PER_PIXEL,
  inventoryTextures,
  offUv0Warning,
  profileAlpha,
  summariseUvSets,
} from './textures'

/**
 * These build the fixture the shipped placeholders cannot: a garment with a
 * printed graphic on a SECOND UV set, over a BLEND material, with a hard alpha
 * cutout. That combination is what the first real CLO export turned out to
 * contain, and every placeholder in this repo is four untextured boxes — which
 * is precisely why nothing caught the damage before it reached production.
 */

/** Opaque solid colour, no alpha channel at all — ordinary fabric. */
async function fabricPng(): Promise<Uint8Array> {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 34, g: 49, b: 78 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/** Hard-edged white bar on full transparency — a decal's alpha, binary by construction. */
async function decalPng(): Promise<Uint8Array> {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: {
          create: { width: 40, height: 12, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        },
        top: 26,
        left: 12,
      },
    ])
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/** An alpha channel that is present and entirely solid — CLO's stray opacity case. */
async function opaqueAlphaPng(): Promise<Uint8Array> {
  const png = await sharp({
    create: { width: 32, height: 32, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/** A smooth alpha ramp — genuine translucency, e.g. a mesh panel. */
async function gradedAlphaPng(): Promise<Uint8Array> {
  const width = 64
  const height = 8
  const raw = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    raw[i * 4] = 200
    raw[i * 4 + 1] = 200
    raw[i * 4 + 2] = 200
    raw[i * 4 + 3] = Math.round((255 * (i % width)) / (width - 1))
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
  return new Uint8Array(png)
}

describe('profileAlpha', () => {
  it('reports no channel when the image has none', async () => {
    expect((await profileAlpha(await fabricPng())).character).toBe('none')
  })

  it('reports a fully solid alpha channel as dead weight, not translucency', async () => {
    // This is the case solidifyMaterials' BLEND -> OPAQUE is the right fix for.
    const profile = await profileAlpha(await opaqueAlphaPng())
    expect(profile.character).toBe('opaque')
    expect(profile.opaqueFraction).toBe(1)
  })

  it('reports a hard cutout as binary', async () => {
    // The decal case: BLEND -> OPAQUE would fill the cutout in. MASK preserves it.
    const profile = await profileAlpha(await decalPng())
    expect(profile.character).toBe('binary')
    expect(profile.midFraction).toBeLessThanOrEqual(0.02)
    expect(profile.transparentFraction).toBeGreaterThan(0.5)
  })

  it('distinguishes a genuine alpha ramp from a cutout', async () => {
    // Sheer fabric. Forcing this opaque destroys real translucency.
    expect((await profileAlpha(await gradedAlphaPng())).character).toBe('graded')
  })

  it('does not throw on bytes it cannot decode', async () => {
    expect((await profileAlpha(new Uint8Array([1, 2, 3, 4]))).character).toBe('unknown')
  })
})

describe('summariseUvSets', () => {
  let document: Document

  beforeAll(async () => {
    document = new Document()
    const fabricTexture = document
      .createTexture('fabric')
      .setImage(await fabricPng())
      .setMimeType('image/png')
    const decalTexture = document
      .createTexture('chest-logo')
      .setImage(await decalPng())
      .setMimeType('image/png')

    document.createMaterial('FABRIC').setBaseColorTexture(fabricTexture).setAlphaMode('OPAQUE')
    const decal = document.createMaterial('CHEST-DECAL').setBaseColorTexture(decalTexture).setAlphaMode('BLEND')
    // The whole point of the fixture: CLO's "Apply Graphic" lands the print on a
    // second UV set, which simplify-textured.ts does not weight.
    decal.getBaseColorTextureInfo()?.setTexCoord(1)
  })

  it('finds every UV set the materials sample', () => {
    expect(summariseUvSets(document).texCoordsInUse).toEqual([0, 1])
  })

  it('names the material and slot whose artwork decimation will not protect', () => {
    const { usagesOffUv0 } = summariseUvSets(document)
    expect(usagesOffUv0).toHaveLength(1)
    expect(usagesOffUv0[0]).toMatchObject({
      material: 'CHEST-DECAL',
      slot: 'baseColorTexture',
      texCoord: 1,
      alphaMode: 'BLEND',
    })
  })

  it('counts materials by alphaMode', () => {
    expect(summariseUvSets(document).alphaModeCounts).toEqual({ OPAQUE: 1, BLEND: 1 })
  })
})

describe('offUv0Warning', () => {
  it('says nothing when everything is on TEXCOORD_0', () => {
    expect(offUv0Warning([0], [])).toBeNull()
  })

  it('names the UV set and points at the open issue', () => {
    const warning = offUv0Warning([0, 1], [])
    expect(warning).toContain('TEXCOORD_1')
    expect(warning).toContain('OPEN-ISSUE-ARTWORK')
  })
})

describe('inventoryTextures', () => {
  it('records slot, UV set and alpha character per texture, and warns about both hazards', async () => {
    const document = new Document()
    const decalTexture = document
      .createTexture('chest-logo')
      .setImage(await decalPng())
      .setMimeType('image/png')
    const decal = document.createMaterial('CHEST-DECAL').setBaseColorTexture(decalTexture).setAlphaMode('BLEND')
    decal.getBaseColorTextureInfo()?.setTexCoord(1)

    const inventory = await inventoryTextures(document, 'fixture.glb')
    expect(inventory.textures).toHaveLength(1)
    const [texture] = inventory.textures
    expect(texture?.name).toBe('chest-logo')
    expect(texture?.slots).toEqual(['baseColorTexture'])
    expect(texture?.texCoords).toEqual([1])
    expect(texture?.alpha.character).toBe('binary')
    expect(texture?.width).toBe(64)
    expect(texture?.aspectRatio).toBe(1)

    // Both of the artwork hazards this fixture carries must be called out: the
    // unprotected UV set, and a binary cutout about to be forced opaque.
    expect(inventory.warnings.join('\n')).toContain('TEXCOORD_1')
    expect(inventory.warnings.join('\n')).toContain('MASK')
  })

  it('flags a colour map stored far below what a clean encode produces', async () => {
    // A 2048x2048 base-colour map in 13 KB is 0.003 bpp — the measured state of
    // the damaged N001 textures, and roughly 30x below this threshold.
    const document = new Document()
    const texture = document
      .createTexture('crushed')
      // Bytes are what matter here; the pixel count comes from the real header.
      .setImage(await sharp({ create: { width: 512, height: 512, channels: 3, background: '#808080' } }).webp({ quality: 1 }).toBuffer())
      .setMimeType('image/webp')
    document.createMaterial('BODY').setBaseColorTexture(texture)

    const inventory = await inventoryTextures(document, 'fixture.glb')
    expect(inventory.textures[0]?.bytesPerPixel).toBeLessThan(CRUSHED_BYTES_PER_PIXEL)
    expect(inventory.warnings.join('\n')).toContain('4:2:0')
  })
})
