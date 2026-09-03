import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { CRUSHED_BYTES_PER_PIXEL } from './textures'
import {
  auditArtworkAlpha,
  classifyArtworkForGate,
  compressTexturesForArtwork,
  findArtworkAlphaProblems,
  findCrushedArtwork,
  isArtworkMaterialByName,
  isArtworkTexture,
} from './texture-artwork'

/**
 * Classification is the whole risk here. Mis-reading fabric as artwork costs a
 * few hundred KB; mis-reading artwork as fabric is the bug this module exists to
 * fix, so the signals are deliberately generous and each is tested on its own.
 */

async function png(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha?: number } = { r: 30, g: 40, b: 60 },
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: background.alpha === undefined ? 3 : 4, background },
  })
    .png()
    .toBuffer()
  return new Uint8Array(buffer)
}

/** Hard-edged mark on full transparency — a decal. */
async function cutoutPng(size = 64): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: {
          create: {
            width: size / 2,
            height: size / 4,
            channels: 4,
            background: { r: 220, g: 20, b: 40, alpha: 1 },
          },
        },
        top: Math.round(size * 0.375),
        left: Math.round(size * 0.25),
      },
    ])
    .png()
    .toBuffer()
  return new Uint8Array(buffer)
}

const textureWith = async (
  name: string,
  image: Uint8Array,
  configure?: (document: Document, texture: ReturnType<Document['createTexture']>) => void,
) => {
  const document = new Document()
  const texture = document.createTexture(name).setImage(image).setMimeType('image/png')
  configure?.(document, texture)
  return { document, texture }
}

describe('isArtworkTexture', () => {
  it('recognises artwork by name', async () => {
    const { texture } = await textureWith('chest-logo', await png(64, 64))
    expect(await isArtworkTexture(texture)).toBe(true)
  })

  it('recognises a wordmark by its extreme aspect ratio', async () => {
    // The real file carried 853x142 and 1944x121 textures — 6:1 and 16:1.
    const { texture } = await textureWith('tex_07', await png(853, 142))
    expect(await isArtworkTexture(texture)).toBe(true)
  })

  it('recognises a decal by its hard alpha cutout', async () => {
    const { texture } = await textureWith('tex_11', await cutoutPng())
    expect(await isArtworkTexture(texture)).toBe(true)
  })

  it('treats an ordinary square fabric map as standard', async () => {
    const { texture } = await textureWith('tex_02', await png(1024, 1024))
    expect(await isArtworkTexture(texture)).toBe(false)
  })

  it('never treats a normal map as artwork, whatever it is called', async () => {
    // Encoding a normal map at quality 95 wastes bytes and protects nothing, and
    // "print" turning up in a data map's name is entirely plausible.
    const { document, texture } = await textureWith('print_normal', await png(512, 512))
    document.createMaterial('body').setNormalTexture(texture)
    expect(await isArtworkTexture(texture)).toBe(false)
  })

  it('still treats a base-colour map named like artwork as artwork', async () => {
    const { document, texture } = await textureWith('front-graphic', await png(512, 512))
    document.createMaterial('body').setBaseColorTexture(texture)
    expect(await isArtworkTexture(texture)).toBe(true)
  })
})

