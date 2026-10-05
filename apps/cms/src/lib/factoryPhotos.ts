/**
 * The owner's factory photos (OI-3, 2026-09-25): ten pictures of the building and the rooms an
 * order passes through. The building and its roof sit in №01 "Who we are", the other eight in
 * №04 "How an order works", one for each step (`lib/orderProcess.ts`). A strip below №05 showed
 * all ten a second time until 2026-10-02, when the owner chose to remove it (visual audit VA-29
 * with VA-34: every room it showed was already pictured above it).
 *
 * The files are written by `scripts/build-factory-photos.mjs` from the owner's originals and
 * served from `apps/cms/public/factory/`; `src/factoryPhotos.test.ts` fails if one is missing
 * or is not the size declared here.
 *
 * ⚠️ `shape` IS THE SHAPE OF THE FILE, NOT OF WHAT THE PAGE DRAWS. The script cuts each original
 * to 8:5 (`wide`) or 4:5 (`single`) so a phone never downloads pixels nobody sees. The order
 * timeline then cuts all eight to ONE square in CSS (`.photo-figure__frame--square`), which is
 * what `focus` below steers. Nothing else depends on the order of this list: until 2026-10-02 it
 * WAS the layout of the strip, and `factoryPhotos.test.ts` once checked that no row had a hole.
 *
 * ⚠️ THE BUILDING IS NAMED IN ITS CAPTION (the owner's ruling on these photos). Its sign reads DURUS;
 * DURUS INDUSTRIES is the parent company and RUN APPAREL produces in the same building,
 * which the certification line on this page already says in the same words.
 *
 * `alt` says what is in the picture; `caption` says what it is. Neither repeats the other,
 * so a screen reader hears each once.
 */
export type FactoryPhotoShape = 'wide' | 'single'

export type FactoryPhoto = {
  slug: string
  shape: FactoryPhotoShape
  alt: string
  caption: string
  /**
   * Where the subject sits when an order step's card cuts this picture (`OrderSteps.tsx`), as
   * `[across, down]` percentages for `object-position` — set only on the eight pictures the steps
   * draw.
   *
   * ⚠️ CHOSEN FOR A SQUARE, ONE AXIS AT A TIME (visual audit VA-29, by looking at each file
   * 2026-10-02). In the timeline's square a `wide` file kept its full height and a `single` file
   * its full width, so a wide picture moved only across and a tall one only down, and the other
   * number is 50. Since polish D4 (2026-10-05) the cut is the card's: about square on a phone and
   * wider than tall from 560px, where a tall file shows a band of its height and `down` decides
   * which band. The eight were looked at again in the cards on 2026-10-05 and kept.
   */
  focus?: readonly [x: number, y: number]
}

/** Widths written per shape (1× and 2×); the height follows from the file's ratio. */
export const FACTORY_PHOTO_WIDTHS: Record<FactoryPhotoShape, readonly [number, number]> = {
  wide: [640, 1200],
  single: [400, 800],
}

export const FACTORY_PHOTO_ASPECT: Record<FactoryPhotoShape, number> = {
  wide: 8 / 5,
  single: 4 / 5,
}

export const FACTORY_PHOTOS: readonly FactoryPhoto[] = [
  {
    slug: 'exterior',
    shape: 'wide',
    alt: 'A red-brick factory building with wide steps in front, under a cloudy sky.',
    caption: 'The DURUS INDUSTRIES building in Sialkot, where RUN APPAREL produces',
  },
  {
    slug: 'solar-roof',
    shape: 'wide',
    alt: 'The same building from above, its roof covered in solar panels.',
    caption: 'Solar panels across the roof',
  },
  {
    slug: 'showroom',
    shape: 'wide',
    // Right of centre: the rack, the two mannequins on the right and the RUN APPAREL wall behind them.
    focus: [90, 50],
    alt: 'Mannequins in black and blue compression wear in front of a concrete wall with the RUN APPAREL logo.',
    caption: 'Our showroom',
  },
  {
    slug: 'screen-printing',
    shape: 'single',
    // The printer's eyes and the squeegee in the same frame; the ink pots at the foot are the part given up.
    focus: [50, 25],
    alt: 'A printer pulls ink across a screen with a squeegee, pots of colored ink beside him.',
    caption: 'Screen printing',
  },
  {
    slug: 'inspection',
    shape: 'single',
    // From the top: the inspector's face, the bar light and the jacket's chest; the hem is the part given up.
    focus: [50, 5],
    alt: 'An inspector holds a green zip jacket under a bar light.',
    caption: 'Inspection under light',
  },
  {
    slug: 'stitching',
    shape: 'wide',
    // The middle rows of operators and the ZERO Defects sign; the crates in the corner are given up.
    focus: [60, 50],
    alt: 'Rows of sewing machines with operators in red shirts and red crates of cut pieces in the aisle.',
    caption: 'The stitching floor',
  },
  {
    slug: 'lab',
    shape: 'wide',
    // The technician at the color-viewing cabinet, the oven and the sample rack.
    focus: [55, 50],
    alt: 'Two technicians in lab coats at benches with a color-viewing cabinet and an oven.',
    caption: 'The testing lab',
  },
  {
    slug: 'tagging',
    shape: 'wide',
    // Both hands and the tag gun.
    focus: [55, 50],
    alt: 'Hands fastening a tag to navy pants with a tag gun.',
    caption: 'Tagging',
  },
  {
    slug: 'final-check',
    shape: 'single',
    // Low: the jacket on the lit table and the sheets beside it, with the hanging jackets just above.
    focus: [50, 80],
    alt: 'A green track jacket laid on a lit table beside inspection sheets, more jackets hanging behind.',
    caption: 'Final check',
  },
  {
    slug: 'packing',
    shape: 'single',
    // The sewn label and the gloved hands; the top of the glove is the part given up.
    focus: [50, 20],
    alt: 'A gloved hand slides a black T-shirt with a RUN label into a clear bag.',
    caption: 'Packing',
  },
]

