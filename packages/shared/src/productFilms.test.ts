import { describe, expect, it } from 'vitest'
import {
  PRODUCT_FILM_ORIGIN,
  PRODUCT_FILM_TYPES,
  PRODUCT_FILMS,
  productFilmFor,
} from './productFilms'
import { PRODUCT_FILM_MEASUREMENTS } from './productFilms.measured'

/**
 * The film list and its measurements are typed by hand from an encode, so these hold them to what
 * the encode promised (2026-11-20): every film measured (none left at a placeholder), every film
 * passing the 0.97 SSIM bar it was re-encoded to pass, and every AV1 file inside the 2 MB target.
 */
describe('PRODUCT_FILMS', () => {
  const measured = Object.entries(PRODUCT_FILM_MEASUREMENTS)

  it('lists the four soccer balls, and measures exactly those', () => {
    expect(Object.keys(PRODUCT_FILMS).sort()).toEqual(['kaizen', 'kura', 'maxfly', 'orbx'])
    expect(Object.keys(PRODUCT_FILM_MEASUREMENTS).sort()).toEqual(Object.keys(PRODUCT_FILMS).sort())
  })

  it('carries a measured size for every file — a placeholder fails', () => {
    for (const [slug, film] of measured) {
      for (const [kind, bytes] of Object.entries(film.bytes))
        expect(bytes, `${slug} ${kind}`).toBeGreaterThan(10_000)
    }
  })

  it('keeps every film at or above the 0.97 SSIM bar against its Master', () => {
    for (const [slug, film] of measured) {
      expect(film.ssim.av1, `${slug} av1`).toBeGreaterThanOrEqual(0.97)
      expect(film.ssim.h264, `${slug} h264`).toBeGreaterThanOrEqual(0.97)
    }
  })

  it('keeps every AV1 film inside the 2 MB target (most visitors download this one)', () => {
    for (const [slug, film] of measured) expect(film.bytes.av1, slug).toBeLessThanOrEqual(2_000_000)
  })

  it('names each file after its product on the media host, over https', () => {
    expect(productFilmFor('kura')).toEqual({
      colourSlug: 'red-navy',
      av1: 'https://media.wear-run.com/kura-360-av1.mp4',
      h264: 'https://media.wear-run.com/kura-360-h264.mp4',
      still: 'https://media.wear-run.com/kura-360-still.webp',
    })
    expect(PRODUCT_FILM_ORIGIN.startsWith('https://')).toBe(true)
  })

  it('declares the codec strings the files carry (AV1 Main L4.0 8-bit; H.264 High L4.2)', () => {
    expect(PRODUCT_FILM_TYPES.av1).toBe('video/mp4; codecs="av01.0.08M.08"')
    expect(PRODUCT_FILM_TYPES.h264).toBe('video/mp4; codecs="avc1.64002A"')
  })

  it('has no film for a product it does not list, including an inherited key', () => {
    expect(productFilmFor('rxps')).toBeUndefined()
    expect(productFilmFor('toString')).toBeUndefined()
  })
})
