import { describe, expect, it } from 'vitest'
import {
  CATEGORY_PAGE_PATHS,
  categoryPath,
  familySlug,
  seeAllInCategoryLabel,
} from './categoryPages'
import { GARMENT_PATH_PREFIX } from './slugs'

describe('categoryPath', () => {
  it('sends each category that has a page to that page', () => {
    expect(categoryPath('Teamwear & Uniforms')).toBe('/custom-teamwear-manufacturer')
    expect(categoryPath('Sportswear')).toBe('/custom-activewear-manufacturer')
    expect(categoryPath('Outerwear')).toBe('/custom-outerwear-manufacturer')
    expect(categoryPath('Casual Wear')).toBe('/private-label-casual-wear-manufacturer')
  })

  it('sends a category with no page to its group on the products page (polish S1)', () => {
    expect(categoryPath('Sports Accessories')).toBe('/products#sports-accessories')
  })

  it('never sends anyone to the old family filter, which now forwards (polish S3)', () => {
    for (const category of [...Object.keys(CATEGORY_PAGE_PATHS), 'Sports Accessories']) {
      expect(categoryPath(category), category).not.toContain('?family=')
    }
  })

  it('reads the category the way the CMS may send it, with stray spaces', () => {
    expect(categoryPath(' Outerwear ')).toBe('/custom-outerwear-manufacturer')
  })

  it('never names a page under /products/, which the garment pages answer', () => {
    // apps/cms/src/lib/familyPages.ts: a page there would be answered as a missing garment.
    for (const path of Object.values(CATEGORY_PAGE_PATHS)) {
      expect(path.startsWith(`${GARMENT_PATH_PREFIX}/`), path).toBe(false)
      expect(path.startsWith('/'), path).toBe(true)
    }
  })
})

describe('seeAllInCategoryLabel (polish S6)', () => {
  it('names the link in the owner’s approved words, lower-cased from the category', () => {
    expect(seeAllInCategoryLabel('Teamwear & Uniforms')).toBe('See all teamwear & uniforms in 3D')
    expect(seeAllInCategoryLabel(' Casual Wear ')).toBe('See all casual wear in 3D')
  })
})

describe('familySlug', () => {
  it('spells a category the way the website spells its family', () => {
    expect(familySlug('Teamwear & Uniforms')).toBe('teamwear-uniforms')
    expect(familySlug('Casual Wear')).toBe('casual-wear')
  })
})
