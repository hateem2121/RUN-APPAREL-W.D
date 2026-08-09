import type { Document, Texture, Transform } from '@gltf-transform/core'
import { createTransform, listTextureSlots } from '@gltf-transform/functions'
import sharp from 'sharp'
import { ARTWORK_ASPECT_RATIO, CRUSHED_BYTES_PER_PIXEL, profileAlpha } from './textures'

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
  /**
   * Artwork textures that had to be resampled smaller to fit the cap. Reported,
   * not blocked: it is a real loss of stroke detail on a wordmark, and also a
   * legitimate trade the owner should get to see rather than discover.
   */
  artworkResized: string[]
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
// A normal or ORM map is data. Encoding it at quality 95 wastes bytes and
// protects nothing, and its name may well contain "print" by coincidence.
function isDataTexture(texture: Texture): boolean {
  const slots = listTextureSlots(texture)
  return slots.length > 0 && slots.every((slot) => DATA_SLOT.test(slot))
}

/**
 * The SYNCHRONOUS half of `isArtworkTexture` — name and URI only, no decode.
 *
 * Split out for the decimation pass, which walks every primitive synchronously.
 * A real CLO export here has 200 materials; awaiting a sharp metadata read per
 * texture inside that loop is not worth it when the name signal alone already
 * catches what this file's own export contains (`RUN LOGO_3183`,
 * `Teamwear Logo_3139`).
 *
 * Weaker than the async version on purpose: it misses an unnamed wordmark that
 * only the aspect-ratio or binary-alpha signal would find. Callers that can
 * afford to await should use `isArtworkTexture`.
 */
export function isArtworkTextureByName(texture: Texture): boolean {
  if (isDataTexture(texture)) return false
  return ARTWORK_NAME.test(`${texture.getName()} ${texture.getURI()}`)
}

export interface CrushedArtwork {
  index: number
  name: string
  width: number
  height: number
  bytes: number
  bytesPerPixel: number
}

/**
 * Artwork textures stored below `CRUSHED_BYTES_PER_PIXEL`.
 *
 * WHY THIS EXISTS AS A SEPARATE FUNCTION. The threshold and a check using it
 * have been in `textures.ts` since the artwork investigation, but only inside
 * `inventoryTextures`, which runs from the manual `textures` command. The
 * automated path — the one that processes every real garment — calls
 * `inspectGlb`, which never looked at it. So the single cheapest measurement of
 * the reported damage existed, was correct, and was not connected to anything:
 * N001's live file has a 2048x2048 colour map at 0.003 bpp, 6.6x past the line.
 *
 * Narrower than the `inventoryTextures` version, which flags any baseColor or
 * emissive map. Fabric is allowed to encode cheaply; a wordmark is not. Scoping
 * it to artwork is what keeps this usable as a signal instead of noise.
 *
 * Still only a WARNING. A genuinely flat artwork texture — a solid-colour label —
 * also encodes tiny, and a gate the owner learns to override is worse than no
 * gate. The blocking signal is `artworkAtRisk` in simplify-textured.ts, which is
 * structural and cannot false-positive.
 */
export async function findCrushedArtwork(document: Document): Promise<CrushedArtwork[]> {
  const crushed: CrushedArtwork[] = []
  for (const [index, texture] of document.getRoot().listTextures().entries()) {
    const image = texture.getImage()
    if (!image) continue
    let width: number | undefined
    let height: number | undefined
    try {
      // Header only — sharp does not decode pixels for `metadata()`.
      ;({ width, height } = await sharp(image).metadata())
    } catch {
      continue // KTX2 and other GPU formats: not measurable this way, not our call.
    }
    if (!width || !height) continue
    const bytesPerPixel = image.byteLength / (width * height)
    // CHEAP TEST FIRST. `isArtworkTexture` falls through to `profileAlpha`,
    // which decodes every pixel; bytes-per-pixel needs only the header. Almost
    // no texture is below the threshold, so ordering it this way means the
    // pixel decode runs a handful of times per file rather than once per
    // texture — same result, and it keeps this affordable on the 22-texture
    // real garment. Measured on output/n001.glb: 0.21 ms/call for the whole
    // function, against 0.90 ms for `inspectGlb` end to end.
    if (bytesPerPixel >= CRUSHED_BYTES_PER_PIXEL) continue
    if (!(await isArtworkTexture(texture))) continue
    crushed.push({
      index,
      name: texture.getName() || texture.getURI() || `#${index}`,
      width,
      height,
      bytes: image.byteLength,
      bytesPerPixel: Math.round(bytesPerPixel * 10000) / 10000,
    })
  }
  return crushed
}

