import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cropBox, SHAPES, SOURCES } from '../../../scripts/build-factory-photos.mjs'
import { CONTACT_HERO_SOURCES, HERO_SOURCES } from '../../../scripts/build-factory-photos.mjs'
import {
  CONTACT_HERO_PHOTO,
  contactHeroSrc,
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  HERO_PHOTO,
  HERO_SHAPES,
  heroPhotoSrc,
} from './lib/factoryPhotos'

/**
 * OI-3 — the home page's factory photos. What would have to break for these to fail: a file
 * the page asks for is missing or the wrong shape (a broken picture, or a stretched one), or the
 * script and the page drift apart (the next rebuild writes files the page does not name).
 *
 * Until 2026-10-02 a strip of all ten photos closed the home page, and two more checks here
 * held its grid: that no row had a hole at 2 columns and at 4, with a negative control. The
 * owner removed the strip (visual audit VA-29), so the order of the list lays nothing out any
 * more and those two went with it; the files, their sizes and the script's agreement stay.
 */

const DIR = join(import.meta.dirname, '../public/factory')

/**
 * Width and height from a WebP's own header — lossy (VP8), lossless (VP8L) or extended (VP8X).
 * Through a DataView, not Buffer's read methods: this package types `Buffer` from the Workers
 * types, which do not declare them.
 */
