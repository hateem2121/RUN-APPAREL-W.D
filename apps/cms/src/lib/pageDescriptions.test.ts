import { describe, expect, it } from 'vitest'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  findPlaceholders,
} from '../../../../scripts/copy-rules.mjs'
import { FAMILIES } from './families'
import {
  HOME_DESCRIPTION,
  MAX_PAGE_DESCRIPTION,
  PRODUCTS_DESCRIPTION,
  productsDescription,
} from './pageDescriptions'

/**
 * L-06 / FI-01. Search results show about the first 160 characters of a description.
 * Measured live 2026-09-16: the home page's ran 296 and the products page's 186, so the
 * end of each was cut off in front of every searcher.
 */
const EVERY: [string, string][] = [
  ['home', HOME_DESCRIPTION],
  ['products', productsDescription(null)],
  ...FAMILIES.map((family): [string, string] => [
    `products?family=${family.slug}`,
    productsDescription(family.name),
  ]),
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

  it('keeps the wording the owner chose on 2026-09-16', () => {
    expect(HOME_DESCRIPTION).toBe(
      'Private label sportswear, teamwear, uniforms, casual wear, outerwear and sports accessories. Made to order in Pakistan, since 1889. 50-piece minimum.',
    )
    expect(PRODUCTS_DESCRIPTION).toBe(
      'Every RUN APPAREL garment in 3D. Turn it, check how it is made and see the print before a sample ships.',
    )
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

  it('prefixes a filtered view with its family and keeps the rest', () => {
    expect(productsDescription('Outerwear')).toBe(
      `Outerwear from RUN APPAREL. ${PRODUCTS_DESCRIPTION}`,
    )
  })
})