export interface ArtworkAlphaProblem {
  material: string
  /** `blend` = renders see-through; `cutoff` = a MASK whose threshold drifted. */
  problem: 'blend' | 'cutoff'
}

/** The value `solidifyMaterials` resolves every hard cutout to. */
const EXPECTED_ALPHA_CUTOFF = 0.5

/**
 * Artwork materials whose alpha ended up wrong.
 *
 * <model-viewer> has no order-independent transparency, so a BLEND material
 * renders see-through and depth-sorts badly — literally the "half visible, half
 * not" in the original report. `solidifyMaterials` resolves hard cutouts to MASK
 * with alphaCutoff 0.5 (H3 in docs/OPEN-ISSUE-ARTWORK.md), but nothing checked
 * the OUTPUT, so a decal that slipped through as BLEND — or a MASK whose cutoff
 * drifted — shipped in silence.
 *
 * Scoped to artwork deliberately. A sheer mesh panel is *supposed* to be BLEND;
 * flagging every translucent material would make this noise, and the existing
 * `translucentMaterialCount` already reports that broader number.
 */
export async function findArtworkAlphaProblems(document: Document): Promise<ArtworkAlphaProblem[]> {
  const problems: ArtworkAlphaProblem[] = []
  for (const material of document.getRoot().listMaterials()) {
    let carriesArtwork = false
    for (const texture of [material.getBaseColorTexture(), material.getEmissiveTexture()]) {
      if (texture && (await isArtworkTexture(texture))) {
        carriesArtwork = true
        break
      }
    }
    if (!carriesArtwork) continue
    const name = material.getName() || '(unnamed material)'
    const mode = material.getAlphaMode()
    if (mode === 'BLEND') {
      problems.push({ material: name, problem: 'blend' })
    } else if (mode === 'MASK' && material.getAlphaCutoff() !== EXPECTED_ALPHA_CUTOFF) {
      problems.push({ material: name, problem: 'cutoff' })
    }
  }
  return problems
}

export async function isArtworkTexture(texture: Texture): Promise<boolean> {
  if (isDataTexture(texture)) return false
  if (isArtworkTextureByName(texture)) return true

  const image = texture.getImage()
  if (!image) return false

  try {
    const { width, height } = await sharp(image).metadata()
    // Wordmarks and printed bands are long thin strips; fabric maps are square.
    // The real file had 853x142 and 1944x121 textures — 6:1 and 16:1.
    if (
      width &&
      height &&
      Math.max(width, height) / Math.min(width, height) >= ARTWORK_ASPECT_RATIO
    ) {
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
  return createTransform(
    'compressTexturesForArtwork',
    async (document: Document): Promise<void> => {
      const result: TextureArtworkResult = {
        artwork: 0,
        standard: 0,
        skipped: 0,
        artworkNames: [],
        artworkResized: [],
      }

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
          // Measured only for artwork, and only to report it: a wordmark that had
          // to be resampled has lost stroke detail, and that should be a sentence
          // in the owner's report rather than something that just happens. Fabric
          // resizing is routine and reporting it would be noise.
          const before = artwork ? await sharp(image).metadata() : null

          const { data: encoded, info } = await sharp(image)
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
            .toBuffer({ resolveWithObject: true })

          if (
            before?.width &&
            before.height &&
            (info.width < before.width || info.height < before.height)
          ) {
            result.artworkResized.push(
              texture.getName() || texture.getURI() || `#${result.artwork + 1}`,
            )
          }

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
    },
  )
}
