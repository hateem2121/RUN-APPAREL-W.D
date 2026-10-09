#!/usr/bin/env node
/**
 * Builds the home page's factory photos (OI-3) from the owner's originals: the building and its
 * roof in №01, one photo per step of "How an order works" in №04. (The "Inside the factory" strip
 * they were first made for was removed on 2026-10-02, owner's choice, visual audit VA-29/VA-34.)
 *
 * ⚠️ THE ORIGINALS NEVER ENTER THE REPOSITORY. They live in the owner's own folder on their
 * Mac (1,280–4,875 px wide, up to 8.7 MB each, measured 2026-10-05; each source's `original`
 * below) and this repo is public; only the web-sized,
 * pre-cropped WebPs this writes are committed, under `apps/cms/public/factory/`.
 *
 * ⚠️ EACH PICTURE IS CROPPED TO ITS TILE HERE, NOT BY `object-fit` IN THE BROWSER. The
 * originals are 0.55:1 portraits and 2:1 panoramas; the tiles are 4:5 and 8:5. Letting CSS
 * crop would ship a 1280×2347 portrait to fill a 490×612 box — four times the bytes for
 * pixels nobody sees. `focus` is where the subject sits in the original, as fractions of its
 * width and height, chosen by looking at each picture (2026-09-25).
 *
 * Output carries no metadata: sharp drops EXIF/XMP unless asked to keep it, the same for
 * every picture, which is ordinary web optimisation.
 *
 * Usage:
 *   node scripts/build-factory-photos.mjs "<folder with the originals>"
 * The page's list, captions and alt text: apps/cms/src/lib/factoryPhotos.ts. Its unit test
 * fails if a file this should have written is missing or the wrong size.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

/**
 * Tile shapes, as width/height, and the widths written for each: the page's `FACTORY_PHOTO_WIDTHS`
 * says why these (polish X16 added 1,600 wide and 1,200 + 1,536 tall for sharp screens).
 */
export const SHAPES = {
  wide: { aspect: 8 / 5, widths: [640, 1200, 1600] },
  single: { aspect: 4 / 5, widths: [400, 800, 1200, 1536] },
  // The home page hero (owner, 2026-09-29): wide screens, and phones.
  heroWide: { aspect: 16 / 9, widths: [1280, 1920, 2560] },
  heroTall: { aspect: 4 / 5, widths: [640, 1080] },
}

/**
 * The hero's two crops of the stitching floor (a 4875x2403 original). The tall crop sits right
 * of centre, where the nearest operators are, so a phone shows people rather than crates.
 * Their files are `hero-wide-<w>.webp` / `hero-tall-<w>.webp` (`heroPhotoSrc` in the page's list).
 *
 * ⚠️ `original` IS THE ORIGINAL'S SIZE IN PIXELS, on every source here (measured 2026-10-05, polish
 * X16): no file may be wider than the original's crop (an upscale is bytes with no detail in them),
 * and `factoryPhotos.test.ts` checks every width against it without the originals, which never
 * enter this public repository. `main()` stops if an original no longer has the size recorded.
 */
export const HERO_SOURCES = [
  {
    slug: 'hero-wide',
    file: 'Apparel Stitching Department.png',
    original: [4875, 2403],
    shape: 'heroWide',
    focus: [0.55, 0.5],
  },
  {
    slug: 'hero-tall',
    file: 'Apparel Stitching Department.png',
    original: [4875, 2403],
    shape: 'heroTall',
    focus: [0.68, 0.55],
  },
]

/**
 * The contact hero's two crops of the showroom (a 2000x1400 original), in the home hero's
 * shapes but with `widths` of their own: nothing past the original's 2000px, so no upscale.
 * The tall crop sits right of centre, on the blue top and the logo on the wall.
 */
export const CONTACT_HERO_SOURCES = [
  {
    slug: 'contact-hero-wide',
    file: "RUN's Showroom.png",
    original: [2000, 1400],
    shape: 'heroWide',
    widths: [1280, 1920],
    // As high as the crop goes: any lower and the logo on the wall loses its top (looked at).
    focus: [0.5, 0.4],
  },
  {
    slug: 'contact-hero-tall',
    file: "RUN's Showroom.png",
    original: [2000, 1400],
    shape: 'heroTall',
    widths: [640, 1080],
    focus: [0.74, 0.5],
  },
]

/**
 * The /about hero's two crops of the building (the about-factory build, 2026-10-09; Appendix B:
 * the exterior is the PROPOSED hero, the owner picks at the picture check). The original is
 * 3555x2000, so the 16:9 crop is the whole frame and the widest file is no upscale; the 4:5 crop
 * is the 1600x2000 centre, for the compact card a phone shows.
 */
export const ABOUT_HERO_SOURCES = [
  {
    slug: 'about-hero-wide',
    file: 'factory exterior image.png',
    original: [3555, 2000],
    shape: 'heroWide',
    focus: [0.5, 0.5],
  },
  {
    slug: 'about-hero-tall',
    file: 'factory exterior image.png',
    original: [3555, 2000],
    shape: 'heroTall',
    focus: [0.5, 0.5],
  },
]

