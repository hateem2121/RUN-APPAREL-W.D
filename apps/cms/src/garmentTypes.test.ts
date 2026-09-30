import { garmentPageTitle, PAGE_TITLE_BRAND } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import {
  fixedColourRows,
  fixSpelling,
  GARMENT_TYPES,
  NAME_FIX,
  plannedType,
} from '../../../scripts/apply-garment-types.mjs'
import { findBritishSpellings } from '../../../scripts/copy-rules.mjs'
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'

/**
 * The owner-approved garment types (2026-09-30), checked before anything is written to the
 * CMS. The list is what every garment page's title will say the garment IS, so a gap, a
 * British spelling or a type too long to show would be live on 205 pages at once.
 */
const entries = Object.entries(GARMENT_TYPES)

describe('the approved garment types', () => {
  it('cover every live garment, and nothing that is not live', () => {
    const live = LIVE_PRODUCTS.map((p) => p.slug).sort()
    expect(entries.map(([slug]) => slug).sort()).toEqual(live)
  })

  it('each fit the field (60 characters) and carry no stray space', () => {
    for (const [slug, type] of entries) {
      expect(type.length, `${slug}: "${type}"`).toBeLessThanOrEqual(60)
      expect(type, slug).toBe(type.trim())
      expect(type, slug).not.toMatch(/\s{2,}/)
    }
  })

  it('use American spelling, like the rest of the site', () => {
    for (const [slug, type] of entries) {
      expect(findBritishSpellings(type), `${slug}: "${type}"`).toEqual([])
    }
  })

  /*
   * The point of the whole change, measured on the real list: a title built from each
   * type names the garment, fits what a result shows, and keeps the type when it must
   * drop something. The longest live names are the ones that would push it out.
   */
  it('each produce a title that still says the type when the brand has to go', () => {
    const names: Record<string, string> = {
      'r-kmj': 'THE KINETIC MATRIX JACKET',
      'r-wsa': 'WOMEN’S ATHLETIC TENNIS DRESS',
      'r-cvn': 'CHEVRON V-NECK SOCCER JERSEY',
      'r-ajm': 'THE AGGRESSOR JERSEY MEN',
    }
    for (const [slug, productName] of Object.entries(names)) {
      const type = GARMENT_TYPES[slug] ?? ''
      const title = garmentPageTitle({
        productName,
        productCode: slug.toUpperCase(),
        garmentType: type,
        colour: 'Bottle Green / Mint',
        brand: PAGE_TITLE_BRAND,
      })
      expect(title, slug).toContain(productName)
      // Either the type is in the title, or the name already says every word of it.
      const said =
        title.includes(type) || type.split(/\W+/).every((w) => new RegExp(w, 'i').test(productName))
      expect(said, `${slug}: "${title}" lost the type "${type}"`).toBe(true)
    }
  })
})

describe('plannedType — it never overwrites what the owner typed', () => {
  it('writes into an empty field, however "empty" is stored', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(plannedType(empty, 'Tennis Dress')).toBe('write')
    }
  })

  it('does nothing when the value is already the approved one', () => {
    expect(plannedType('Tennis Dress', 'Tennis Dress')).toBe('already')
    expect(plannedType(' Tennis Dress ', 'Tennis Dress')).toBe('already')
  })

  it('leaves a different value alone: that is the owner’s edit', () => {
    expect(plannedType("Girls' Tennis Dress", 'Tennis Dress')).toBe('owner-edited')
  })
})

describe('the RAGNAL → RAGLAN spelling fix', () => {
  it('is for the one garment the owner named', () => {
    expect(NAME_FIX).toEqual({ slug: 'r-srs', wrong: 'RAGNAL', right: 'RAGLAN' })
    expect(GARMENT_TYPES[NAME_FIX.slug]).toContain('Raglan')
  })

  it('corrects the word in any letter case and touches nothing else', () => {
    expect(fixSpelling('SHORT RAGNAL SLEEVE')).toBe('SHORT RAGLAN SLEEVE')
    expect(fixSpelling('Short Ragnal Sleeve in Mint')).toBe('Short Raglan Sleeve in Mint')
    expect(fixSpelling('short ragnal sleeve')).toBe('short raglan sleeve')
    expect(fixSpelling('SHORT RAGLAN SLEEVE')).toBe('SHORT RAGLAN SLEEVE')
    expect(fixSpelling(null)).toBeNull()
  })

  const rows = () => [
    {
      id: 'a1',
      slug: 'powder-blue',
      displayName: 'Powder Blue',
      altText: 'SHORT RAGNAL SLEEVE in Powder Blue',
      posterPreview: 11,
    },
    {
      id: 'b2',
      slug: 'cream',
      displayName: 'Cream',
      altText: 'SHORT RAGNAL SLEEVE in Cream',
      posterPreview: 12,
    },
    {
      id: 'c3',
      slug: 'mint',
      displayName: 'Mint',
      altText: 'A hand-written description',
      posterPreview: 13,
    },
  ]

  /*
   * ⚠️ A PATCH to an array REPLACES THE ARRAY, row order decides the default colour, and
   * each slug is printed on a QR tag. So what is sent back must be the stored rows, one
   * for one, in order, with only the description changed.
   */
  it('sends every row back in order, with its id and slug, changing only the description', () => {
    const before = rows()
    const plan = fixedColourRows(before)
    if ('refuse' in plan) throw new Error(plan.refuse)
    expect(plan.changed).toBe(2)
    expect(plan.rows.map((r) => `${r.id}:${r.slug}`)).toEqual([
      'a1:powder-blue',
      'b2:cream',
      'c3:mint',
    ])
    expect(plan.rows.map((r) => r.altText)).toEqual([
      'SHORT RAGLAN SLEEVE in Powder Blue',
      'SHORT RAGLAN SLEEVE in Cream',
      'A hand-written description',
    ])
    // Every other field rides along untouched, and the input is not mutated.
    expect(plan.rows.map((r) => r.posterPreview)).toEqual([11, 12, 13])
    expect(plan.rows.map((r) => r.displayName)).toEqual(['Powder Blue', 'Cream', 'Mint'])
    expect(before).toEqual(rows())
  })

  it('refuses rather than send rows it cannot match back to the stored ones', () => {
    expect(fixedColourRows([])).toHaveProperty('refuse')
    expect(fixedColourRows(undefined)).toHaveProperty('refuse')
    expect(fixedColourRows([{ slug: 'mint', altText: 'x' }])).toHaveProperty('refuse')
    expect(fixedColourRows([{ id: 'a1', altText: 'x' }])).toHaveProperty('refuse')
  })
})
