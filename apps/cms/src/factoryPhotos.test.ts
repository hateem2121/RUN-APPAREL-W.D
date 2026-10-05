import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { cropBox, SHAPES, SOURCES } from '../../../scripts/build-factory-photos.mjs'
import { CONTACT_HERO_SOURCES, HERO_SOURCES } from '../../../scripts/build-factory-photos.mjs'
import { AboutSection } from './components/site/AboutSection'
import { OrderSteps } from './components/site/OrderSteps'
import {
  CONTACT_HERO_PHOTO,
  contactHeroSrc,
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  factoryPhotoWidths,
  HERO_PHOTO,
  HERO_SHAPES,
  heroPhotoSrc,
} from './lib/factoryPhotos'
import { hintAt, pickedWidth } from './sizesAt'

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
  it('every picture the page names exists, at each of its widths, at its tile shape', () => {
    const wrong: string[] = []
    for (const photo of FACTORY_PHOTOS) {
      for (const width of factoryPhotoWidths(photo)) {
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
        factoryPhotoWidths(photo).map((width) => `${photo.slug}-${width}.webp`),
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
    // A photo whose original is too narrow for its shape's widest file lists its own (polish X16).
    expect(SOURCES.map((source) => source.widths ?? SHAPES[source.shape].widths)).toEqual(
      FACTORY_PHOTOS.map((photo) => [...factoryPhotoWidths(photo)]),
    )
  })

  /*
   * ⚠️ NEVER AN UPSCALE (polish X16, 2026-10-05): a file wider than the original's crop is more
   * bytes with no more detail in it. Each source records its original's size, measured on the
   * owner's files; the script refuses to run when an original no longer has that size, so the
   * record cannot drift from the file it describes.
   */
  it('writes no file wider than its original holds, at the crop the page shows', () => {
    const tooWide = (
      sources: readonly {
        slug: string
        shape: keyof typeof SHAPES
        focus: [number, number]
        original: [number, number]
        widths?: number[]
      }[],
    ) =>
      sources.flatMap((source) => {
        const shape = SHAPES[source.shape]
        const box = cropBox(...source.original, shape.aspect, source.focus)
        return (source.widths ?? shape.widths)
          .filter((width) => width > box.width)
          .map((width) => `${source.slug}-${width}: the original's crop is ${box.width}px wide`)
      })
    expect(tooWide([...SOURCES, ...HERO_SOURCES, ...CONTACT_HERO_SOURCES])).toEqual([])
    // NEGATIVE CONTROL: the tagging floor's 1,280px original cannot give the wide shape's 1,600.
    const tagging = SOURCES.find((source) => source.slug === 'tagging')
    expect(tagging?.original).toEqual([1280, 896])
    expect(tooWide(tagging ? [{ ...tagging, widths: [640, 1200, 1600] }] : [])).toEqual([
      "tagging-1600: the original's crop is 1280px wide",
    ])
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
 * ⚠️ A SHARP SCREEN GETS A FILE AS WIDE AS THE PICTURE ASKS (polish X16, 2026-10-05). The audit of
 * 3 October measured the home step photos 1.4 times stretched on sharp laptop screens; since polish
 * D4 the steps are cards up to 704 px wide, and the 4:5 files stopped at 800 px, so a 2x screen at
 * 1,920 px stretched them 1.76 times (1,408 px asked, 800 given). A bigger file may only come from a
 * bigger original: two originals are narrower than their shape's largest file (`ORIGINAL_LIMITS`),
 * and those two photos are the only ones still short, each by what its original lacks.
 *
 * The check reads the page's own markup (№01 and №04, as the server sends them) and picks a file
 * the way both engines do: the smallest whose density reaches the screen's, else the largest
 * (Chromium `SelectionLogic` with `SrcsetSelectionMatchesImageSet` stable, WebKit
 * `pickBestImageCandidate`; both read 2026-10-05). The hint (`sizes`) is what the browser goes by,
 * and the browser suites hold every hint to the width really drawn (`e2e/orderTimeline.spec.ts`,
 * `e2e/homePicture.spec.ts`). What would have to break: a width removed, a hint that grew past
 * the files, or a new place that draws a photo larger than its files.
 */
describe('a sharp screen gets a file as wide as the picture asks (X16)', () => {
  /** Phones at 2x and 3x, tablets and computers at 2x: the widths a 1x screen asks are all covered. */
  const SCREENS: readonly (readonly [width: number, density: number])[] = [
    ...[360, 375, 390, 393, 412, 430].flatMap((width) => [
      [width, 2] as const,
      [width, 3] as const,
    ]),
    ...[744, 768, 820, 834, 1024, 1180, 1280, 1366, 1440, 1512, 1728, 1920, 2560].map(
      (width) => [width, 2] as const,
    ),
  ]

  /** The photo files narrower than their shape asks, because the original is: slug → its widest. */
  const ORIGINAL_LIMITS = { tagging: 1200, packing: 1200 }

  type Picture = { slug: string; srcset: string; sizes: string }

  /** Every picture a screen is handed fewer pixels than its hint asks for. */
  function shortfalls(pictures: readonly Picture[]) {
    const misses: { slug: string; screen: string; asks: number; gets: number }[] = []
    for (const picture of pictures) {
      for (const [width, density] of SCREENS) {
        const hint = hintAt(picture.sizes, width)
        const gets = pickedWidth(picture.srcset, hint, density)
        const asks = hint * density
        if (gets < asks - 0.5) {
          misses.push({ slug: picture.slug, screen: `${width}@${density}x`, asks, gets })
        }
      }
    }
    return misses
  }

  const imgTags = (html: string) => [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&') ?? ''
  const pictures: Picture[] = [
    ...imgTags(renderToStaticMarkup(createElement(AboutSection))),
    ...imgTags(renderToStaticMarkup(createElement(OrderSteps))),
  ].map((tag) => ({
    slug: attr(tag, 'src').match(/^\/factory\/(.+)-\d+\.webp$/)?.[1] ?? attr(tag, 'src'),
    srcset: attr(tag, 'srcSet'),
    sizes: attr(tag, 'sizes'),
  }))

  it('reads all ten photos off the page, each with its widths and its hint', () => {
    expect(pictures.map((picture) => picture.slug).sort()).toEqual(
      FACTORY_PHOTOS.map((photo) => photo.slug).sort(),
    )
    for (const picture of pictures) {
      expect(picture.srcset, picture.slug).toMatch(/ \d+w$/)
      expect(picture.sizes, picture.slug).not.toBe('')
    }
  })

  it('leaves only the two photos whose originals hold no more, each at its widest file', () => {
    const misses = shortfalls(pictures)
    const said = misses.map(
      (miss) => `${miss.slug} at ${miss.screen}: asks ${miss.asks}, gets ${miss.gets}`,
    )
    expect([...new Set(misses.map((miss) => miss.slug))].sort(), said.join('\n')).toEqual(
      Object.keys(ORIGINAL_LIMITS).sort(),
    )
    for (const miss of misses) {
      expect(miss.gets, said.join('\n')).toBe(
        ORIGINAL_LIMITS[miss.slug as keyof typeof ORIGINAL_LIMITS],
      )
    }
  })

  // NEGATIVE CONTROL, both ways: the files №04 offered until X16 are short on a 2x computer, and
  // the widths a tall photo is offered now are not.
  it('sees a photo stretched on a sharp screen, and none when the widths reach', () => {
    const sizes = pictures.find((picture) => picture.slug === 'inspection')?.sizes ?? ''
    const before = shortfalls([
      { slug: 'before', srcset: 'a-400.webp 400w, a-800.webp 800w', sizes },
    ])
    expect(before.map((miss) => miss.screen)).toContain('1920@2x')
    expect(
      shortfalls([
        {
          slug: 'after',
          srcset: 'a-400.webp 400w, a-800.webp 800w, a-1200.webp 1200w, a-1536.webp 1536w',
          sizes,
        },
      ]),
    ).toEqual([])
  })

  it('reads the forms of hint the site writes, and refuses one it cannot', () => {
    expect(hintAt('(max-width: 899px) calc(90vw + 2px), 704px', 834)).toBeCloseTo(752.6, 5)
    expect(hintAt('(max-width: 899px) calc(90vw + 2px), 704px', 1920)).toBe(704)
    expect(hintAt('(max-width: 399px) calc(100vw - 40px), 50vw', 390)).toBe(350)
    expect(() => hintAt('min(50vw, 400px)', 390)).toThrow(/cannot read/)
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
