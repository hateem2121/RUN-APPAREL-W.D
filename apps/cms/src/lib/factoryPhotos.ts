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
 * DURUS INDUSTRIES is a separate company of the same family and RUN APPAREL produces on its site (six buildings,
 * owner 2026-10-15), which the certification line on this page already says ("the same facility").
 *
 * `alt` says what is in the picture; `caption` says what it is. Neither repeats the other.
 * ⚠️ NO CAPTION IS SHOWN SINCE 2026-10-05 (the owner: "remove all the image names"): the photo
 * frames and the order-step cards draw none, and a test pins that. The words stay here, so one
 * can come back as a one-line change; the `alt` is what a screen reader hears.
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
  /**
   * Set only where the original is narrower than the shape's widest file: the widths this photo's
   * original holds (never an upscale; `scripts/build-factory-photos.mjs` records each original's size).
   */
  widths?: readonly number[]
  /**
   * Wider files, written only for a photo the page also draws across the whole column, and offered
   * ONLY by that figure (`factoryPhotoImage(photo, { full: true })`): the factory gallery's closing
   * photo since 2026-10-26 (owner, "Building full width"). A 2x laptop asks 2,624 px of it in the
   * 1,312 px column, where the shape's widest file is 1,600. Every other place that shows the same
   * photo keeps its own files, so the home page's step 05 downloads nothing new.
   */
  fullWidths?: readonly number[]
}

/**
 * Widths written per shape; the height follows from the file's ratio.
 *
 * ⚠️ SIZED FOR SHARP SCREENS AT THE WIDEST EACH PHOTO IS DRAWN (polish X16, 2026-10-05). Until then
 * the files stopped at 1,200 (wide) and 800 (tall), and the audit of 3 October measured the step
 * photos 1.4 times stretched on a sharp laptop. Since polish D4 a step card is up to 704 px wide
 * (`ORDER_STEP_SIZES`, as №01's photos, `HALF_COLUMN_SIZES`) and 753 px on an 834 px tablet, so a 2x
 * screen asks for up to 1,408 and 1,506 px. Wide files add 1,600. Tall files add 1,536, the
 * width two of their originals stop at, and 1,200 for 3x phones (a 350-390 px card asks 1,050-1,167),
 * which would otherwise skip from 800 to the 1,536 file. `src/factoryPhotos.test.ts` picks each
 * screen's file the way the browsers do and fails on a photo left short.
 */
export const FACTORY_PHOTO_WIDTHS: Record<FactoryPhotoShape, readonly number[]> = {
  wide: [640, 1200, 1600],
  single: [400, 800, 1200, 1536],
}

export const FACTORY_PHOTO_ASPECT: Record<FactoryPhotoShape, number> = {
  wide: 8 / 5,
  single: 4 / 5,
}

export const FACTORY_PHOTOS: readonly FactoryPhoto[] = [
  {
    slug: 'exterior',
    shape: 'wide',
    // №04's step 05 since 2026-10-17 (owner: the hero already shows the stitching floor). The
    // entrance and its glass tower stand at the middle of the file, measured on a 10% grid.
    focus: [50, 50],
    alt: 'A red-brick factory building with wide steps in front, under a cloudy sky.',
    caption: 'The DURUS INDUSTRIES building in Sialkot, where RUN APPAREL produces',
    // The gallery closes on it across the column; 3,200 is the widest 8:5 crop its 3,555x2,000
    // original holds (the crop is the full 2,000 px height).
    fullWidths: [2400, 3200],
  },
  {
    slug: 'solar-roof',
    shape: 'wide',
    // Its own words since 2026-10-16: "The same building from above" read only after the front of
    // the building, and the community and factory pages show this photo first or alone.
    alt: 'The works from above, the roof covered in solar panels.',
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
    // Its original is 1,280 x 896, so the 1,600 file would be an upscale: a 2x laptop asks 1,248-1,408 (X16).
    widths: [640, 1200],
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
    // Its original's 4:5 crop is 1,245 px wide, so no 1,536 file: a 2x laptop asks 1,248-1,408 (X16).
    widths: [400, 800, 1200],
    alt: 'A gloved hand slides a black T-shirt with a RUN label into a clear bag.',
    caption: 'Packing',
  },
]