describe('compressTexturesForArtwork', () => {
  const options = {
    quality: 82,
    maxSize: 2048,
    artworkQuality: 95,
    artworkMaxSize: 4096,
  }

  it('re-encodes to WebP and reports how each texture was classified', async () => {
    const document = new Document()
    document
      .createTexture('body-fabric')
      .setImage(await png(256, 256))
      .setMimeType('image/png')
    document
      .createTexture('chest-logo')
      .setImage(await cutoutPng())
      .setMimeType('image/png')

    let result: {
      artwork: number
      standard: number
      skipped: number
      artworkNames: string[]
    } | null = null
    await document.transform(
      compressTexturesForArtwork({ ...options, onResult: (r) => (result = r) }),
    )

    expect(
      document
        .getRoot()
        .listTextures()
        .every((t) => t.getMimeType() === 'image/webp'),
    ).toBe(true)
    expect(result).toMatchObject({ artwork: 1, standard: 1, skipped: 0 })
    expect(result!.artworkNames).toEqual(['chest-logo'])
  })

  it('does not shrink artwork to the standard texture cap', async () => {
    // The 2048 cap is what resamples thin lettering into mush. Artwork gets the
    // higher cap, so a 3000px graphic survives intact.
    const document = new Document()
    document
      .createTexture('logo')
      .setImage(await png(3000, 600))
      .setMimeType('image/png')

    await document.transform(compressTexturesForArtwork(options))

    const image = document.getRoot().listTextures()[0]?.getImage()
    const { width } = await sharp(image!).metadata()
    expect(width).toBe(3000)
  })

  it('still caps ordinary fabric maps', async () => {
    const document = new Document()
    document
      .createTexture('fabric')
      .setImage(await png(3000, 3000))
      .setMimeType('image/png')

    await document.transform(compressTexturesForArtwork(options))

    const image = document.getRoot().listTextures()[0]?.getImage()
    const { width } = await sharp(image!).metadata()
    expect(width).toBe(2048)
  })

  it('encodes artwork larger than the same image at standard quality', async () => {
    // A direct measurement of the fidelity the artwork path buys, on an image
    // with the saturated edges 4:2:0 chroma bleeds.
    const image = await cutoutPng(512)
    const build = async () => {
      const document = new Document()
      document.createTexture('mark').setImage(image).setMimeType('image/png')
      return document
    }

    const artworkDoc = await build()
    await artworkDoc.transform(compressTexturesForArtwork(options))
    const standardDoc = await build()
    await standardDoc.transform(
      // Same image, forced down the standard path by matching the flags.
      compressTexturesForArtwork({ ...options, artworkQuality: 82, artworkMaxSize: 2048 }),
    )

    const artworkBytes = artworkDoc.getRoot().listTextures()[0]?.getImage()?.byteLength ?? 0
    const standardBytes = standardDoc.getRoot().listTextures()[0]?.getImage()?.byteLength ?? 0
    expect(artworkBytes).toBeGreaterThan(standardBytes)
  })

  it('reports artwork it had to shrink, because that is lost lettering', async () => {
    // Artwork above the 4096 cap still gets resized. That is the right trade for
    // file size and it is still information lost from a wordmark, so it must be
    // said out loud rather than happening quietly. Fabric resizing is routine
    // and deliberately not reported.
    const document = new Document()
    document
      .createTexture('big-logo')
      .setImage(await png(5000, 900))
      .setMimeType('image/png')
    document
      .createTexture('big-fabric')
      .setImage(await png(5000, 5000))
      .setMimeType('image/png')

    let result: { artworkResized: string[] } | null = null
    await document.transform(
      compressTexturesForArtwork({ ...options, onResult: (r) => (result = r as never) }),
    )

    expect(result!.artworkResized).toEqual(['big-logo'])
  })

  it('says nothing when the artwork fitted', async () => {
    const document = new Document()
    document
      .createTexture('logo')
      .setImage(await png(1200, 300))
      .setMimeType('image/png')

    let result: { artworkResized: string[] } | null = null
    await document.transform(
      compressTexturesForArtwork({ ...options, onResult: (r) => (result = r as never) }),
    )

    expect(result!.artworkResized).toEqual([])
  })

  it('leaves a texture it cannot decode exactly as it was', async () => {
    // A missing logo is worse than an unoptimised one, so KTX2 and friends pass
    // through untouched rather than being dropped.
    const document = new Document()
    const original = new Uint8Array([0xab, 0x4b, 0x54, 0x58])
    document.createTexture('gpu').setImage(original).setMimeType('image/ktx2')

    let result: { skipped: number } | null = null
    await document.transform(
      compressTexturesForArtwork({ ...options, onResult: (r) => (result = r) }),
    )

    expect(document.getRoot().listTextures()[0]?.getImage()).toEqual(original)
    expect(document.getRoot().listTextures()[0]?.getMimeType()).toBe('image/ktx2')
    expect(result).toMatchObject({ skipped: 1 })
  })
})

