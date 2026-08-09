import { Document } from '@gltf-transform/core'
import { prune } from '@gltf-transform/functions'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CRUSHED_BYTES_PER_PIXEL,
  CUTOUT_MID_FRACTION,
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
          create: {
            width: 40,
            height: 12,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
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
  const png = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/**
 * A wordmark's alpha: thin vertical strokes, each with one anti-aliased column
 * either side. Proportioned to the real `THE EXTRA MILE (Slogan)` texture rather
 * than to whatever happens to pass —
 *
 *              real (1944x121)      this fixture (400x50)
 *   transparent      66.38%                66.75%
 *   opaque           30.04%                29.75%
 *   mid               3.58%                 3.50%
 *
 * The point of the fixture is the 3.5%: chunky decals land under 2% and sheer
 * ramps near 100%, so this is the only shape that distinguishes a correct
 * threshold from one calibrated on blocks.
 */
async function fineLetteringPng(): Promise<Uint8Array> {
  const width = 400
  const height = 50
  const strokes = 7
  const strokeWidth = 17
  const gap = Math.floor((width - strokes * (strokeWidth + 2)) / strokes)

  const raw = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      raw[i] = 20
      raw[i + 1] = 20
      raw[i + 2] = 20
      raw[i + 3] = 0
    }
  }
  for (let s = 0; s < strokes; s++) {
    const left = s * (strokeWidth + 2 + gap)
    for (let y = 0; y < height; y++) {
      for (let x = left; x < left + strokeWidth + 2 && x < width; x++) {
        const i = (y * width + x) * 4
        // The two flanking columns are the anti-aliasing; the rest is solid ink.
        const edge = x === left || x === left + strokeWidth + 1
        raw[i + 3] = edge ? 128 : 255
      }
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/**
 * A feathered / soft-glow print: a blob with a wide alpha falloff rather than an
 * anti-aliased edge. Sits in the 10-25% mid band that nothing else covered, and
 * is the shape a careless widening of CUTOUT_MID_FRACTION would destroy.
 */
async function softGlowPng(): Promise<Uint8Array> {
  const size = 128
  const raw = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const solid = 22
  const feather = 26
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      raw[i] = 90
      raw[i + 1] = 30
      raw[i + 2] = 30
      const d = Math.hypot(x - cx, y - cy)
      let a = 0
      if (d <= solid) a = 255
      else if (d < solid + feather) a = Math.round(255 * (1 - (d - solid) / feather))
      raw[i + 3] = a
    }
  }
  const png = await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer()
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

  it('lands high-ink-coverage lettering in the band between binary and sheer', async () => {
    // The measurement the CUTOUT_* pair is calibrated to. The wordmark that
    // shipped damaged twice — 1944x121, `THE EXTRA MILE (Slogan)` — profiled as:
    //
    //     transparent 66.38%   opaque 30.04%   mid 3.58%
    //
    // 96.42% at the extremes, a cutout by any reading, yet BINARY_MID_FRACTION
    // (0.02) calls it `graded` — which routes it to "sheer fabric, leave it on
    // BLEND" in solidifyMaterials, and <model-viewer> has no OIT.
    //
    // `character` is deliberately NOT widened to cover it (that constant also
    // feeds a blocking gate — see textures.ts). What consumes this is
    // solidifyMaterials, so the pipeline.test.ts case for "converts a
    // high-coverage wordmark → MASK" is the one that pins the actual behaviour.
    // This test pins the numbers that case depends on.
    const profile = await profileAlpha(await fineLetteringPng())

    expect(profile.character).toBe('graded')
    expect(profile.midFraction).toBeGreaterThan(0.02)
    expect(profile.midFraction).toBeLessThanOrEqual(0.05)
    expect(profile.transparentFraction + profile.opaqueFraction).toBeGreaterThan(0.95)
    // The property that makes it safe to treat as a cutout: it is genuinely cut
    // out. A uniformly translucent panel measures 0.000% here.
    expect(profile.transparentFraction).toBeGreaterThan(0.5)
  })

  it('keeps a real ramp graded, and pins the band from ABOVE as well as below', async () => {
    // Without this the constant is pinned on one side only: every assertion
    // above is a lower bound, so the suite stayed green with the threshold set
    // as high as ~0.92 — at which point every sheer fabric in the catalogue
    // would be forced to MASK. Measured, not assumed: the repo's own ramp is
    // 92.19% mid, so the true margin is ~26x, not the "two orders of magnitude"
    // an earlier draft of this comment claimed.
    const ramp = await profileAlpha(await gradedAlphaPng())
    expect(ramp.character).toBe('graded')
    expect(ramp.midFraction).toBeGreaterThan(0.9)
    expect(ramp.midFraction).toBeGreaterThan(CUTOUT_MID_FRACTION * 10)
  })

  it('keeps a soft-glow print graded — the mid-band case neither fixture covered', async () => {
    // Between "3.5% soft edges" and "92% ramp" there was nothing at all, so a
    // careless widening of CUTOUT_MID_FRACTION had a clear run. A feathered
    // print sits in the gap at ~15-25% mid and must stay BLEND.
    const profile = await profileAlpha(await softGlowPng())

    expect(profile.midFraction).toBeGreaterThan(0.1)
    expect(profile.character).toBe('graded')
    expect(profile.midFraction).toBeGreaterThan(CUTOUT_MID_FRACTION)
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
    const decal = document
      .createMaterial('CHEST-DECAL')
      .setBaseColorTexture(decalTexture)
      .setAlphaMode('BLEND')
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
  it('says nothing when no material samples more than one UV set', () => {
    expect(offUv0Warning([], [])).toBeNull()
  })

  it('stays silent for a lone second UV set, which prune renumbers away', () => {
    // MEASURED: when a material samples only ONE UV set, prune() drops the
    // unused sets and shifts the survivor down to TEXCOORD_0 before decimation
    // ever sees it. Warning about that would send the next person chasing a
    // hazard the pipeline already fixes for itself.
    expect(
      offUv0Warning(
        [],
        [{ material: 'M', slot: 'baseColorTexture', texCoord: 1, alphaMode: 'BLEND' }],
      ),
    ).toBeNull()
  })

  it('names the multi-UV materials and points at the open issue', () => {
    const warning = offUv0Warning(['BODY-WITH-GRAPHIC'], [])
    expect(warning).toContain('BODY-WITH-GRAPHIC')
    expect(warning).toContain('OPEN-ISSUE-ARTWORK')
  })
})

describe('prune() interaction — why only multi-UV materials matter', () => {
  /**
   * Pins the finding that narrowed H4. Both cases start identical: a primitive
   * with TEXCOORD_0 and TEXCOORD_1, and a baseColorTexture on texCoord 1. What
   * differs is whether anything else samples UV0.
   */
  const build = (secondSlotOnUv0: boolean) => {
    const document = new Document()
    const buffer = document.createBuffer()
    const accessor = (count: number, type: 'VEC3' | 'VEC2') =>
      document.createAccessor().setType(type).setArray(new Float32Array(count)).setBuffer(buffer)
    const graphic = document
      .createTexture('graphic')
      .setImage(new Uint8Array([1]))
      .setMimeType('image/png')
    const material = document.createMaterial('BODY').setBaseColorTexture(graphic)
    material.getBaseColorTextureInfo()?.setTexCoord(1)
    if (secondSlotOnUv0) {
      const ao = document
        .createTexture('ao')
        .setImage(new Uint8Array([2]))
        .setMimeType('image/png')
      material.setOcclusionTexture(ao)
      material.getOcclusionTextureInfo()?.setTexCoord(0)
    }
    const prim = document
      .createPrimitive()
      .setAttribute('POSITION', accessor(9, 'VEC3'))
      .setAttribute('TEXCOORD_0', accessor(6, 'VEC2'))
      .setAttribute('TEXCOORD_1', accessor(6, 'VEC2'))
      .setMaterial(material)
    document
      .createScene('s')
      .addChild(document.createNode('n').setMesh(document.createMesh('m').addPrimitive(prim)))
    return { document, prim }
  }

  it('renumbers a lone second UV set down to TEXCOORD_0', async () => {
    const { document, prim } = build(false)
    expect(summariseUvSets(document).texCoordsInUse).toEqual([1])

    await document.transform(prune({ keepExtras: true }))

    expect(prim.listSemantics().filter((s) => s.startsWith('TEXCOORD'))).toEqual(['TEXCOORD_0'])
    expect(summariseUvSets(document).texCoordsInUse).toEqual([0])
    expect(summariseUvSets(document).materialsWithMultipleUvSets).toEqual([])
  })

  it('keeps both sets when the material samples both — this is where H4 bites', async () => {
    const { document, prim } = build(true)

    await document.transform(prune({ keepExtras: true }))

    expect(
      prim
        .listSemantics()
        .filter((s) => s.startsWith('TEXCOORD'))
        .sort(),
    ).toEqual(['TEXCOORD_0', 'TEXCOORD_1'])
    expect(summariseUvSets(document).texCoordsInUse).toEqual([0, 1])
    expect(summariseUvSets(document).materialsWithMultipleUvSets).toEqual(['BODY'])
  })
})

describe('inventoryTextures', () => {
  it('records slot, UV set and alpha character per texture, and warns about both hazards', async () => {
    const document = new Document()
    const decalTexture = document
      .createTexture('chest-logo')
      .setImage(await decalPng())
      .setMimeType('image/png')
    const decal = document
      .createMaterial('CHEST-DECAL')
      .setBaseColorTexture(decalTexture)
      .setAlphaMode('BLEND')
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

    // The cutout hazard is real and reported. The lone TEXCOORD_1 is NOT
    // warned about: this material samples only one UV set, so prune() renumbers
    // it to 0 before decimation sees it. The manifest still records `[1]` —
    // reporting the fact without crying wolf about it.
    expect(inventory.warnings.join('\n')).toContain('MASK')
    expect(inventory.materialsWithMultipleUvSets).toEqual([])
    expect(inventory.warnings.join('\n')).not.toContain('more than one UV set')
  })

  it('flags a colour map stored far below what a clean encode produces', async () => {
    // A 2048x2048 base-colour map in 13 KB is 0.003 bpp — the measured state of
    // the damaged N001 textures, and roughly 30x below this threshold.
    const document = new Document()
    const texture = document
      .createTexture('crushed')
      // Bytes are what matter here; the pixel count comes from the real header.
      .setImage(
        await sharp({ create: { width: 512, height: 512, channels: 3, background: '#808080' } })
          .webp({ quality: 1 })
          .toBuffer(),
      )
      .setMimeType('image/webp')
    document.createMaterial('BODY').setBaseColorTexture(texture)

    const inventory = await inventoryTextures(document, 'fixture.glb')
    expect(inventory.textures[0]?.bytesPerPixel).toBeLessThan(CRUSHED_BYTES_PER_PIXEL)
    expect(inventory.warnings.join('\n')).toContain('4:2:0')
  })
})
