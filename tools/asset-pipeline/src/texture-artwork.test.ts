import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compressTexturesForArtwork, isArtworkTexture } from './texture-artwork'

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
