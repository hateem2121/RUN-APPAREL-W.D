import { describe, expect, it } from 'vitest'
import { TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  findPlaceholders,
} from '../../../../scripts/copy-rules.mjs'
import {
  CONTACT_DESCRIPTION,
  HOME_DESCRIPTION,
  HOME_TITLE,
  MAX_PAGE_DESCRIPTION,
  PRODUCTS_DESCRIPTION,
} from './pageDescriptions'

/**
 * L-06 / FI-01. Search results show about the first 160 characters of a description.
 * Measured live 2026-09-16: the home page's ran 296 and the products page's 186, so the
 * end of each was cut off in front of every searcher.
 */
// The family filters' own descriptions went with the filters (polish S3, 2026-10-05).
const EVERY: [string, string][] = [
  ['home', HOME_DESCRIPTION],
  ['products', PRODUCTS_DESCRIPTION],
  // Moved here from its page on 2026-10-11, so the same rules now hold it.
  ['contact', CONTACT_DESCRIPTION],
]

describe('page descriptions (L-06, FI-01)', () => {
  it('the ceiling is the one search results use', () => {
    expect(MAX_PAGE_DESCRIPTION).toBe(160)
  })

  it.each(EVERY)('%s fits a search result', (_page, text) => {
    expect(text.length).toBeGreaterThanOrEqual(50)
    expect(text.length).toBeLessThanOrEqual(MAX_PAGE_DESCRIPTION)
  })

  it.each(EVERY)('%s follows the copy rules', (_page, text) => {
    expect(findBritishSpellings(text)).toEqual([])
    expect(findBuzzwords(text)).toEqual([])
    expect(findEmoji(text)).toEqual([])
    expect(findPlaceholders(text)).toEqual([])
    expect(text).not.toContain('—')
  })

  it('keeps the wording the owner chose (home 2026-10-11, products 2026-09-16)', () => {
    expect(HOME_DESCRIPTION).toBe(
      'RUN APPAREL is a private label sportswear manufacturer in Pakistan: teamwear, uniforms, casual wear, outerwear and sports accessories, from 50 pieces per style.',
    )
    expect(PRODUCTS_DESCRIPTION).toBe(
      'Every RUN APPAREL garment in 3D. Turn it, check how it is made and see the print before a sample ships.',
    )
  })

  it('leaves Sialkot out of the home description, as the owner chose on 2026-09-16 and kept on 2026-10-11', () => {
    expect(HOME_DESCRIPTION).not.toContain('Sialkot')
  })

  it('names every product family on the home page, as the owner asked', () => {
    const text = HOME_DESCRIPTION.toLowerCase()
    for (const word of [
      'sportswear',
      'teamwear',
      'uniforms',
      'casual wear',
      'outerwear',
      'sports accessories',
    ]) {
      expect(text, `the home description no longer names ${word}`).toContain(word)
    }
  })
})

/*
 * The home title (owner, 2026-10-23). Google sent "private label sportswear" searches to the
 * casual-wear page while this title said "Custom B2B Sportswear & Team Wear Manufacturer".
 */
describe('the home page title', () => {
  it('leads with the brand, then the words buyers search', () => {
    expect(HOME_TITLE).toBe('RUN APPAREL — Private Label Sportswear Manufacturer')
  })

  it('fits in the 60 characters a result shows whole', () => {
    expect(HOME_TITLE.length).toBeLessThanOrEqual(TITLE_MAX)
  })
})
