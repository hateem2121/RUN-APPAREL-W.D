import { describe, expect, it } from 'vitest'
import { FEATURE_NOTES, FIBRE_NOTES, FIT_NOTES, specNote, weightNote } from './specNotes'
import { noteKey } from './specs'

const ALL = { fibre: FIBRE_NOTES, fit: FIT_NOTES, feature: FEATURE_NOTES }

/**
 * British forms in a US-English site (polish F15): the ones the garment data held until
 * 2026-10-04, and the -ise stems the read-only scans looked for. A note must not bring one back.
 * The -ise list is of stems, not the ending: "exercise" and "advertise" are US spellings too.
 */
const BRITISH =
  /\b(colour\w*|fibre\w*|centre\w*|odour\w*|armour\w*|\w*panell\w*|elasticated|trouser\w*|modell\w*|grey|(?:optim|organ|custom|personal|minim|maxim|special|recogn|real|priorit|util|stabil|standard|summar|visual|character|harmon|final|categor|emphas|neutral|sanit|energ|modern)is(?:e|ed|es|ing|ation)\b)/i

describe('the notes', () => {
  for (const [name, notes] of Object.entries(ALL)) {
    it(`${name}: every note is one short plain sentence, in US spelling`, () => {
      for (const [key, note] of Object.entries(notes)) {
        expect(note, key).toMatch(/^[A-Z0-9][^\n]*\.$/)
        expect(note.length, key).toBeLessThanOrEqual(90)
        expect(note, key).not.toMatch(BRITISH)
        expect(note, key).not.toMatch(/\bopaque\b/i) // "not see-through": plain words for a buyer
      }
    })
    it(`${name}: every key is already in the form noteKey looks up`, () => {
      for (const key of Object.keys(notes)) expect(noteKey(key), key).toBe(key)
    })
  }
  it('spells out each abbreviation where it is used', () => {
    for (const note of Object.values(FEATURE_NOTES)) {
      if (/\bDWR\b/.test(note)) expect(note).toContain('durable water-repellent (DWR)')
      if (/\bDTF\b/.test(note)) expect(note).toMatch(/direct-to-film \(DTF\)/i)
    }
  })
})

describe('weightNote', () => {
  it('bands a fabric by the middle of its range', () => {
    expect(weightNote('40–70 GSM')).toBe(
      'How heavy the fabric is, in grams per square meter: very light and thin.',
    )
    expect(weightNote('140–180 GSM')).toContain(': light, an easy layer.')
    expect(weightNote('160–220 GSM')).toContain(': mid-weight, solid yet easy to move in.')
    expect(weightNote('250 GSM')).toContain(': heavier, sturdy and hard-wearing.')
    expect(weightNote('320–440 GSM')).toContain(': heavy and thick, for warmth.')
  })
  it('puts a range on the side of its middle, at each band edge', () => {
    expect(weightNote('110–129 GSM')).toContain('very light') // middle 119.5
    expect(weightNote('110–130 GSM')).toContain(': light') // middle 120
    expect(weightNote('200–260 GSM')).toContain('heavier') // middle 230
    expect(weightNote('280–320 GSM')).toContain(': heavy and thick') // middle 300
  })
  it('says thickness for neoprene and leather, and grams of padding for insulation', () => {
    expect(weightNote('3 mm neoprene (about 700 g/m²)')).toMatch(/^Neoprene is sold by thickness/)
    expect(weightNote('1.2 mm thickness')).toMatch(/^Measured by thickness/)
    expect(weightNote('40–60 GSM insulation')).toMatch(/^The weight of the padding inside/)
  })
  it('has nothing to say about a weight with no grams in it', () => {
    expect(weightNote('')).toBeNull()
    expect(weightNote('GSM to your spec')).toBeNull()
    expect(weightNote('Medium')).toBeNull()
  })
})

describe('specNote', () => {
  it('looks a bullet up in its own group’s glossary', () => {
    expect(specNote('fabric', '85% Recycled Polyester')).toBe(FIBRE_NOTES['recycled polyester'])
    expect(specNote('fabric', 'Lining: 100% Polyester Taffeta')).toBe(
      FIBRE_NOTES['polyester taffeta'],
    )
    expect(specNote('fit', 'Contoured, masculine-specific cut')).toBe(
      FIT_NOTES['contoured, masculine-specific cut'],
    )
    expect(specNote('performance', 'Odor-resistant moisture wicking')).toBe(
      FEATURE_NOTES['odor-resistant moisture wicking'],
    )
    expect(specNote('weight', '180–220 GSM')).toBe(weightNote('180–220 GSM'))
  })
  it('keeps the groups apart: a feature that is also a fibre gets the feature’s own line', () => {
    expect(specNote('performance', '100% recycled polyester')).toBe(
      FEATURE_NOTES['recycled polyester'],
    )
    expect(specNote('performance', '100% recycled polyester')).not.toBe(
      FIBRE_NOTES['recycled polyester'],
    )
  })
  it('gives null for a term the glossary does not have', () => {
    expect(specNote('performance', 'Glow-in-the-dark piping')).toBeNull()
    expect(specNote('fit', 'Odor-resistant moisture wicking')).toBeNull()
  })
})
