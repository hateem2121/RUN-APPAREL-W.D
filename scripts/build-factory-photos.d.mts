/**
 * Types for `build-factory-photos.mjs`, so `apps/cms/src/factoryPhotos.test.ts` can check the
 * script and the page agree — the same reason `vibecoded-rules.d.mts` exists.
 */
export declare const SHAPES: Record<'wide' | 'single', { aspect: number; widths: number[] }>

export declare const SOURCES: {
  slug: string
  file: string
  shape: 'wide' | 'single'
  focus: [number, number]
}[]

export declare function cropBox(
  width: number,
  height: number,
  aspect: number,
  focus: [number, number],
): { left: number; top: number; width: number; height: number }
