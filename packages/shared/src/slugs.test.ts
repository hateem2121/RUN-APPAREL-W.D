import { describe, expect, it } from 'vitest'
import { buildViewerPath, isValidSlug, normalizeSlug, parseViewerPath } from './slugs'

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
})

describe('buildViewerPath', () => {
  it('joins slugs', () => {
    expect(buildViewerPath('n001', 'black')).toBe('/n001/black')
  })
})