/**
 * THE WHOLE PICTURES (owner, 2026-11-05: "I do not want the images to be cut", and a photo as the
 * whole background of its screen, after Lando Norris, Awwwards Site of the Year 2025, and Scout
 * Motors). Six pictures kept in their original's own proportions, drawn by `PhotoStage.tsx`
 * `object-fit: contain` over a blurred, darkened copy of themselves, so nothing in a picture is
 * ever cut off and the screen is still all picture. Two kinds:
 *
 * - the two archive portraits, one full screen each on /about (real archive photographs, publish
 *   OK): Allah Ditta Ghafuree, whose year is 1889, and M. Iqbal Sandal, 1956–1992 (the years of the
 *   timeline cards that name them).
 * - the four buyer pages' photos, one different picture each (`ORDER_PHOTO_BY_FAMILY`,
 *   `familyPages.ts`): the same pictures as `FACTORY_PHOTOS`' screen-printing, stitching, inspection
 *   and tagging, but whole where those are cut to 8:5 and 4:5. Their `alt` is those pictures' own.
 *
 * ⚠️ NO CAPTION, NO NEW WORDS on a portrait (the owner's 2026-10-05 rule: "remove all the image
 * names"); the `alt` is what a screen reader hears, in the spelling the page already prints
 * ("Ghafuree"). A test fails if a name here drifts from the timeline's text.
 *
 * ⚠️ `ratio` IS THE ORIGINAL'S SIZE IN PIXELS, so the file's shape is exact, never rounded to a tidy
 * 4:5. `scripts/build-factory-photos.mjs` (`WHOLE_SOURCES`) writes `/factory/<slug>-<width>.webp`
 * at these widths and refuses an upscale; `factoryPhotos.test.ts` fails a missing file, a file of
 * another shape, or a list that disagrees with the script. Allah Ditta Ghafuree's original is 1156
 * px wide, so on a sharp laptop his picture is a little soft: the owner's file, not a choice.
 */
export type WholePhoto = {
  slug: string
  /** The original's width and height in pixels; every file has exactly this shape. */
  ratio: readonly [width: number, height: number]
  widths: readonly number[]
  alt: string
}

const altOf = (slug: string) => FACTORY_PHOTOS.find((photo) => photo.slug === slug)?.alt ?? ''

export const WHOLE_PHOTOS: readonly WholePhoto[] = [
  {
    slug: 'portrait-ghafuree',
    ratio: [1156, 1548],
    widths: [400, 800, 1156],
    alt: 'Black-and-white portrait of Allah Ditta Ghafuree.',
  },
  {
    slug: 'portrait-sandal',
    ratio: [3780, 2834],
    widths: [400, 800, 1600, 2400],
    alt: 'Black-and-white portrait of M. Iqbal Sandal.',
  },
  {
    slug: 'whole-screen-printing',
    ratio: [1536, 2816],
    widths: [400, 800, 1536],
    alt: altOf('screen-printing'),
  },
  {
    slug: 'whole-inspection',
    ratio: [1536, 2816],
    widths: [400, 800, 1536],
    alt: altOf('inspection'),
  },
  {
    slug: 'whole-stitching',
    ratio: [4875, 2403],
    widths: [640, 1280, 1920, 2560],
    alt: altOf('stitching'),
  },
  {
    slug: 'whole-tagging',
    ratio: [1280, 896],
    widths: [640, 1280],
    alt: altOf('tagging'),
  },
]

/**
 * The two archive portraits on /about, in the order of the timeline, each with the card year it
 * follows and the tone of that year drawn huge behind it (`PhotoStage.tsx`).
 *
 * ⚠️ THE TONE FOLLOWS WHAT THE YEAR SITS OVER (owner, 2026-11-05: "darken it"). Ghafuree's year sits
 * on the dark blurred ground at the left of a tall picture, so a light year reads; Sandal's wide
 * picture runs the whole screen and his year sits over its bright wall, where a light year was only
 * half readable ("1956–" showed and "1992" did not), so his is dark.
 */
export const ABOUT_PORTRAITS = [
  { slug: 'portrait-ghafuree', year: '1889', yearTone: 'light' },
  { slug: 'portrait-sandal', year: '1956–1992', yearTone: 'dark' },
] as const

export function wholePhoto(slug: string): WholePhoto {
  const photo = WHOLE_PHOTOS.find((entry) => entry.slug === slug)
  if (!photo) throw new Error(`factoryPhotos: no whole photo "${slug}"`)
  return photo
}