/**
 * The cheapest signal that would have caught the live bug.
 *
 * N001's damaged export carried a 2048x2048 colour map stored in 13 KB — 0.003
 * bytes/pixel, 6.6x below the threshold this repo already defined and never
 * wired into the automated path. A clean encode of flat artwork lands around
 * 0.05-0.15.
 *
 * This is a WARNING, not a gate: a legitimately flat artwork texture (a solid
 * colour label) also encodes tiny, so blocking on it would reject good garments.
 * The blocking signal is `artworkAtRisk` in simplify-textured.ts, which is
 * structural and has no false-positive case.
 */
async function webpFrom(size: number, quality: number, fill: (i: number) => number) {
  const raw = Buffer.alloc(size * size * 3)
  const value = 12345
  for (let i = 0; i < raw.length; i++) raw[i] = fill(i) & 255
  void value
  const buffer = await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .webp({ quality })
    .toBuffer()
  return new Uint8Array(buffer)
}

/**
 * Measured on this fixture at 1024x1024 (threshold is 0.02):
 *
 *   content     q1      q50     q95
 *   smooth   0.0092  0.0095  0.0152   ← every quality lands "crushed"
 *   noise    0.1669  0.5290  0.9583   ← no quality does
 *
 * That is the honest shape of this signal: bytes-per-pixel detects "a large
 * image storing almost no information", which is what a smashed wordmark looks
 * like — and equally what a legitimately flat label looks like. Hence a warning.
 */
const smoothWebp = (size: number, quality: number) =>
  webpFrom(size, quality, (i) => (i * 1103515245 + 12345) % 256)

/** Deterministic xorshift noise — genuinely incompressible, so bpp stays high. */
function noiseWebp(size: number, quality: number) {
  let s = 12345
  return webpFrom(size, quality, () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s
  })
}

describe('findCrushedArtwork', () => {
  it('flags an artwork texture stored far below a clean encode', async () => {
    const document = new Document()
    const texture = document
      .createTexture('chest-logo')
      .setMimeType('image/webp')
      .setImage(await smoothWebp(1024, 1))
    document.createMaterial('N001-GRAPHIC').setBaseColorTexture(texture)

    const crushed = await findCrushedArtwork(document)

    expect(crushed).toHaveLength(1)
    expect(crushed[0]!.name).toBe('chest-logo')
    expect(crushed[0]!.bytesPerPixel).toBeLessThan(CRUSHED_BYTES_PER_PIXEL)
  })

  it('leaves a FLAT one-colour cut-out alone however few bytes it takes (F2-07, the ARMOR mark)', async () => {
    // 1024x1024 transparent canvas with one solid disc: alpha carries the shape,
    // the colour is constant, so a q1 WebP is tiny AND crisp.
    const size = 1024
    const raw = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const inside = (x - 512) ** 2 + (y - 512) ** 2 < 300 ** 2
        const i = (y * size + x) * 4
        raw[i] = 20
        raw[i + 1] = 30
        raw[i + 2] = 40
        raw[i + 3] = inside ? 255 : 0
      }
    const webp = new Uint8Array(
      await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
        .webp({ quality: 1 })
        .toBuffer(),
    )
    const document = new Document()
    const texture = document.createTexture('flat-mark').setMimeType('image/webp').setImage(webp)
    document.createMaterial('OUTERWEAR LOGO').setBaseColorTexture(texture)
    // It IS below the byte line — that is the whole point of the exemption.
    const bytesPerInk = webp.byteLength / (Math.PI * 300 ** 2)
    expect(bytesPerInk).toBeLessThan(CRUSHED_BYTES_PER_PIXEL)

    expect(await findCrushedArtwork(document)).toEqual([])
  })

  it('leaves a healthy artwork encode alone', async () => {
    const document = new Document()
    const texture = document
      .createTexture('chest-logo')
      .setMimeType('image/webp')
      .setImage(await noiseWebp(1024, 95))
    document.createMaterial('N001-GRAPHIC').setBaseColorTexture(texture)

    expect(await findCrushedArtwork(document)).toEqual([])
  })

  it('ignores fabric maps, which are allowed to be cheap', async () => {
    const document = new Document()
    // Square, unremarkably named, no alpha — none of the artwork signals fire.
    const texture = document
      .createTexture('fabric-weave')
      .setMimeType('image/webp')
      .setImage(await smoothWebp(1024, 1))
    document.createMaterial('N001-BODY').setBaseColorTexture(texture)

    expect(await findCrushedArtwork(document)).toEqual([])
  })
})

