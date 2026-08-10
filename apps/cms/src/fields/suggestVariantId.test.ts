import { describe, expect, it } from 'vitest'
import { type FileColourDetail, siblingPath, suggestVariantId } from './suggestVariantId'

/**
 * suggestVariantId only ever saves a keystroke — it may never spend one. A
 * confident wrong suggestion is how a maroon garment came to be published as
 * "Navy" on 2026-08-03, so every case below either returns the one obvious
 * match or returns null; there is no "closest guess" branch to test, because
 * there is no such branch in the function.
 */

const detail = (over: Partial<FileColourDetail> = {}): FileColourDetail => ({
  variantId: 'Colorway 3',
  hex: '#5B0A24',
  name: 'Wine',
  confidence: 'high',
  ...over,
})

describe('suggestVariantId', () => {
  it('suggests the match when the row name and a high-confidence name agree', () => {
    expect(suggestVariantId('Wine', [detail()], undefined)).toBe('Colorway 3')
  })

  it('never overwrites a value the owner already chose', () => {
    expect(suggestVariantId('Wine', [detail()], 'Colorway 7')).toBeNull()
  })

  it('does not suggest a low-confidence match', () => {
    expect(suggestVariantId('Wine', [detail({ confidence: 'low' })], undefined)).toBeNull()
  })

  it('returns null when no file colour matches the row name', () => {
    expect(suggestVariantId('Navy', [detail()], undefined)).toBeNull()
  })

  it('matches regardless of case and surrounding whitespace on both sides', () => {
    expect(suggestVariantId('  wine  ', [detail({ name: 'WINE' })], undefined)).toBe('Colorway 3')
  })

  it('suggests nothing for a row with no name yet', () => {
    expect(suggestVariantId('', [detail()], undefined)).toBeNull()
    expect(suggestVariantId('   ', [detail()], undefined)).toBeNull()
    expect(suggestVariantId(undefined, [detail()], undefined)).toBeNull()
  })

  it('is empty-safe before the file has been processed', () => {
    expect(suggestVariantId('Wine', [], undefined)).toBeNull()
  })

  it('treats an existing empty-string value the same as unset', () => {
    expect(suggestVariantId('Wine', [detail()], '')).toBe('Colorway 3')
  })
})

describe('siblingPath', () => {
  it('swaps the last segment for the sibling field, keeping the row index', () => {
    expect(siblingPath('colourways.2.variantId', 'displayName')).toBe('colourways.2.displayName')
  })

  it('works at row 0 and with multi-digit indexes alike', () => {
    expect(siblingPath('colourways.0.variantId', 'displayName')).toBe('colourways.0.displayName')
    expect(siblingPath('colourways.12.variantId', 'displayName')).toBe('colourways.12.displayName')
  })
})
