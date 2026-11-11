/**
 * Types for `build-factory-photos.mjs`, so `apps/cms/src/factoryPhotos.test.ts` can check the
 * script and the page agree — the same reason `vibecoded-rules.d.mts` exists.
 */
export declare const SHAPES: Record<
  'wide' | 'single' | 'heroWide' | 'heroTall',
  { aspect: number; widths: number[] }
>

/** `original` is the original's size in pixels; `widths` only where it is narrower than the shape's. */
export declare const SOURCES: {
  slug: string
  file: string
  original: [number, number]
  shape: 'wide' | 'single'
  widths?: number[]
  /** Wider files for a full-width figure only (`fullWidths` in apps/cms/src/lib/factoryPhotos.ts). */
  fullWidths?: number[]
  focus: [number, number]
}[]

export declare const HERO_SOURCES: {
  slug: string
  file: string
  original: [number, number]
  shape: 'heroWide' | 'heroTall'
  focus: [number, number]
}[]

/** The contact hero: the home hero's shapes, with widths capped at the 2000px original. */
export declare const CONTACT_HERO_SOURCES: {
  slug: string
  file: string
  original: [number, number]
  shape: 'heroWide' | 'heroTall'
  widths: number[]
  focus: [number, number]
}[]

/** The /about hero: the home hero's shapes and widths, from the 3555x2000 exterior (no upscale). */
export declare const ABOUT_HERO_SOURCES: {
  slug: string
  file: string
  original: [number, number]
  shape: 'heroWide' | 'heroTall'
  widths?: number[]
  focus: [number, number]
}[]

/** The "Inside the factory" hero's 4:5 card from 900px (2026-11-11): the window the 16:9 file showed. */
export declare const FACTORY_HERO_SOURCES: {
  slug: string
  file: string
  original: [number, number]
  shape: 'heroTall'
  widths: number[]
  focus: [number, number]
}[]

/** The order steps' own crops (2026-11-11): `phone` 3:5, `card` 9:10 (wide photos only). */
export declare const STEP_CROPS: Record<'phone' | 'card', { aspect: number; widths: number[] }>

/** Across, as a fraction: the page's `focus[0]` for each of the eight step photos. */
export declare const STEP_VIEW: Record<
  | 'showroom'
  | 'lab'
  | 'screen-printing'
  | 'inspection'
  | 'exterior'
  | 'final-check'
  | 'packing'
  | 'tagging',
  number
>

/** A step photo's crop box and widths for `kind`, or null where it has none. */
export declare function stepCrop(
  source: {
    slug: string
    original: [number, number]
    shape: 'wide' | 'single'
    focus: [number, number]
  },
  kind: 'phone' | 'card',
): { box: { left: number; top: number; width: number; height: number }; widths: number[] } | null

/**
 * The whole pictures (owner, 2026-11-05: never cut): two portraits and the four buyer pages' photos,
 * resized to the original's own shape. `original` is the pixel size and every width stays within it.
 */
export declare const WHOLE_SOURCES: {
  slug: string
  file: string
  original: [number, number]
  widths: number[]
}[]

export declare function cropBox(
  width: number,
  height: number,
  aspect: number,
  focus: [number, number],
): { left: number; top: number; width: number; height: number }

/** The AVIF quality per hero shape (the wide crops' 55 measured 2026-11-04 against the originals). */
export declare const AVIF_QUALITY: { heroTall: number; heroWide: number }