/**
 * Alpha, on artwork specifically.
 *
 * <model-viewer> has no order-independent transparency, so a BLEND material
 * renders see-through and depth-sorts badly — the "half visible, half not"
 * the owner reported. The pipeline's solidify step is supposed to resolve every
 * hard cutout to MASK with alphaCutoff 0.5 (docs/OPEN-ISSUE-ARTWORK.md H3), but
 * nothing asserted the result on the way out, so a decal left as BLEND, or a
 * MASK whose cutoff drifted, shipped silently.
 *
 * Structural like `artworkAtRisk`, not a guess: these are stated facts about the
 * output file.
 */
/**
 * A soft-edged print: half its ink is part-transparent, like ARISAN BRA's brush
 * logo (51% soft-of-ink, audit F1-01). `profileAlpha` reads it as 'graded'.
 */
async function softPng(size = 64): Promise<Uint8Array> {
  const channels = 4
  const data = Buffer.alloc(size * size * channels, 0)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels
      // A horizontal band whose alpha ramps 0 → 255 → 0 across its height: ink with
      // feathered edges everywhere, and fully clear rows above and below it.
      const band = y >= size / 4 && y < (3 * size) / 4
      const t = band ? 1 - Math.abs((y - size / 2) / (size / 4)) : 0
      data[i] = 220
      data[i + 1] = 20
      data[i + 2] = 40
      data[i + 3] = Math.round(255 * t)
    }
  }
  const buffer = await sharp(data, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer()
  return new Uint8Array(buffer)
}

/** CLO's topstitch strip: 236x39, soft alpha, bound to a material named as thread. */
async function threadStripPng(): Promise<Uint8Array> {
  const width = 236
  const height = 39
  const channels = 4
  const data = Buffer.alloc(width * height * channels, 0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      // A cord down the middle with feathered edges — every row part-transparent.
      const t = Math.max(0, 1 - Math.abs((y - height / 2) / (height / 2)))
      data[i] = 200
      data[i + 1] = 200
      data[i + 2] = 200
      data[i + 3] = Math.round(255 * t)
    }
  }
  const buffer = await sharp(data, { raw: { width, height, channels } }).png().toBuffer()
  return new Uint8Array(buffer)
}

const materialWith = (
  document: Document,
  name: string,
  image: Uint8Array | null,
  mode: 'BLEND' | 'MASK' | 'OPAQUE' = 'BLEND',
) => {
  const material = document.createMaterial(name).setAlphaMode(mode)
  if (image) {
    material.setBaseColorTexture(
      document.createTexture('').setMimeType('image/png').setImage(image),
    )
  }
  return material
}

/**
 * THE GATE'S CLASSIFIER, and the negative controls that made the audit's two refusals.
 *
 * Until 2026-09-02 one generous classifier fed a blocking gate, and CLO's 236x39
 * thread strip — six times longer than wide, soft alpha, bound to a material named
 * `Default Topstitch_3569` — was read as a wordmark BEFORE its alpha was looked at.
 * Two of the owner's five finished garments could never be published (audit F2-01,
 * HG-01, B-03, CG-02, CT-06). Each case below is one of those garments in miniature.
 */
