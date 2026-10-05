import { describe, expect, it } from 'vitest'
import {
  COLOUR_FAMILIES,
  COLOUR_NAME_MAX,
  COLOUR_NAME_STYLES,
  themedColourName,
} from './colourNames'

/**
 * Polish N1/N2 (the owner's answer Q38, 2026-10-03): every colour has a name in its category's
 * style (sport words for Teamwear, performance words for Sportswear, nature words for Outerwear,
 * easy fashion words for Casual Wear), and the same colour has the same name inside a category.
 *
 * What would have to break for these to fail: a family the pipeline's namer can answer with but
 * a style forgot (a new garment of that colour would arrive with a plain word), two colours given
 * one name in a category (two dots on one garment reading the same), a name too wide for the
 * garment page's name cell (it would run out of its box, which the viewer's layout test measures),
 * or a plain word like "Pink", which the owner ruled out on 2026-09-04.
 */

const STYLED = Object.keys(COLOUR_NAME_STYLES) as (keyof typeof COLOUR_NAME_STYLES)[]

describe('the colour-name styles (N1)', () => {
  it('has a style for each of the four categories the owner gave one, and no other', () => {
    expect(STYLED.sort()).toEqual(['Casual Wear', 'Outerwear', 'Sportswear', 'Teamwear & Uniforms'])
  })

  for (const category of STYLED) {
    const style: Record<string, string> = COLOUR_NAME_STYLES[category]
    const names = Object.values(style)

    it(`${category}: names every one of the namer's ${COLOUR_FAMILIES.length} colour families`, () => {
      expect(Object.keys(style).sort()).toEqual([...COLOUR_FAMILIES].sort())
    })

    it(`${category}: never gives two colours the same name`, () => {
      const repeated = names.filter((name, index) => names.indexOf(name) !== index)
      expect(repeated).toEqual([])
    })

    it(`${category}: every name fits the garment page's name cell (${COLOUR_NAME_MAX} characters)`, () => {
      expect(names.filter((name) => [...name].length > COLOUR_NAME_MAX)).toEqual([])
    })

    it(`${category}: every name is new, and none is a plain colour word`, () => {
      const plain = new Set(
        ['white', 'black', 'red', 'green', 'yellow', 'blue', 'brown', 'purple', 'pink', 'orange']
          .concat(['grey', 'gray'])
          .concat(COLOUR_FAMILIES.map((family) => family.toLowerCase())),
      )
      expect(names.filter((name) => plain.has(name.toLowerCase()))).toEqual([])
    })

    it(`${category}: every name is one or two capitalised words, letters only`, () => {
      expect(names.filter((name) => !/^[A-Z][a-z]+( [A-Z][a-z]+)?$/.test(name))).toEqual([])
    })
  }
})

describe('themedColourName (N2)', () => {
  it("gives a colour its category's name", () => {
    expect(themedColourName('Navy', 'Outerwear')).toBe('Midnight')
    expect(themedColourName('Powder Blue', 'Teamwear & Uniforms')).toBe('Ice Rink')
    expect(themedColourName('Powder Blue', 'Sportswear')).toBe('Ice Bath')
    expect(themedColourName('Powder Blue', 'Casual Wear')).toBe('Duck Egg')
  })

  it('names the live skinsuit rxps the way the approval list does', () => {
    // rxps is Teamwear & Uniforms; its five colours on 2026-10-05, in row order.
    expect(
      ['Wine', 'Blush', 'Butter', 'Lime', 'Black'].map((name) =>
        themedColourName(name, 'Teamwear & Uniforms'),
      ),
    ).toEqual(['Pennant', 'Rosette', 'Golden Goal', 'Tennis Ball', 'Puck'])
  })

  it('names each part of a two-fabric name, keeping the " / " between them', () => {
    expect(themedColourName('Wine / Black', 'Teamwear & Uniforms')).toBe('Pennant / Puck')
    expect(themedColourName('Olive/Sage', 'Casual Wear')).toBe('Bay Leaf / Matcha')
  })

  it('leaves the colour word alone where no style was given or the word is not a family', () => {
    // Sports Accessories has no style yet (the owner named four), so its colours keep the word.
    expect(themedColourName('Navy', 'Sports Accessories')).toBe('Navy')
    expect(themedColourName('Navy', undefined)).toBe('Navy')
    expect(themedColourName('Navy', 'Shoes')).toBe('Navy')
    // A word the owner typed is theirs, not the namer's.
    expect(themedColourName('Heather Grey', 'Outerwear')).toBe('Heather Grey')
    expect(themedColourName('', 'Outerwear')).toBe('')
  })
})
