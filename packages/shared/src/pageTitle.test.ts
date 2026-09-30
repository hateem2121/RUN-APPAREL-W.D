import { describe, expect, it } from 'vitest'
import { garmentPageTitle, PAGE_TITLE_MAX } from './pageTitle'

/**
 * The garment page's `<title>`, the line a search result shows in blue (2026-09-30).
 *
 * Measured that day on the 40 live garments: every name is a brand name ("MINECUT MOTION",
 * "TIGER TAIL PROFLEX"), so no title said what the garment IS, and a buyer searching
 * "tennis dress manufacturer" had nothing to match. The owner chose to add a plain garment
 * type per product and approved the format `NAME — Garment Type, Colour | RUN APPAREL`.
 */
const base = {
  productName: 'MINECUT MOTION',
  productCode: 'R-MM',
  garmentType: "Women's Tennis Dress",
  colour: 'Blush',
  brand: 'RUN APPAREL',
}

describe('garmentPageTitle', () => {
  it('says the name, what the garment is, the colour and the brand', () => {
    expect(garmentPageTitle(base)).toBe(
      "MINECUT MOTION — Women's Tennis Dress, Blush | RUN APPAREL",
    )
  })

  it('keeps the code-led title for a garment with no type yet, so nothing regresses', () => {
    expect(garmentPageTitle({ ...base, garmentType: '' })).toBe(
      'R-MM MINECUT MOTION — Blush | RUN APPAREL',
    )
    expect(garmentPageTitle({ ...base, garmentType: '   ' })).toBe(
      'R-MM MINECUT MOTION — Blush | RUN APPAREL',
    )
  })

  /*
   * A result shows about 60 characters and cuts the rest. The brand is the part worth
   * losing: it is in the address and the site name beside every result. The garment type
   * is the part a searcher matches on, so it is never the thing dropped.
   */
  it('drops the brand, never the garment type, when the whole title would be cut', () => {
    const long = garmentPageTitle({
      ...base,
      productName: 'THE KINETIC MATRIX JACKET',
      garmentType: "Men's Softshell Jacket",
      colour: 'Yellow',
    })
    expect(long).toBe("THE KINETIC MATRIX JACKET — Men's Softshell Jacket, Yellow")
    expect(long.length).toBeLessThanOrEqual(PAGE_TITLE_MAX)
    // Exactly at the limit keeps the brand; one over loses it.
    const fits = garmentPageTitle({
      ...base,
      productName: 'A'.repeat(18),
      garmentType: 'Tee',
      colour: 'Red',
    })
    expect(fits.endsWith('| RUN APPAREL')).toBe(true)
  })

  it('does not repeat a type the name already says', () => {
    // "WOMEN’S ATHLETIC TENNIS DRESS — Women's Tennis Dress" would say it twice.
    expect(
      garmentPageTitle({
        ...base,
        productName: 'GEOVENT TENNIS DRESS',
        garmentType: 'Tennis Dress',
        colour: 'Ash',
      }),
    ).toBe('GEOVENT TENNIS DRESS — Ash | RUN APPAREL')
    expect(
      garmentPageTitle({
        ...base,
        productName: 'Endurance Tracksuit',
        garmentType: "Men's Tracksuit",
      }),
    ).toBe("Endurance Tracksuit — Men's Tracksuit, Blush | RUN APPAREL")
  })

  it('never ends on a dangling separator, whatever is missing', () => {
    expect(garmentPageTitle({ ...base, colour: '' })).toBe(
      "MINECUT MOTION — Women's Tennis Dress | RUN APPAREL",
    )
    expect(garmentPageTitle({ ...base, colour: '', garmentType: '' })).toBe(
      'R-MM MINECUT MOTION | RUN APPAREL',
    )
    expect(garmentPageTitle({ ...base, brand: '' })).toBe(
      "MINECUT MOTION — Women's Tennis Dress, Blush",
    )
    expect(garmentPageTitle({ ...base, productCode: '', garmentType: '' })).toBe(
      'MINECUT MOTION — Blush | RUN APPAREL',
    )
  })

  it('tolerates a payload from before the field existed', () => {
    const old = { ...base, garmentType: undefined as unknown as string }
    expect(garmentPageTitle(old)).toBe('R-MM MINECUT MOTION — Blush | RUN APPAREL')
  })
})
