import type { Document, Texture, Transform } from '@gltf-transform/core'
import { createTransform, listTextureSlots } from '@gltf-transform/functions'
import sharp from 'sharp'
import { ARTWORK_ASPECT_RATIO, profileAlpha } from './textures'

/**
 * Texture re-encoding that treats printed artwork differently from fabric.
 *
 * WHY THIS REPLACED `textureCompress`. The pipeline used to push every texture
 * through glTF-Transform's `textureCompress` at quality 82 with no slot filter.
 * libwebp's lossy encoder works exclusively in 8-bit Y'CbCr **4:2:0** — chroma
 * stored at half resolution in both axes — so hard saturated edges bleed into
 * their neighbours. That is the canonical failure mode for a wordmark or a flat
 * printed graphic, and it matches the measured evidence: a 2048x2048 base-colour
 * map stored in 13 KB is 0.003 bytes/pixel, which is what q82 4:2:0 does to a
 * mostly-flat logo on transparency.
 *
 * WHY NOT JUST PASS OPTIONS TO `textureCompress`. Its `TextureCompressOptions`
 * exposes `quality`, `lossless`, `nearLossless` and `chromaSubsampling` — but
 * `chromaSubsampling` is a JPEG/AVIF option and sharp ignores it for WebP. The
 * levers that actually address this are `smartSubsample` (libwebp's "Sharp YUV",
 * which computes chroma in linear light instead of naively averaging),
 * `alphaQuality` and `effort`, and `textureCompress` exposes none of them.
 * Reaching them needs to call sharp directly, which this package already does
 * elsewhere.
 *
 * `smartSubsample` is applied to EVERY texture, artwork or not. It costs no file
 * size — it changes how chroma is computed, not how much is stored — and it
 * exists precisely for this artefact. There is no reason to have it off.
 *
 * The artwork/standard split then buys the rest: quality and alpha fidelity go
 * up, and the resize cap comes off, only for the textures that carry graphics.
 * Textures were 2.1 MB of a 19 MB file, so this is close to free — the geometry
 * is what makes these files big.
 */

/** Names CLO and its users give artwork textures. Matched case-insensitively against name and URI. */
const ARTWORK_NAME = /(logo|print|graphic|artwork|label|decal|badge|emblem|wordmark|text|type)/i

/** Slots that are data, not pictures. Never treated as artwork whatever they are called. */
const DATA_SLOT = /(normal|metallicRoughness|occlusion)Texture/i

/** Encoder settings. Defaults live in optimize.ts so the CLI and this stay in step. */
export interface ArtworkTextureOptions {
  /** WebP quality for ordinary fabric maps. */
  quality: number
  /** Resize cap for ordinary fabric maps, aspect preserved, never enlarged. */
  maxSize: number
  /** WebP quality for textures carrying printed graphics. */
  artworkQuality: number
  /** Resize cap for artwork. Higher, because thin lettering is what resampling destroys first. */
  artworkMaxSize: number
  onResult?: (result: TextureArtworkResult) => void
}

export interface TextureArtworkResult {
  /** Textures encoded with the artwork settings. */
  artwork: number
  /** Textures encoded with the standard settings. */
  standard: number
  /** Textures left alone — no image, or a format sharp cannot read (e.g. KTX2). */
  skipped: number
  /** Names/URIs classified as artwork, so the choice is auditable rather than magic. */
  artworkNames: string[]
}

/** Formats sharp can decode here. KTX2 and other GPU formats are left untouched. */
const DECODABLE = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Decide whether a texture carries printed artwork.
 *
 * Three independent signals, any of which is enough. They are deliberately
 * generous: mis-classifying fabric as artwork costs a few hundred KB, while
 * mis-classifying artwork as fabric is the bug this module exists to fix.
 */
export async function isArtworkTexture(texture: Texture): Promise<boolean> {
  const slots = listTextureSlots(texture)
  // A normal or ORM map is data. Encoding it at quality 95 wastes bytes and
  // protects nothing, and its name may well contain "print" by coincidence.
  if (slots.length > 0 && slots.every((slot) => DATA_SLOT.test(slot))) return false

  const label = `${texture.getName()} ${texture.getURI()}`
  if (ARTWORK_NAME.test(label)) return true

  const image = texture.getImage()
  if (!image) return false

  try {
    const { width, height } = await sharp(image).metadata()
    // Wordmarks and printed bands are long thin strips; fabric maps are square.
    // The real file had 853x142 and 1944x121 textures — 6:1 and 16:1.
    if (width && height && Math.max(width, height) / Math.min(width, height) >= ARTWORK_ASPECT_RATIO) {
      return true
    }
  } catch {
    return false
  }

  // A hard alpha cutout means a decal sitting on the garment rather than a
  // fabric map. Graded alpha is sheer fabric; absent or solid alpha is neither.
  return (await profileAlpha(image)).character === 'binary'
}

/**
 * Re-encode every decodable texture to WebP, artwork at higher fidelity.
 *
 * Runs before decimation, matching where `textureCompress` sat in the chain.
 */
export function compressTexturesForArtwork(options: ArtworkTextureOptions): Transform {
  return createTransform('compressTexturesForArtwork', async (document: Document): Promise<void> => {
    const result: TextureArtworkResult = { artwork: 0, standard: 0, skipped: 0, artworkNames: [] }

    for (const texture of document.getRoot().listTextures()) {
      const image = texture.getImage()
      if (!image || !DECODABLE.has(texture.getMimeType())) {
        result.skipped++
        continue
      }

      const artwork = await isArtworkTexture(texture)
      const maxSize = artwork ? options.artworkMaxSize : options.maxSize
      const quality = artwork ? options.artworkQuality : options.quality

      try {
        const encoded = await sharp(image)
          .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
          .webp({
            quality,
            // Alpha is the decal's shape. Compressing it is what turns a crisp
            // cutout into a fringed one, and it is cheap to keep.
            alphaQuality: artwork ? 100 : 90,
            // libwebp's "Sharp YUV". Costs no size and directly targets the
            // 4:2:0 chroma bleed that damages saturated edges.
            smartSubsample: true,
            effort: 6,
          })
          .toBuffer()

        texture.setImage(new Uint8Array(encoded)).setMimeType('image/webp')
        const uri = texture.getURI()
        if (uri) texture.setURI(uri.replace(/\.[a-z0-9]+$/i, '.webp'))

        if (artwork) {
          result.artwork++
          result.artworkNames.push(texture.getName() || texture.getURI() || `#${result.artwork}`)
        } else {
          result.standard++
        }
      } catch {
        // A texture that will not decode is left exactly as it was, rather than
        // dropped — a missing logo is worse than an unoptimised one.
        result.skipped++
      }
    }

    options.onResult?.(result)
    document
      .getLogger()
      .debug(
        `compressTexturesForArtwork: ${result.artwork} artwork, ${result.standard} standard, ${result.skipped} skipped.`,
      )
  })
}