/*
 * Two originals are narrower than their shape's widest file, so they list their own `widths`
 * (polish X16): the tagging floor (1280x896, an 8:5 crop 1,280 wide, so no 1,600) and packing
 * (1568x1556, a 4:5 crop 1,245 wide, so no 1,536).
 */
export const SOURCES = [
  {
    slug: 'exterior',
    file: 'factory exterior image.png',
    original: [3555, 2000],
    shape: 'wide',
    focus: [0.5, 0.6],
  },
  {
    slug: 'solar-roof',
    file: 'Factory Solar.png',
    original: [3500, 2000],
    shape: 'wide',
    focus: [0.5, 0.5],
  },
  {
    slug: 'showroom',
    file: "RUN's Showroom.png",
    original: [2000, 1400],
    shape: 'wide',
    focus: [0.5, 0.55],
  },
  {
    slug: 'screen-printing',
    file: 'SCREEN PRINTING.png',
    original: [1536, 2816],
    shape: 'single',
    focus: [0.5, 0.45],
  },
  {
    slug: 'inspection',
    file: 'QC.png',
    original: [1536, 2816],
    shape: 'single',
    focus: [0.5, 0.5],
  },
  {
    slug: 'stitching',
    file: 'Apparel Stitching Department.png',
    original: [4875, 2403],
    shape: 'wide',
    focus: [0.5, 0.5],
  },
  {
    slug: 'lab',
    file: 'apparel lab 2016@0.5x.png',
    original: [2141, 1205],
    shape: 'wide',
    focus: [0.55, 0.5],
  },
  {
    slug: 'tagging',
    file: 'Tagging Department.png',
    original: [1280, 896],
    shape: 'wide',
    widths: [640, 1200],
    focus: [0.5, 0.5],
  },
  {
    slug: 'final-check',
    file: 'QC2.png',
    original: [1792, 2560],
    shape: 'single',
    focus: [0.5, 0.6],
  },
  {
    slug: 'packing',
    file: 'Packaging-Department.png',
    original: [1568, 1556],
    shape: 'single',
    widths: [400, 800, 1200],
    focus: [0.55, 0.5],
  },
]

/**
 * The largest box of `aspect` that fits in width×height, centred on the focus point and
 * slid back inside the picture where the focus sits near an edge.
 */
export function cropBox(width, height, aspect, [fx, fy]) {
  const boxWidth = Math.min(width, Math.round(height * aspect))
  const boxHeight = Math.min(height, Math.round(boxWidth / aspect))
  const clamp = (value, max) => Math.max(0, Math.min(max, Math.round(value)))
  return {
    left: clamp(width * fx - boxWidth / 2, width - boxWidth),
    top: clamp(height * fy - boxHeight / 2, height - boxHeight),
    width: boxWidth,
    height: boxHeight,
  }
}

async function main() {
  const from = process.argv[2]
  if (!from) {
    console.error('Usage: node scripts/build-factory-photos.mjs "<folder with the originals>"')
    process.exit(2)
  }
  // sharp is the pipeline's dependency, not this script's (the icon-parity probe's pattern),
  // and it is loaded here so the unit test can import the list without it.
  const sharp = createRequire(resolve(import.meta.dirname, '../tools/asset-pipeline/package.json'))(
    'sharp',
  )
  const out = resolve(import.meta.dirname, '../apps/cms/public/factory')
  mkdirSync(out, { recursive: true })
  for (const source of [
    ...SOURCES,
    ...HERO_SOURCES,
    ...CONTACT_HERO_SOURCES,
    ...ABOUT_HERO_SOURCES,
  ]) {
    const shape = SHAPES[source.shape]
    const { width, height } = await sharp(join(from, source.file)).metadata()
    // A different original makes the recorded size, and every width checked against it, untrue.
    if (width !== source.original[0] || height !== source.original[1]) {
      throw new Error(
        `${source.file} is ${width}x${height}, recorded as ${source.original.join('x')}: ` +
          'update `original` and check which widths it can give',
      )
    }
    const box = cropBox(width, height, shape.aspect, source.focus)
    for (const w of source.widths ?? shape.widths) {
      if (w > box.width) {
        throw new Error(
          `${source.slug}-${w}: the crop is ${box.width}px wide, so that is an upscale`,
        )
      }
      const h = Math.round(w / shape.aspect)
      const target = join(out, `${source.slug}-${w}.webp`)
      const info = await sharp(join(from, source.file))
        .extract(box)
        .resize(w, h)
        .webp({ quality: 72, effort: 6, smartSubsample: true })
        .toFile(target)
      console.log(`${source.slug}-${w}.webp  ${info.width}x${info.height}  ${info.size} bytes`)
      // The phone crops also in AVIF (2026-09-29): 36–43% lighter than the WebP at quality 45,
      // the same behind the hero's ink wash, and each is its page's largest paint on a phone.
      if (source.shape === 'heroTall') {
        const avif = join(out, `${source.slug}-${w}.avif`)
        const a = await sharp(join(from, source.file))
          .extract(box)
          .resize(w, h)
          .avif({ quality: 45, effort: 6 })
          .toFile(avif)
        console.log(`${source.slug}-${w}.avif  ${a.width}x${a.height}  ${a.size} bytes`)
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) await main()
