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

export declare function cropBox(
  width: number,
  height: number,
  aspect: number,
  focus: [number, number],
): { left: number; top: number; width: number; height: number }
