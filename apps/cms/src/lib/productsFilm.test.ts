import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FILM_FILE_BYTES,
  FILM_FRAME,
  FILM_SOURCES,
  FILM_STILL_WIDTHS,
  filmMayAutoplay,
  filmStillSrc,
  filmStillSrcSet,
} from './productsFilm'

const PUBLIC = join(import.meta.dirname, '..', '..', 'public')

describe('the /products film files', () => {
  it('every file the page names exists, at the size it was written', () => {
    const named = [
      ...FILM_SOURCES.map((source) => source.src),
      ...FILM_STILL_WIDTHS.flatMap((width) => [
        filmStillSrc(width, 'avif'),
        filmStillSrc(width, 'webp'),
      ]),
    ]
    expect(named.map((src) => src.replace('/film/', '')).sort()).toEqual(
      Object.keys(FILM_FILE_BYTES).sort(),
    )
    for (const src of named) {
      const name = src.replace('/film/', '')
      expect(statSync(join(PUBLIC, src)).size, name).toBe(FILM_FILE_BYTES[name])
    }
  })

  it('each video starts with its index, so playback begins before the download ends', () => {
    // "Fast start": the `moov` box comes before the `mdat` media data. The original film had its
    // index at the end, so a browser had to fetch the end before it could show a frame.
    for (const { src } of FILM_SOURCES) {
      const bytes = readFileSync(join(PUBLIC, src), 'latin1')
      expect(bytes.indexOf('moov'), src).toBeGreaterThan(-1)
      expect(bytes.indexOf('moov'), `${src} keeps its index after the media`).toBeLessThan(
        bytes.indexOf('mdat'),
      )
    }
  })

  it('stays light: under 1 MB per video and under 40 KB per still', () => {
    for (const [name, bytes] of Object.entries(FILM_FILE_BYTES)) {
      expect(bytes, name).toBeLessThan(name.endsWith('.mp4') ? 1_000_000 : 40_000)
    }
  })

  it('offers AV1 first and H.264 after it, each with its codec string', () => {
    expect(FILM_SOURCES.map((source) => source.type)).toEqual([
      'video/mp4; codecs="av01.0.05M.08"',
      'video/mp4; codecs="avc1.640028"',
    ])
  })

  it('names the still at both widths, largest last, for a portrait frame', () => {
    expect(filmStillSrcSet('avif')).toBe(
      '/film/tie-dye-hoodie-540.avif 540w, /film/tie-dye-hoodie-720.avif 720w',
    )
    expect(FILM_FRAME.height / FILM_FRAME.width).toBeCloseTo(16 / 9, 5)
  })
})

describe('filmMayAutoplay', () => {
  const ordinary = { reducedMotion: false, saveData: false, effectiveType: '4g', webdriver: false }

  it('plays for an ordinary visit', () => {
    expect(filmMayAutoplay(ordinary)).toBe(true)
    expect(filmMayAutoplay({ ...ordinary, effectiveType: undefined })).toBe(true)
  })

  it('never starts by itself under reduced motion, Data Saver, 2G or automation', () => {
    expect(filmMayAutoplay({ ...ordinary, reducedMotion: true })).toBe(false)
    expect(filmMayAutoplay({ ...ordinary, saveData: true })).toBe(false)
    expect(filmMayAutoplay({ ...ordinary, effectiveType: '2g' })).toBe(false)
    expect(filmMayAutoplay({ ...ordinary, effectiveType: 'slow-2g' })).toBe(false)
    expect(filmMayAutoplay({ ...ordinary, webdriver: true })).toBe(false)
  })

  it('a 3G connection still plays: the film is 0.3–0.9 MB', () => {
    expect(filmMayAutoplay({ ...ordinary, effectiveType: '3g' })).toBe(true)
  })
})
