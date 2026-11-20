import { describe, expect, it } from 'vitest'
import {
  PRODUCT_FILM_ORIGIN,
  PRODUCT_FILM_TYPES,
  PRODUCT_FILMS,
  productFilmFor,
  productFilmUrl,
} from './productFilms'

/**
 * The film list is data typed by hand from an encode, so these hold it to what the encode
 * promised (2026-11-20): every number measured (none left at a placeholder zero), every film
 * passing the 0.97 SSIM bar it was re-encoded to pass, and every AV1 file inside the 2 MB target.
 */
describe('PRODUCT_FILMS', () => {
  const films = Object.entries(PRODUCT_FILMS)

  it('lists the four soccer balls', () => {
    expect(Object.keys(PRODUCT_FILMS).sort()).toEqual(['kaizen', 'kura', 'maxfly', 'orbx'])
  })

  it('carries a measured size for every file — a placeholder 0 fails', () => {
    for (const [slug, film] of films) {
      for (const [kind, bytes] of Object.entries(film.bytes)) {
        expect(bytes, `${slug} ${kind}`).toBeGreaterThan(10_000)
      }
    }
  })

  it('keeps every film at or above the 0.97 SSIM bar against its Master', () => {
    for (const [slug, film] of films) {
      expect(film.ssim.av1, `${slug} av1`).toBeGreaterThanOrEqual(0.97)
      expect(film.ssim.h264, `${slug} h264`).toBeGreaterThanOrEqual(0.97)
    }
  })

  it('keeps every AV1 film inside the 2 MB target (most visitors download this one)', () => {
    for (const [slug, film] of films) expect(film.bytes.av1, slug).toBeLessThanOrEqual(2_000_000)
  })

  it('names its files after the product, so an upload cannot cross two balls', () => {
    for (const [slug, film] of films) {
      for (const file of [film.av1, film.h264, film.still])
        expect(file.startsWith(`${slug}-360-`)).toBe(true)
    }
  })

  it('serves from the media host over https', () => {
    expect(productFilmUrl('kura-360-av1.mp4')).toBe('https://media.wear-run.com/kura-360-av1.mp4')
    expect(PRODUCT_FILM_ORIGIN.startsWith('https://')).toBe(true)
  })

  it('declares the codec strings the files carry (AV1 Main L4.0 8-bit; H.264 High L4.2)', () => {
    expect(PRODUCT_FILM_TYPES.av1).toBe('video/mp4; codecs="av01.0.08M.08"')
    expect(PRODUCT_FILM_TYPES.h264).toBe('video/mp4; codecs="avc1.64002A"')
  })

  it('has no film for a product it does not list, including an inherited key', () => {
    expect(productFilmFor('rxps')).toBeUndefined()
    expect(productFilmFor('toString')).toBeUndefined()
    expect(productFilmFor('kura')?.colourSlug).toBe('red-navy')
  })
})