describe('classifyArtworkForGate — the strict classifier', () => {
  it('never calls a material named as thread artwork, whatever the picture', async () => {
    const document = new Document()
    const material = materialWith(document, 'Default Topstitch_3569', await threadStripPng())
    const c = await classifyArtworkForGate(material)
    expect(c).toMatchObject({ artwork: false, excluded: true, reason: null })
  })

  it('does NOT let a long thin picture qualify on its shape alone', async () => {
    // Same strip, unnamed material. The generous classifier still says artwork
    // (aspect 6.05) — that is its job. The gate must not.
    const document = new Document()
    const material = materialWith(document, 'Untitled', await threadStripPng())
    expect(await isArtworkTexture(material.getBaseColorTexture()!)).toBe(true)
    const c = await classifyArtworkForGate(material)
    expect(c.artwork).toBe(false)
    expect(c.alpha?.character).toBe('graded')
  })

  it('recognises artwork by the MATERIAL name — CLO leaves every texture anonymous', async () => {
    const document = new Document()
    const material = materialWith(document, 'RUN BRUSH LOGO_3183', await softPng())
    expect(await classifyArtworkForGate(material)).toMatchObject({ artwork: true, reason: 'name' })
  })

  it('recognises a hard cut-out as a decal even with no name at all', async () => {
    const document = new Document()
    const material = materialWith(document, '76197', await cutoutPng())
    expect(await classifyArtworkForGate(material)).toMatchObject({
      artwork: true,
      reason: 'cutout',
    })
  })

  it('negative control: the thread fixture DOES qualify once it is renamed and hard-edged', async () => {
    // Proves the exclusion and the softness are what clear the thread, not a broken
    // fixture: rename the material and give it binary alpha, and it is artwork.
    const document = new Document()
    const material = materialWith(document, 'RUN LOGO', await cutoutPng())
    expect(await classifyArtworkForGate(material)).toMatchObject({ artwork: true, reason: 'name' })
  })
})

describe('isArtworkMaterialByName — the slogans CLO actually writes (MAT-17)', () => {
  const named = (name: string) => ({ getName: () => name })

  it.each([
    'THE EXTRA MILE (Slogan)_9946590',
    'Extra Mile_3170',
    'Never Look Back',
    'ルン ろご。_57892',
    'All Slogan',
    'RUN LOGO_3183',
    'Material_Graphic_8132306',
  ])('classifies %s as artwork', (name) => {
    expect(isArtworkMaterialByName(named(name))).toBe(true)
  })

  // The audit's two-way control: seven fabric names that must stay at 0 false
  // positives. Every word added to the list has to keep this green.
  it.each([
    'Textile_Cotton',
    'Texture_Map_01',
    'Polyester_Textured',
    'Cotton_Canvas_2961',
    'Default Fabric_2915',
    'SUPPLIER_DOBBY_A_8132292',
    'Default Topstitch_3168',
  ])('does NOT classify the fabric name %s as artwork', (name) => {
    expect(isArtworkMaterialByName(named(name))).toBe(false)
  })
})

/**
 * THE GATE. Refuses only what the pipeline would have changed and did not; warns
 * about what it chose to keep. Each block names the audit finding it closes.
 */
