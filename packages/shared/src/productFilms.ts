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
 * ⚠️ THIS FILE SHIPS TO EVERY GARMENT PAGE, SO IT HOLDS ONLY WHAT THE PAGE READS. The encode's
 * measurements (bytes, SSIM, how each film was made) are in `productFilms.measured.ts`, which
 * only the tests import: they cost every visitor bytes under a viewer script budget that had
 * 0.2 KB of room in CI (2026-11-20, PR #435 went 704 B over with them in).
 *
 * ⚠️ ONE COLOUR PER FILM. Each designer film shows a single colourway, so the page names it
 * instead of pretending the film shows whichever colour the visitor picked.
 */

/** Where the films are served from. */
export const PRODUCT_FILM_ORIGIN = 'https://media.wear-run.com'

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

/**
 * Product slug → the colourway slug its film shows. A product not listed has no film.
 * Files are `<product>-360-av1.mp4`, `-h264.mp4` and `-still.webp` on PRODUCT_FILM_ORIGIN.
 */
export const PRODUCT_FILMS: Readonly<Record<string, string>> = {
  kaizen: 'orange',
  maxfly: 'red',
  kura: 'red-navy',
  orbx: 'purple-cyan',
}

export type ProductFilm = { colourSlug: string; av1: string; h264: string; still: string }

export function productFilmFor(productSlug: string): ProductFilm | undefined {
  if (!Object.hasOwn(PRODUCT_FILMS, productSlug)) return undefined
  const base = `${PRODUCT_FILM_ORIGIN}/${productSlug}-360-`
  return {
    colourSlug: PRODUCT_FILMS[productSlug] as string,
    av1: `${base}av1.mp4`,
    h264: `${base}h264.mp4`,
    still: `${base}still.webp`,
  }
}
