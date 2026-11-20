/**
 * The 360° films of the soccer balls (owner, 2026-11-20: "want them on the website as well,
 * including the videos"; each ball's film plays on its own 3D page, under the facts).
 *
 * ⚠️ THE FILES LIVE ON media.wear-run.com, NOT IN THE VIEWER'S OWN FILES, BECAUSE OF SAFARI.
 * Safari plays a <video> only from a server that answers a byte-range request with
 * `206 Partial Content`. Workers Static Assets answer `Range` with `200` and the whole file
 * (Cloudflare, "Static Assets — Billing and limitations", read 2026-11-20) — the reason the
 * CMS carries its own range code for the /products film (`apps/cms/filmRange.mjs`). The media
 * host is an R2 custom domain behind Cloudflare's cache, which slices ranges itself: measured
 * the same day, `Range: bytes=0-1023` on the live Kaizen model answered `206`,
 * `content-range: bytes 0-1023/7937124`, `cf-cache-status: HIT`. The viewer's CSP names the
 * host in `media-src` (apps/viewer/scripts/csp.mjs).
 *
 * ⚠️ ENCODED FROM THE DESIGNER'S MASTERS, NEVER FROM THE "SHARING" COPIES. The Sharing MP4s are
 * H.264 High 4:4:4 Predictive at level 5.2 and 84-163 Mbit/s (ffprobe, 2026-11-20): 100-194 MB
 * for ten seconds, in a profile Chromium rated only "maybe". Each film below is 1080x1080, 60 fps,
 * 4:2:0, BT.709-tagged, `+faststart`, in two encodings (the recipe of scripts/build-products-film.mjs):
 * AV1 (SVT-AV1 preset 4, CRF 48) for browsers that decode it, H.264 (x264 veryslow, CRF 29, High
 * profile level 4.2) for the rest. CRF 29 is the owner's choice (2026-11-20) over a 1.7 MB CRF 32
 * that measured SSIM 0.958 against the Master — below the 0.97 bar. The SSIM in each entry was
 * measured against a lossless 1080x1080 decode of the Master, frames paired by index
 * (`setpts=N/60/TB` on both inputs: the two files' time bases differ, and paired by timestamp
 * the same film read 0.916 instead of 0.992).
 *
 * ⚠️ ONE COLOUR PER FILM. Each designer film shows a single colourway, so the page names it
 * (`colourSlug`) instead of pretending the film shows whichever colour the visitor picked.
 */

/** Where the films are served from. */
export const PRODUCT_FILM_ORIGIN = 'https://media.wear-run.com'

export type ProductFilm = {
  /** The colourway the film shows — a slug of that product's colourways. */
  readonly colourSlug: string
  /** File names on PRODUCT_FILM_ORIGIN, written by the encode and uploaded as they are. */
  readonly av1: string
  readonly h264: string
  readonly still: string
  /** Bytes per file as encoded, so a test can hold the upload to the encode. */
  readonly bytes: { readonly av1: number; readonly h264: number; readonly still: number }
  /** SSIM against the Master (see above), for the record; a re-encode re-measures. */
  readonly ssim: { readonly av1: number; readonly h264: number }
}

/**
 * The codec strings of the files themselves (ffprobe, 2026-11-20): AV1 Main profile,
 * seq_level_idx 8 (level 4.0), 8-bit; H.264 High profile (0x64), level 4.2 (0x2A).
 */
export const PRODUCT_FILM_TYPES = {
  av1: 'video/mp4; codecs="av01.0.08M.08"',
  h264: 'video/mp4; codecs="avc1.64002A"',
} as const

/** Every film is square, 1080 px. */
export const PRODUCT_FILM_SIZE = 1080

const film = (
  product: string,
  colourSlug: string,
  bytes: ProductFilm['bytes'],
  ssim: ProductFilm['ssim'],
): ProductFilm => ({
  colourSlug,
  av1: `${product}-360-av1.mp4`,
  h264: `${product}-360-h264.mp4`,
  still: `${product}-360-still.webp`,
  bytes,
  ssim,
})

/** Keyed by product slug. A product not listed here has no film. */
export const PRODUCT_FILMS: Readonly<Record<string, ProductFilm>> = {
  // Measured 2026-11-20. H.264 at CRF 29, except KURA and ORBX at CRF 27: at 29 they measured
  // 0.964 and 0.966, under the 0.97 bar, so they were re-encoded until they passed.
  kaizen: film(
    'kaizen',
    'orange',
    { av1: 1_930_398, h264: 2_327_811, still: 114_190 },
    { av1: 0.9895, h264: 0.9704 },
  ),
  maxfly: film(
    'maxfly',
    'red',
    { av1: 1_078_089, h264: 1_482_272, still: 64_260 },
    { av1: 0.9873, h264: 0.9749 },
  ),
  kura: film(
    'kura',
    'red-navy',
    { av1: 1_788_111, h264: 2_607_738, still: 94_804 },
    { av1: 0.9814, h264: 0.9711 },
  ),
  orbx: film(
    'orbx',
    'purple-cyan',
    { av1: 1_809_321, h264: 2_489_277, still: 79_264 },
    { av1: 0.9847, h264: 0.9717 },
  ),
}

export const productFilmFor = (productSlug: string): ProductFilm | undefined =>
  Object.hasOwn(PRODUCT_FILMS, productSlug) ? PRODUCT_FILMS[productSlug] : undefined

export const productFilmUrl = (file: string): string => `${PRODUCT_FILM_ORIGIN}/${file}`
