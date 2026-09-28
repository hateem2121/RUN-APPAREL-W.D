import { describe, expect, it } from 'vitest'
import {
  buildViewerPath,
  GARMENT_PATH_PREFIX,
  isGarmentPagePath,
  isValidSlug,
  normalizeSlug,
  parseViewerPath,
} from './slugs'

describe('isValidSlug', () => {
  it('accepts lowercase url-safe slugs', () => {
    expect(isValidSlug('n001')).toBe(true)
    expect(isValidSlug('deep-forest-2')).toBe(true)
  })
  it('rejects uppercase, spaces and stray hyphens', () => {
    expect(isValidSlug('N001')).toBe(false)
    expect(isValidSlug('navy blue')).toBe(false)
    expect(isValidSlug('-navy')).toBe(false)
    expect(isValidSlug('navy-')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })
})

describe('normalizeSlug', () => {
  it('lowercases and collapses separators', () => {
    expect(normalizeSlug(' N001 ')).toBe('n001')
    expect(normalizeSlug('Deep  Forest')).toBe('deep-forest')
    expect(normalizeSlug('navy/')).toBe('navy')
  })
  it('returns null when nothing slug-like remains', () => {
    expect(normalizeSlug('///')).toBeNull()
    expect(normalizeSlug('')).toBeNull()
  })
})

describe('parseViewerPath', () => {
  it('parses /:productSlug/:colourSlug', () => {
    expect(parseViewerPath('/n001/navy')).toEqual({ productSlug: 'n001', colourSlug: 'navy' })
    expect(parseViewerPath('/n001/navy/')).toEqual({ productSlug: 'n001', colourSlug: 'navy' })
  })
  it('normalises sloppy QR input', () => {
    expect(parseViewerPath('/N001/Navy')).toEqual({ productSlug: 'n001', colourSlug: 'navy' })
  })
  // A tag printed with only the product code, or a buyer who deletes the last
  // path segment, used to land on the "reference unavailable" page. The product
  // is real and published; the visitor simply did not name a colour. Resolving
  // to the default colour is the only non-hostile reading of /n001.
  it('parses a product-only path, with no colour requested', () => {
    expect(parseViewerPath('/n001')).toEqual({ productSlug: 'n001', colourSlug: null })
    expect(parseViewerPath('/n001/')).toEqual({ productSlug: 'n001', colourSlug: null })
    expect(parseViewerPath('/N001')).toEqual({ productSlug: 'n001', colourSlug: null })
  })
  it('rejects other shapes', () => {
    expect(parseViewerPath('/')).toBeNull()
    expect(parseViewerPath('/a/b/c')).toBeNull()
    expect(parseViewerPath('/!!!')).toBeNull()
  })
  // The garment pages' home on wear-run.com (owner decision 2026-09-28). The old
  // shape above keeps parsing because viewer.wear-run.help serves it until the switch
  // and forwards it for ever after.
  it('parses the same two shapes inside the /products folder', () => {
    expect(parseViewerPath('/products/n001/navy')).toEqual({
      productSlug: 'n001',
      colourSlug: 'navy',
    })
    expect(parseViewerPath('/products/n001/navy/')).toEqual({
      productSlug: 'n001',
      colourSlug: 'navy',
    })
    expect(parseViewerPath('/products/n001')).toEqual({ productSlug: 'n001', colourSlug: null })
  })
  it('does not read the /products listing, or a third segment inside it, as a garment', () => {
    expect(parseViewerPath('/products')).toBeNull()
    expect(parseViewerPath('/products/')).toBeNull()
    expect(parseViewerPath('/products/a/b/c')).toBeNull()
  })
})

describe('isGarmentPagePath', () => {
  it('is true only inside the /products folder', () => {
    expect(isGarmentPagePath('/products/n001/navy')).toBe(true)
    expect(isGarmentPagePath('/products/n001')).toBe(true)
    expect(isGarmentPagePath('/products')).toBe(false)
    expect(isGarmentPagePath('/n001/navy')).toBe(false)
    // A product that happened to be called "products-x" must not count.
    expect(isGarmentPagePath('/products-x/navy')).toBe(false)
  })
})

describe('buildViewerPath', () => {
  it('joins slugs', () => {
    expect(buildViewerPath('n001', 'black')).toBe('/n001/black')
  })
  it('joins slugs inside the /products folder when asked', () => {
    expect(buildViewerPath('n001', 'black', GARMENT_PATH_PREFIX)).toBe('/products/n001/black')
  })
})
