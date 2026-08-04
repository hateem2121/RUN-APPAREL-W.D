import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { CRUSHED_BYTES_PER_PIXEL } from './textures'
import {
  compressTexturesForArtwork,
  findArtworkAlphaProblems,
  findCrushedArtwork,
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
    document.createTexture('body-fabric').setImage(await png(256, 256)).setMimeType('image/png')
    document.createTexture('chest-logo').setImage(await cutoutPng()).setMimeType('image/png')

    let result: { artwork: number; standard: number; skipped: number; artworkNames: string[] } | null = null
    await document.transform(compressTexturesForArtwork({ ...options, onResult: (r) => (result = r) }))

    expect(document.getRoot().listTextures().every((t) => t.getMimeType() === 'image/webp')).toBe(true)
    expect(result).toMatchObject({ artwork: 1, standard: 1, skipped: 0 })
    expect(result!.artworkNames).toEqual(['chest-logo'])
  })

  it('does not shrink artwork to the standard texture cap', async () => {
    // The 2048 cap is what resamples thin lettering into mush. Artwork gets the
    // higher cap, so a 3000px graphic survives intact.
    const document = new Document()
    document.createTexture('logo').setImage(await png(3000, 600)).setMimeType('image/png')

    await document.transform(compressTexturesForArtwork(options))

    const image = document.getRoot().listTextures()[0]?.getImage()
    const { width } = await sharp(image!).metadata()
    expect(width).toBe(3000)
  })

  it('still caps ordinary fabric maps', async () => {
    const document = new Document()
    document.createTexture('fabric').setImage(await png(3000, 3000)).setMimeType('image/png')

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
    document.createTexture('big-logo').setImage(await png(5000, 900)).setMimeType('image/png')
    document.createTexture('big-fabric').setImage(await png(5000, 5000)).setMimeType('image/png')

    let result: { artworkResized: string[] } | null = null
    await document.transform(
      compressTexturesForArtwork({ ...options, onResult: (r) => (result = r as never) }),
    )

    expect(result!.artworkResized).toEqual(['big-logo'])
  })

  it('says nothing when the artwork fitted', async () => {
    const document = new Document()
    document.createTexture('logo').setImage(await png(1200, 300)).setMimeType('image/png')

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
    await document.transform(compressTexturesForArtwork({ ...options, onResult: (r) => (result = r) }))

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
  let value = 12345
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
    document.createMaterial("N001-GRAPHIC").setBaseColorTexture(texture)

    const crushed = await findCrushedArtwork(document)

    expect(crushed).toHaveLength(1)
    expect(crushed[0]!.name).toBe('chest-logo')
    expect(crushed[0]!.bytesPerPixel).toBeLessThan(CRUSHED_BYTES_PER_PIXEL)
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
describe('findArtworkAlphaProblems', () => {
  const artworkTexture = (document: Document) =>
    document.createTexture('chest-logo').setMimeType('image/png').setImage(new Uint8Array([0x89, 0x50]))

  it('flags a printed graphic left translucent', async () => {
    const document = new Document()
    document
      .createMaterial('N001-GRAPHIC')
      .setBaseColorTexture(artworkTexture(document))
      .setAlphaMode('BLEND')

    expect(await findArtworkAlphaProblems(document)).toEqual([
      { material: 'N001-GRAPHIC', problem: 'blend' },
    ])
  })

  it('flags a cut-out whose threshold drifted off 0.5', async () => {
    const document = new Document()
    document
      .createMaterial('N001-GRAPHIC')
      .setBaseColorTexture(artworkTexture(document))
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.1)

    expect(await findArtworkAlphaProblems(document)).toEqual([
      { material: 'N001-GRAPHIC', problem: 'cutoff' },
    ])
  })

  it('accepts the shape the pipeline is supposed to produce', async () => {
    const document = new Document()
    document
      .createMaterial('N001-GRAPHIC')
      .setBaseColorTexture(artworkTexture(document))
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)

    expect(await findArtworkAlphaProblems(document)).toEqual([])
  })

  it('leaves sheer FABRIC alone — a mesh panel is legitimately translucent', async () => {
    const document = new Document()
    document
      .createMaterial('N001-MESH-PANEL')
      .setBaseColorTexture(
        document.createTexture('fabric-mesh').setMimeType('image/png').setImage(new Uint8Array([0x89, 0x50])),
      )
      .setAlphaMode('BLEND')

    expect(await findArtworkAlphaProblems(document)).toEqual([])
  })
})
