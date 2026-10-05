import { describe, expect, it } from 'vitest'
import { resolveAskedGarment } from './askAboutGarment'
import type { ProductCard } from './projectPublic'

/**
 * "Ask about this garment" (polish S10): the contact page opens with the garment and colour a
 * garment page sent, looked up among the published garments.
 *
 * What would have to break for these to fail: the form showing words from the address instead of
 * the catalogue's (an edited link could then put anything into it), a draft or an unknown colour
 * being named, or the message, subject or way back drifting from the garment asked about.
 */

const card = (slug: string, code: string, name: string, colours: [string, string][]) =>
  ({
    slug,
    productName: name,
    productCode: code,
    category: 'Sportswear',
    garmentType: '',
    shortDescription: '',
    posterUrl: null,
    posterAlt: '',
    defaultColourSlug: colours[0]?.[0] ?? '',
    colourNames: colours.map(([, colourName]) => colourName),
    colours: colours.map(([colourSlug, colourName]) => ({
      slug: colourSlug,
      name: colourName,
      swatch: null,
      image: null,
    })),
    updatedAt: null,
    model: null,
  }) satisfies ProductCard

const CARDS = [
  card('rxps', 'RXPS', 'Race X Pro Skinsuit', [
    ['wine', 'Wine'],
    ['black', 'Black'],
  ]),
  card('r-cch', 'R-CCH', 'Coach Jacket', [['navy', 'Navy']]),
]

describe('resolveAskedGarment', () => {
  it('names the garment, its code and the asked colour from the catalogue', () => {
    expect(resolveAskedGarment({ garment: 'rxps', colour: 'black' }, CARDS)).toEqual({
      productName: 'Race X Pro Skinsuit',
      productCode: 'RXPS',
      colourName: 'Black',
      href: '/products/rxps/black',
      message: 'I am interested in Race X Pro Skinsuit (RXPS) in Black.\n\n',
      subject: 'Race X Pro Skinsuit (RXPS) / Black',
    })
  })

  it('opens an empty form for a garment or colour the catalogue does not publish', () => {
    expect(resolveAskedGarment({ garment: 'draft-only', colour: 'wine' }, CARDS)).toBeNull()
    // A colour of ANOTHER garment is not this garment's colour.
    expect(resolveAskedGarment({ garment: 'rxps', colour: 'navy' }, CARDS)).toBeNull()
    expect(resolveAskedGarment({}, CARDS)).toBeNull()
    expect(resolveAskedGarment({ garment: 'rxps', colour: 'wine' }, [])).toBeNull()
  })

  it('never shows words from the address: only a slug is read, and only the catalogue is shown', () => {
    const asked = resolveAskedGarment({ garment: 'RXPS', colour: '<b>Wine</b>' }, CARDS)
    // Tidied to slugs ("rxps", "b-wine-b") the way a QR typo is: "b-wine-b" is no colour of RXPS.
    expect(asked).toBeNull()
    expect(resolveAskedGarment({ garment: ' RXPS ', colour: 'Wine' }, CARDS)?.colourName).toBe(
      'Wine',
    )
  })
})