function webpSize(file: Uint8Array): { width: number; height: number } {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const ascii = (start: number) => String.fromCharCode(...file.subarray(start, start + 4))
  const uint24 = (at: number) => view.getUint16(at, true) | (view.getUint8(at + 2) << 16)
  if (ascii(0) !== 'RIFF' || ascii(8) !== 'WEBP') throw new Error('not a WebP file')
  const chunk = ascii(12)
  if (chunk === 'VP8X') return { width: uint24(24) + 1, height: uint24(27) + 1 }
  if (chunk === 'VP8 ') {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  throw new Error(`unknown WebP chunk ${chunk}`)
}

describe('the factory photos (OI-3)', () => {
  it('every picture the page names exists, at both widths, at its tile shape', () => {
    const wrong: string[] = []
    for (const photo of FACTORY_PHOTOS) {
      for (const width of FACTORY_PHOTO_WIDTHS[photo.shape]) {
        const file = `${photo.slug}-${width}.webp`
        let size: { width: number; height: number }
        try {
          size = webpSize(readFileSync(join(DIR, file)))
        } catch (error) {
          wrong.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        const height = Math.round(width / FACTORY_PHOTO_ASPECT[photo.shape])
        if (size.width !== width || size.height !== height) {
          wrong.push(
            `${file} is ${size.width}x${size.height}, the page reserves ${width}x${height}`,
          )
        }
      }
    }
    expect(wrong, 'rebuild with scripts/build-factory-photos.mjs').toEqual([])
  })

  it('no picture sits in public/factory that the page does not show', () => {
    const named = new Set([
      ...FACTORY_PHOTOS.flatMap((photo) =>
        FACTORY_PHOTO_WIDTHS[photo.shape].map((width) => `${photo.slug}-${width}.webp`),
      ),
      ...HERO_SHAPES.flatMap((shape) =>
        HERO_PHOTO.widths[shape].map((width) =>
          heroPhotoSrc(shape, width).slice('/factory/'.length),
        ),
      ),
      ...HERO_SHAPES.flatMap((shape) =>
        CONTACT_HERO_PHOTO.widths[shape].map((width) =>
          contactHeroSrc(shape, width).slice('/factory/'.length),
        ),
      ),
      // The phone crops' AVIF twins, which both pages offer first (2026-09-29).
      ...HERO_PHOTO.widths.heroTall.flatMap((width) => [
        heroPhotoSrc('heroTall', width, 'avif').slice('/factory/'.length),
        contactHeroSrc('heroTall', width, 'avif').slice('/factory/'.length),
      ]),
    ])
    expect(readdirSync(DIR).filter((file) => !named.has(file))).toEqual([])
  })

  it('the build script and the page list the same pictures, shapes, sizes and order', () => {
    expect(SOURCES.map(({ slug, shape }) => ({ slug, shape }))).toEqual(
      FACTORY_PHOTOS.map(({ slug, shape }) => ({ slug, shape })),
    )
    for (const shape of ['wide', 'single'] as const) {
      expect(SHAPES[shape].widths).toEqual([...FACTORY_PHOTO_WIDTHS[shape]])
      expect(SHAPES[shape].aspect).toBe(FACTORY_PHOTO_ASPECT[shape])
    }
  })

  it('every picture has alt text and a caption, and they are not the same words', () => {
    for (const photo of FACTORY_PHOTOS) {
      expect(photo.alt.length, photo.slug).toBeGreaterThan(20)
      expect(photo.caption.length, photo.slug).toBeGreaterThan(3)
      expect(photo.alt.toLowerCase()).not.toContain(photo.caption.toLowerCase())
    }
  })

  /*
   * The home hero (owner, 2026-09-29: "Factory photo"). Two crops of the stitching floor —
   * 16:9 for wide screens, 4:5 for phones — so a phone never downloads a panorama to show
   * its middle third.
   */
  it('every hero file the page names exists at its declared size', () => {
    const wrong: string[] = []
    for (const shape of HERO_SHAPES) {
      for (const width of HERO_PHOTO.widths[shape]) {
        const file = heroPhotoSrc(shape, width).slice('/factory/'.length)
        let size: { width: number; height: number }
        try {
          size = webpSize(readFileSync(join(DIR, file)))
        } catch (error) {
          wrong.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        const height = Math.round(width / HERO_PHOTO.aspect[shape])
        if (size.width !== width || size.height !== height) {
          wrong.push(
            `${file} is ${size.width}x${size.height}, the page reserves ${width}x${height}`,
          )
        }
      }
    }
    expect(wrong, 'rebuild with scripts/build-factory-photos.mjs').toEqual([])
  })

  it('the build script writes the hero at the widths and ratios the page declares', () => {
    for (const shape of HERO_SHAPES) {
      const source = HERO_SOURCES.find((entry) => entry.shape === shape)
      expect(source, shape).toBeDefined()
      expect(SHAPES[shape].widths).toEqual([...HERO_PHOTO.widths[shape]])
      expect(SHAPES[shape].aspect).toBe(HERO_PHOTO.aspect[shape])
    }
  })

  /*
   * The hero is the first thing every visitor downloads (Largest Contentful Paint). 180 KB is
   * the budget for the 1280 and phone files; measured sizes are in the commit that built them.
   */
  it('the hero files a first visit downloads stay small', () => {
    for (const file of ['hero-wide-1280.webp', 'hero-tall-640.webp', 'hero-tall-1080.webp']) {
      expect(readFileSync(join(DIR, file)).byteLength, file).toBeLessThanOrEqual(180 * 1024)
    }
  })

  /*
   * The contact hero (owner, 2026-09-29: "the image in contact page must also be in the
   * background of hero section, similar to home page"). The showroom original is 2000x1400, so
   * the wide crop stops at 1920: a 2560 file would be an upscale, bytes with no detail in them.
   */
  it('every contact hero file the page names exists at its declared size', () => {
    const wrong: string[] = []
    for (const shape of HERO_SHAPES) {
      for (const width of CONTACT_HERO_PHOTO.widths[shape]) {
        const file = contactHeroSrc(shape, width).slice('/factory/'.length)
        let size: { width: number; height: number }
        try {
          size = webpSize(readFileSync(join(DIR, file)))
        } catch (error) {
          wrong.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        const height = Math.round(width / HERO_PHOTO.aspect[shape])
        if (size.width !== width || size.height !== height) {
          wrong.push(
            `${file} is ${size.width}x${size.height}, the page reserves ${width}x${height}`,
          )
        }
      }
    }
    expect(wrong, 'rebuild with scripts/build-factory-photos.mjs').toEqual([])
  })

  it('the build script writes the contact hero at the widths the page declares, never upscaled', () => {
    for (const shape of HERO_SHAPES) {
      const source = CONTACT_HERO_SOURCES.find((entry) => entry.shape === shape)
      expect(source, shape).toBeDefined()
      expect(source?.widths).toEqual([...CONTACT_HERO_PHOTO.widths[shape]])
      expect(Math.max(...CONTACT_HERO_PHOTO.widths[shape])).toBeLessThanOrEqual(2000)
    }
  })

  it('the contact hero files a first visit downloads stay small', () => {
    for (const file of [
      'contact-hero-wide-1280.webp',
      'contact-hero-tall-640.webp',
      'contact-hero-tall-1080.webp',
    ]) {
      expect(readFileSync(join(DIR, file)).byteLength, file).toBeLessThanOrEqual(180 * 1024)
    }
  })

  it('the crop stays inside the picture, centred on the focus where it can be', () => {
    // A 2:1 panorama cut to 8:5 around its centre loses equal width from both sides.
    expect(cropBox(2000, 1000, 8 / 5, [0.5, 0.5])).toEqual({
      left: 200,
      top: 0,
      width: 1600,
      height: 1000,
    })
    // A focus at the very edge slides the box back inside rather than past it.
    expect(cropBox(1000, 2000, 4 / 5, [0.5, 1])).toEqual({
      left: 0,
      top: 750,
      width: 1000,
      height: 1250,
    })
  })
})

/*
 * ⚠️ AN AVIF TWIN FOR EVERY PHONE HERO (2026-09-29). The hero photo is the largest paint on a
 * phone for both the home and the contact page. Measured: the AVIF crops are 36–43% lighter than
 * the WebP (hero-tall-1080 72.6 → 46.4 KB, contact-hero-tall-1080 51.0 → 30.1 KB) and look the
 * same behind the ink wash, and Lighthouse (mobile) gained 0.01 on each page. Phones are offered
 * the AVIF first; any browser without AVIF takes the WebP source after it.
 */
describe('phone heroes come in AVIF too', () => {
  const TALL = [...HERO_PHOTO.widths.heroTall]
  it('every tall hero crop has an AVIF twin, lighter than its WebP', () => {
    for (const w of TALL) {
      for (const [avif, webp] of [
        [heroPhotoSrc('heroTall', w, 'avif'), heroPhotoSrc('heroTall', w)],
        [contactHeroSrc('heroTall', w, 'avif'), contactHeroSrc('heroTall', w)],
      ]) {
        const a = join(DIR, (avif ?? '').slice('/factory/'.length))
        const b = join(DIR, (webp ?? '').slice('/factory/'.length))
        expect(existsSync(a), `${a} is missing`).toBe(true)
        expect(readFileSync(a).length).toBeLessThan(readFileSync(b).length)
        expect(String.fromCharCode(...readFileSync(a).subarray(4, 12))).toBe('ftypavif')
      }
    }
  })

  it('both pages offer phones the AVIF before the WebP', () => {
    for (const page of [
      'src/components/site/HomeHero.tsx',
      'src/app/(frontend)/contact/page.tsx',
    ]) {
      const tsx = readFileSync(join(import.meta.dirname, '..', page), 'utf8')
      const avif = tsx.indexOf('type="image/avif"')
      expect(avif, `${page} offers no AVIF source`).toBeGreaterThan(-1)
      expect(avif, `${page} offers the WebP first`).toBeLessThan(
        tsx.indexOf("'heroTall', tall640)"),
      )
    }
  })
})