describe('auditArtworkAlpha — refusals and warnings', () => {
  it('a thread strip on BLEND is neither a problem nor a warning (F2-01, HG-01, B-03)', async () => {
    const document = new Document()
    materialWith(document, 'Default Topstitch_3569', await threadStripPng())
    expect(await auditArtworkAlpha(document)).toEqual({ problems: [], soft: [] })
    expect(await findArtworkAlphaProblems(document)).toEqual([])
  })

  it('a soft-edged print kept on BLEND is a WARNING, not a refusal (F1-01, B-01)', async () => {
    const document = new Document()
    materialWith(document, 'RUN BRUSH LOGO_3183', await softPng())
    const audit = await auditArtworkAlpha(document)
    expect(audit.problems).toEqual([])
    expect(audit.soft).toHaveLength(1)
    expect(audit.soft[0]).toMatchObject({
      material: 'RUN BRUSH LOGO_3183',
      reason: 'graded',
      factor: 1,
    })
    expect(audit.soft[0]?.midFraction).toBeGreaterThan(0.1)
  })

  it("a print CLO made translucent (factor 0.4) is a WARNING that says so (B-01, women's dress)", async () => {
    const document = new Document()
    materialWith(document, 'ルン ろご。_57892', await cutoutPng()).setBaseColorFactor([
      1, 1, 1, 0.4,
    ])
    const audit = await auditArtworkAlpha(document)
    expect(audit.problems).toEqual([])
    expect(audit.soft).toEqual([
      {
        material: 'ルン ろご。_57892',
        reason: 'sheer-factor',
        factor: 0.4,
        midFraction: expect.any(Number),
      },
    ])
  })

  it('a hard cut-out at full opacity still on BLEND IS refused — the opaque step did not run', async () => {
    const document = new Document()
    materialWith(document, 'RUN LOGO_3183', await cutoutPng())
    expect(await auditArtworkAlpha(document)).toEqual({
      problems: [{ material: 'RUN LOGO_3183', problem: 'blend' }],
      soft: [],
    })
  })

  it('negative control both ways: the same refused fixture passes once solidified to MASK 0.5', async () => {
    const document = new Document()
    materialWith(document, 'RUN LOGO_3183', await cutoutPng(), 'MASK').setAlphaCutoff(0.5)
    expect(await auditArtworkAlpha(document)).toEqual({ problems: [], soft: [] })
  })

  it('a picture that will not decode is a warning, never a refusal (N8)', async () => {
    const document = new Document()
    materialWith(document, 'N001-GRAPHIC', new Uint8Array([0x89, 0x50]))
    const audit = await auditArtworkAlpha(document)
    expect(audit.problems).toEqual([])
    expect(audit.soft).toEqual([
      { material: 'N001-GRAPHIC', reason: 'undecodable', factor: 1, midFraction: 0 },
    ])
  })

  it('flags a cut-out whose threshold drifted off 0.5 — unchanged', async () => {
    const document = new Document()
    materialWith(document, 'N001-GRAPHIC', await cutoutPng(), 'MASK').setAlphaCutoff(0.1)
    expect(await findArtworkAlphaProblems(document)).toEqual([
      { material: 'N001-GRAPHIC', problem: 'cutoff' },
    ])
  })

  it('accepts the shape the pipeline is supposed to produce', async () => {
    const document = new Document()
    materialWith(document, 'N001-GRAPHIC', await cutoutPng(), 'MASK').setAlphaCutoff(0.5)
    expect(await findArtworkAlphaProblems(document)).toEqual([])
  })

  it('leaves sheer FABRIC alone — a mesh panel is legitimately translucent', async () => {
    const document = new Document()
    materialWith(document, 'N001-MESH-PANEL', await softPng())
    expect(await auditArtworkAlpha(document)).toEqual({ problems: [], soft: [] })
  })

  it('never decodes an OPAQUE material and skips it', async () => {
    const document = new Document()
    materialWith(document, 'RUN LOGO_3183', new Uint8Array([0x89, 0x50]), 'OPAQUE')
    expect(await auditArtworkAlpha(document)).toEqual({ problems: [], soft: [] })
  })

  it('reaches a material bound only through a colourway variant', async () => {
    // The repo's recurring trap: a pass that touches materials must reach the ones
    // behind KHR_materials_variants. Root.listMaterials() does, and this pins it.
    const { KHRMaterialsVariants } = await import('@gltf-transform/extensions')
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const only = materialWith(document, 'RUN LOGO_3183', await cutoutPng())
    const primitive = document
      .createPrimitive()
      .setMaterial(materialWith(document, 'FABRIC 1', null, 'OPAQUE'))
    primitive.setExtension(
      'KHR_materials_variants',
      ext
        .createMappingList()
        .addMapping(ext.createMapping().setMaterial(only).addVariant(ext.createVariant('wine'))),
    )
    document.createMesh('m').addPrimitive(primitive)
    expect((await auditArtworkAlpha(document)).problems).toEqual([
      { material: 'RUN LOGO_3183', problem: 'blend' },
    ])
  })
})
