/**
 * The /products hero film (owner, 2026-10-01: the hoodie film plays behind the hero's headline,
 * filling the hero the way the factory photo fills the home page's, under the same dark wash; no
 * caption; no pause button since polish D5, 2026-10-04, by the owner's choice: ProductsFilm.tsx).
 *
 * The files are written by `scripts/build-products-film.mjs` from the owner's original and served
 * from `apps/cms/public/film/`; `src/lib/productsFilm.test.ts` fails if one is missing or is not the
 * size declared here. They reach a browser through worker.mjs, in pieces (filmRange.mjs).
 *
 * ⚠️ THE FILM IS DECORATION, NOT CONTENT. It shows the same embroidered hoodie in a 4.5 s loop
 * behind the words; nothing in it is information, so the still has empty alt text and the video is
 * hidden from assistive technology. A visitor uses no part of it: the owner removed the pause button
 * (polish D5), keeping the reduced-motion and Data Saver stops below.
 */

export type FilmSource = { src: string; type: string }

/**
 * The two encodings, best first: a browser plays the first `type` it can decode. The codec strings
 * are the files' own (ffprobe, 2026-10-02): AV1 Main profile, level 3.1, 8-bit; H.264 High profile,
 * level 4.0.
 */
export const FILM_SOURCES: readonly FilmSource[] = [
  { src: '/film/tie-dye-hoodie-av1.mp4', type: 'video/mp4; codecs="av01.0.05M.08"' },
  { src: '/film/tie-dye-hoodie-h264.mp4', type: 'video/mp4; codecs="avc1.640028"' },
]

/** Bytes per file, as written on 2026-10-02 (the owner was shown these and chose the sharper H.264). */
export const FILM_FILE_BYTES: Readonly<Record<string, number>> = {
  'tie-dye-hoodie-av1.mp4': 310_115,
  'tie-dye-hoodie-h264.mp4': 899_427,
  'tie-dye-hoodie-540.avif': 15_328,
  'tie-dye-hoodie-540.webp': 25_886,
  'tie-dye-hoodie-720.avif': 20_607,
  'tie-dye-hoodie-720.webp': 36_440,
}

/** The film's frame, and the widths its still is written at. */
export const FILM_FRAME = { width: 720, height: 1280 } as const
export const FILM_STILL_WIDTHS = [540, 720] as const

export const filmStillSrc = (width: number, format: 'avif' | 'webp') =>
  `/film/tie-dye-hoodie-${width}.${format}`

export const filmStillSrcSet = (format: 'avif' | 'webp') =>
  FILM_STILL_WIDTHS.map((width) => `${filmStillSrc(width, format)} ${width}w`).join(', ')

/** What the page knows about the visitor when it decides whether the film may start by itself. */
export type FilmVisit = {
  reducedMotion: boolean
  saveData: boolean
  /** `navigator.connection.effectiveType`, where the browser reports one. */
  effectiveType?: string
  /** `navigator.webdriver`: a test that wants the film lifts it, as for the site's other pieces. */
  webdriver: boolean
}

/**
 * May the film start by itself? Never under reduced motion (the owner's hard stop), on Data Saver
 * (the 3D garment pages' own rule, `canRender3D()` in apps/viewer/src/lib/capabilities.ts), on a
 * connection the browser reports as 2G (the plan's "a slow connection"), or under automation. In
 * each of those cases the still shows, and stays.
 */
export function filmMayAutoplay(visit: FilmVisit): boolean {
  if (visit.reducedMotion || visit.saveData || visit.webdriver) return false
  return visit.effectiveType !== 'slow-2g' && visit.effectiveType !== '2g'
}
