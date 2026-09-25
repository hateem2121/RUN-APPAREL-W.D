/**
 * The home page's "Inside the factory" strip (OI-3, owner's choice 2026-09-25: a photo strip
 * below the existing sections, all three groups — making, checking and finishing, premises).
 *
 * The files are written by `scripts/build-factory-photos.mjs` from the owner's originals and
 * served from `apps/cms/public/factory/`; `src/factoryPhotos.test.ts` fails if one is missing
 * or is not the size declared here.
 *
 * ⚠️ THE ORDER IS THE LAYOUT. A `wide` tile spans two grid columns at 8:5 and a `single` one
 * column at 4:5, so both are the same height. This order fills every row at two columns (a
 * phone) AND at four (a desktop) — wide, wide | wide, single, single | … — with no
 * `grid-auto-flow: dense`, which would fill holes by moving pictures out of reading order.
 * The test checks both column counts, so a reorder that leaves a hole fails there first.
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
}

/** Widths written per shape (1× and 2×); the height follows from the tile's ratio. */
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
    alt: 'Mannequins in black and blue compression wear in front of a concrete wall with the RUN APPAREL logo.',
    caption: 'Our showroom',
  },
  {
    slug: 'screen-printing',
    shape: 'single',
    alt: 'A printer pulls ink across a screen with a squeegee, pots of colored ink beside him.',
    caption: 'Screen printing',
  },
  {
    slug: 'inspection',
    shape: 'single',
    alt: 'An inspector holds a green zip jacket under a bar light.',
    caption: 'Inspection under light',
  },
  {
    slug: 'stitching',
    shape: 'wide',
    alt: 'Rows of sewing machines with operators in red shirts and red crates of cut pieces in the aisle.',
    caption: 'The stitching floor',
  },
  {
    slug: 'lab',
    shape: 'wide',
    alt: 'Two technicians in lab coats at benches with a color-viewing cabinet and an oven.',
    caption: 'The testing lab',
  },
  {
    slug: 'tagging',
    shape: 'wide',
    alt: 'Hands fastening a tag to navy pants with a tag gun.',
    caption: 'Tagging',
  },
  {
    slug: 'final-check',
    shape: 'single',
    alt: 'A green track jacket laid on a lit table beside inspection sheets, more jackets hanging behind.',
    caption: 'Final check',
  },
  {
    slug: 'packing',
    shape: 'single',
    alt: 'A gloved hand slides a black T-shirt with a RUN label into a clear bag.',
    caption: 'Packing',
  },
]

/** `/factory/<slug>-<width>.webp`, the path `public/` serves it at. */
export function factoryPhotoSrc(photo: FactoryPhoto, width: number): string {
  return `/factory/${photo.slug}-${width}.webp`
}