/**
 * What a stage's `<img>` of `photo` carries. `sizes` is how wide it draws: the screen's width below
 * 900 px (the stage takes the picture's own shape there), and above it the width its height allows,
 * `min(100vw, height-of-screen x ratio)`, since `contain` fits the whole picture in a screen-high
 * box. The smallest file is `src`, the reserved size and the blurred backdrop's source.
 */
export function wholePhotoImage(photo: WholePhoto): {
  src: string
  srcSet: string
  sizes: string
  width: number
  height: number
} {
  const [ow, oh] = photo.ratio
  const smallest = photo.widths[0] ?? ow
  return {
    src: `/factory/${photo.slug}-${smallest}.webp`,
    srcSet: photo.widths.map((w) => `/factory/${photo.slug}-${w}.webp ${w}w`).join(', '),
    sizes: `(max-width: 899px) 100vw, min(100vw, ${((ow / oh) * 100).toFixed(1)}svh)`,
    width: smallest,
    height: Math.round((smallest * oh) / ow),
  }
}

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
 * `/factory/hero-wide-<width>.webp` or `/factory/hero-tall-<width>.webp`. Both also exist as
 * `.avif`: the tall (phone) crops since 2026-09-29 (36–43% lighter, the phone's largest paint), the
 * wide crops since 2026-11-04 (13–35% lighter at the same SSIM).
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

/** `/factory/contact-hero-wide-<width>.webp` or `…-tall-<width>.webp`; every crop in `.avif` too. */
export function contactHeroSrc(
  shape: HeroShape,
  width: number,
  format: 'webp' | 'avif' = 'webp',
): string {
  return `/factory/${CONTACT_HERO_FILE[shape]}-${width}.${format}`
}

/**
 * The /about hero (the about-factory build, 2026-10-09): the building, in the home hero's two
 * crops. The original is 3555x2000, so the 16:9 crop is the whole frame and its widest file is
 * no upscale; the 4:5 crop is the 1600x2000 centre.
 */
export const ABOUT_HERO_PHOTO = {
  alt: 'A red-brick factory building with wide steps in front, under a cloudy sky.',
  widths: { heroWide: [1280, 1920, 2560], heroTall: [640, 1080] },
} as const satisfies { alt: string; widths: Record<HeroShape, readonly number[]> }

const ABOUT_HERO_FILE: Record<HeroShape, string> = {
  heroWide: 'about-hero-wide',
  heroTall: 'about-hero-tall',
}

/** `/factory/about-hero-wide-<width>.webp` or `…-tall-<width>.webp`; every crop in `.avif` too. */
export function aboutHeroSrc(
  shape: HeroShape,
  width: number,
  format: 'webp' | 'avif' = 'webp',
): string {
  return `/factory/${ABOUT_HERO_FILE[shape]}-${width}.${format}`
}

/** `/factory/<slug>-<width>.webp`, the path `public/` serves it at. */
export function factoryPhotoSrc(photo: FactoryPhoto, width: number): string {
  return `/factory/${photo.slug}-${width}.webp`
}

/** The widths written for `photo`: its shape's, or its own where the original stops short. */
export function factoryPhotoWidths(photo: FactoryPhoto): readonly number[] {
  return photo.widths ?? FACTORY_PHOTO_WIDTHS[photo.shape]
}

/** Every width written for `photo`: its own, then the wider ones a full-width figure offers. */
export function factoryPhotoFileWidths(photo: FactoryPhoto): readonly number[] {
  return [...factoryPhotoWidths(photo), ...(photo.fullWidths ?? [])]
}

/**
 * What an `<img>` of `photo` carries: every width to choose from, and the smallest as `src` and as
 * the reserved size (only its ratio matters there). The page names the `sizes`, as only the page
 * knows how wide it draws the photo.
 */
export function factoryPhotoImage(
  photo: FactoryPhoto,
  { full = false }: { full?: boolean } = {},
): {
  src: string
  srcSet: string
  width: number
  height: number
} {
  const widths = full ? factoryPhotoFileWidths(photo) : factoryPhotoWidths(photo)
  const smallest = widths[0] ?? FACTORY_PHOTO_WIDTHS[photo.shape][0] ?? 0
  return {
    src: factoryPhotoSrc(photo, smallest),
    srcSet: widths.map((width) => `${factoryPhotoSrc(photo, width)} ${width}w`).join(', '),
    width: smallest,
    height: Math.round(smallest / FACTORY_PHOTO_ASPECT[photo.shape]),
  }
}
