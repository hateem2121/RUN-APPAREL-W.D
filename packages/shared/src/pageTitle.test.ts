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

  /*
   * 2026-11-15: 22 of the 42 sitemap garment pages had titles over 60 (fetched as Googlebot that
   * day, the longest 87). The owner chose: on the MAIN colour's page (the one in the sitemap) drop
   * the colour when the title is too long, and keep the brand if it then fits; every other colour's
   * page keeps its colour, so no two colour pages share one title (Google's "Influencing your title
   * links" counts titles that differ in nothing as boilerplate).
   */
  it('on the main colour’s page, drops the colour of a title too long, before the brand', () => {
    const aggressor = {
      ...base,
      productName: 'THE AGGRESSOR JERSEY MEN',
      garmentType: "Men's American Football Jersey",
      colour: 'Grass Court / Croquet Mint',
    }
    const main = garmentPageTitle({ ...aggressor, isDefaultColour: true })
    expect(main).toBe("THE AGGRESSOR JERSEY MEN — Men's American Football Jersey")
    expect(main.length).toBeLessThanOrEqual(PAGE_TITLE_MAX)
    // Another colour's page keeps its colour, so the two titles differ. Over 60 even without the
    // brand (84 here), it loses the TYPE instead (owner, 15 Nov evening): AC-11 needs every colour
    // page's title to be its own, which losing the colour would break.
    const other = garmentPageTitle(aggressor)
    expect(other).toBe('THE AGGRESSOR JERSEY MEN — Grass Court / Croquet Mint')
    expect(other.length).toBeLessThanOrEqual(PAGE_TITLE_MAX)
    expect(other).not.toBe(main)
    // Without the type the brand fits again, so it comes back (66 with the type, no brand).
    expect(
      garmentPageTitle({
        ...aggressor,
        productName: 'THE AGGRESSOR JERSEY',
        colour: 'Rally Coral',
      }),
    ).toBe('THE AGGRESSOR JERSEY — Rally Coral | RUN APPAREL')
    // A colour page whose title fits without the brand keeps its type, as before.
    expect(
      garmentPageTitle({ ...aggressor, productName: 'THE AGGRESSOR', colour: 'Rally Coral' }),
    ).toBe("THE AGGRESSOR — Men's American Football Jersey, Rally Coral")
    // Without its colour the brand fits again: kept, exactly at 60.
    const beeflex = garmentPageTitle({
      ...base,
      productName: 'BEEFLEX COURT DRESS',
      garmentType: 'Tennis Bra and Skirt Set',
      colour: 'Play Magenta',
      isDefaultColour: true,
    })
    expect(beeflex).toBe('BEEFLEX COURT DRESS — Tennis Bra and Skirt Set | RUN APPAREL')
    expect(beeflex.length).toBe(PAGE_TITLE_MAX)
    // A main colour whose whole title fits keeps everything.
    expect(garmentPageTitle({ ...base, isDefaultColour: true })).toBe(
      "MINECUT MOTION — Women's Tennis Dress, Blush | RUN APPAREL",
    )
    // No type yet: the code-led title loses its colour the same way.
    expect(
      garmentPageTitle({
        ...aggressor,
        garmentType: '',
        productName: 'X'.repeat(50),
        isDefaultColour: true,
      }),
    ).toBe(`R-MM ${'X'.repeat(50)}`)
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