/**
 * The home page hero (owner, 2026-09-29: a factory photo under the headline) — the stitching
 * floor, cut twice by `scripts/build-factory-photos.mjs`: 16:9 for wide screens and 4:5 for
 * phones, so a phone never downloads a 2:1 panorama to show its middle.
 *
 * ⚠️ IT IS THE PAGE'S LARGEST PAINT, so it loads eagerly with high fetch priority on the
 * `<img>` itself (never a `<link rel=preload>`: `e2e/perfBudgets.spec.ts` pins one preload per
 * page), and `factoryPhotos.test.ts` holds the files a first visit downloads under 180 KB.
 */
export type HeroShape = 'heroWide' | 'heroTall'

export const HERO_SHAPES: readonly HeroShape[] = ['heroWide', 'heroTall']

export const HERO_PHOTO = {
  alt: 'Rows of sewing machines on the stitching floor, operators in red shirts at work, red crates of cut pieces in the aisle.',
  widths: { heroWide: [1280, 1920, 2560], heroTall: [640, 1080] },
  aspect: { heroWide: 16 / 9, heroTall: 4 / 5 },
} as const satisfies {
  alt: string
  widths: Record<HeroShape, readonly number[]>
  aspect: Record<HeroShape, number>
}

const HERO_FILE: Record<HeroShape, string> = { heroWide: 'hero-wide', heroTall: 'hero-tall' }

/**
 * `/factory/hero-wide-<width>.webp` or `/factory/hero-tall-<width>.webp`. The tall (phone)
 * crops also exist as `.avif` (2026-09-29: 36–43% lighter, the phone's largest paint).
 */
export function heroPhotoSrc(
  shape: HeroShape,
  width: number,
  format: 'webp' | 'avif' = 'webp',
): string {
  return `/factory/${HERO_FILE[shape]}-${width}.${format}`
}

/**
 * The contact page hero (owner, 2026-09-29: "the image in contact page must also be in the
 * background of hero section, similar to home page") — the showroom, in the same two crops and
 * under the same ink wash as the home hero (`.site-hero--photo`).
 *
 * ⚠️ NO 2560 CROP. The showroom original is 2000x1400, so a 2560-wide file would be an upscale:
 * more bytes, no more detail. A 2560 screen takes the 1920 file, softened further by the wash.
 */
export const CONTACT_HERO_PHOTO = {
  alt: 'The RUN APPAREL showroom: mannequins in black and blue compression wear and rails of garments in front of a concrete wall with the RUN APPAREL logo.',
  widths: { heroWide: [1280, 1920], heroTall: [640, 1080] },
} as const satisfies { alt: string; widths: Record<HeroShape, readonly number[]> }

const CONTACT_HERO_FILE: Record<HeroShape, string> = {
  heroWide: 'contact-hero-wide',
  heroTall: 'contact-hero-tall',
}

/** `/factory/contact-hero-wide-<width>.webp` or `…-tall-<width>.webp`; the tall crops in `.avif` too. */
export function contactHeroSrc(
  shape: HeroShape,
  width: number,
  format: 'webp' | 'avif' = 'webp',
): string {
  return `/factory/${CONTACT_HERO_FILE[shape]}-${width}.${format}`
}

/** `/factory/<slug>-<width>.webp`, the path `public/` serves it at. */
export function factoryPhotoSrc(photo: FactoryPhoto, width: number): string {
  return `/factory/${photo.slug}-${width}.webp`
}
