import { describe, expect, it } from 'vitest'
import {
  FEATURE_NOTES,
  FIBRE_NOTES,
  FIT_NOTES,
  specNote,
  WEIGHT_BANDS,
  weightNote,
} from './specNotes'
import {
  ACCESSORY_HEADINGS_RU,
  FEATURE_NOTES_RU,
  FIBRE_NOTES_RU,
  FIT_NOTES_RU,
  SPEC_HEADINGS_RU,
  WEIGHT_BANDS_RU,
  WEIGHT_NOTES_RU,
} from './specNotes.ru'
import { SPEC_HEADINGS, type SpecGroupKey, specGroupLabel, specGroups } from './specs'

const PAIRS = {
  fibre: [FIBRE_NOTES, FIBRE_NOTES_RU],
  fit: [FIT_NOTES, FIT_NOTES_RU],
  feature: [FEATURE_NOTES, FEATURE_NOTES_RU],
} as const

/**
 * The only Latin words a Russian line may hold: the trade's abbreviations DWR and DTF (each
 * spelled out in Russian beside it, as the site's Russian glossary does), the V of «V-образный»,
 * and the name of the FIFA Quality Pro programme, as the site's Russian ball pages write it.
 * Any other Latin word is English left behind.
 */
const KEPT_LATIN = new Set(['DWR', 'DTF', 'V', 'FIFA', 'Quality', 'Pro'])

const EVERY_RUSSIAN_LINE: [string, string][] = [
  ...Object.values(PAIRS).flatMap(([, ru]) => Object.entries(ru)),
  ...WEIGHT_BANDS_RU.map((entry): [string, string] => [
    `band <${entry.below}`,
    WEIGHT_NOTES_RU.band(entry.band),
  ]),
  ['neoprene', WEIGHT_NOTES_RU.neoprene],
  ['thickness', WEIGHT_NOTES_RU.thickness],
  ['insulation', WEIGHT_NOTES_RU.insulation],
  ...Object.entries(SPEC_HEADINGS_RU),
  ...Object.entries(ACCESSORY_HEADINGS_RU),
]

describe('the Russian twins', () => {
  for (const [name, [en, ru]] of Object.entries(PAIRS)) {
    it(`${name}: every English key has a Russian twin, and no Russian key is spare`, () => {
      expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort())
    })
  }
  it('bands a weight at the same thresholds in both languages', () => {
    expect(WEIGHT_BANDS_RU.map((entry) => entry.below)).toEqual(
      WEIGHT_BANDS.map((entry) => entry.below),
    )
  })
  it('heads every group in Russian, for garments and for the ball', () => {
    const keys = Object.keys(SPEC_HEADINGS).sort()
    expect(Object.keys(SPEC_HEADINGS_RU).sort()).toEqual(keys)
    expect(Object.keys(ACCESSORY_HEADINGS_RU).sort()).toEqual(keys)
  })
})

describe('every Russian line', () => {
  it('is Russian, with no English word left behind', () => {
    for (const [key, line] of EVERY_RUSSIAN_LINE) {
      expect(line, key).toMatch(/[А-Яа-яЁё]/)
      for (const [word] of line.matchAll(/[A-Za-z]+/g)) {
        expect(KEPT_LATIN.has(word), `${key}: «${word}»`).toBe(true)
      }
    }
  })
  it('is one sentence ending in a full stop (headings aside), the English notes’ own rule', () => {
    for (const [key, line] of EVERY_RUSSIAN_LINE.slice(0, -8)) {
      expect(line, key).toMatch(/^[А-ЯЁ0-9V][^\n]*\.$/)
      expect(line.length, key).toBeLessThanOrEqual(110)
    }
  })
  it('keeps a dash on its word and a number on its unit (no-break spaces)', () => {
    for (const [key, line] of EVERY_RUSSIAN_LINE) {
      expect(line, key).not.toMatch(/ —/) // an ordinary space before a dash can break the line
      expect(line, key).not.toMatch(/\d (мм|г\/м²)/)
      expect(line, key).not.toMatch(/ {2}/)
    }
  })
  it('addresses the buyer as «вы», in lower case', () => {
    for (const [key, line] of EVERY_RUSSIAN_LINE) {
      expect(line, key).not.toMatch(/[\s«(]В(ы|ас|ам|ами)(?![а-яё])/)
    }
  })
  it('writes fabric weight in г/м², never GSM or grams spelled per square meter', () => {
    for (const [key, line] of EVERY_RUSSIAN_LINE) {
      expect(line, key).not.toMatch(/GSM|на квадратный метр/)
    }
    expect(FEATURE_NOTES_RU['lightweight 80–100 gsm build']).toBe(
      'Очень лёгкая ткань, 80–100 г/м².',
    )
  })
})

describe('the Russian lookup', () => {
  it('finds a bullet’s Russian line by the same key as its English one', () => {
    expect(specNote('fabric', '85% Recycled Polyester', 'ru')).toBe(
      FIBRE_NOTES_RU['recycled polyester'],
    )
    // The same words are a different term as a feature, in both languages.
    expect(specNote('performance', 'Recycled Polyester', 'ru')).toBe(
      FEATURE_NOTES_RU['recycled polyester'],
    )
    expect(specNote('fit', 'High-Support Compression', 'ru')).toBe(
      FIT_NOTES_RU['high-support compression'],
    )
    expect(specNote('performance', 'DWR Water-Repellent Finish', 'ru')).toContain('(DWR)')
  })
  it('bands a weight, and says thickness and padding, in Russian', () => {
    expect(weightNote('40–70 GSM', 'ru')).toBe(
      'Плотность — вес ткани в г/м²; эта ткань очень лёгкая и тонкая.',
    )
    expect(weightNote('320–440 GSM', 'ru')).toContain('тяжёлая и толстая')
    expect(weightNote('3 mm neoprene (about 700 g/m²)', 'ru')).toBe(WEIGHT_NOTES_RU.neoprene)
    expect(weightNote('1.2 mm thickness', 'ru')).toBe(WEIGHT_NOTES_RU.thickness)
    expect(weightNote('40–60 GSM insulation', 'ru')).toBe(WEIGHT_NOTES_RU.insulation)
    expect(weightNote('GSM to your spec', 'ru')).toBeNull()
  })
  it('falls back to the English line for a term with no Russian twin yet', () => {
    FEATURE_NOTES['test-only new term'] = 'A new English line.'
    try {
      expect(specNote('performance', 'Test-only new term', 'ru')).toBe('A new English line.')
    } finally {
      delete FEATURE_NOTES['test-only new term']
    }
    expect(specNote('performance', 'Not a known term', 'ru')).toBeNull()
  })
  it('heads the groups in Russian, the ball with its own words', () => {
    expect(specGroupLabel('weight', 'ru')).toBe('Плотность')
    expect(specGroupLabel('weight', 'ru', 'Sports Accessories')).toBe('Вес')
    expect(specGroupLabel('performance', 'ru', 'Sports Accessories')).toBe(
      'По нормам FIFA Quality Pro',
    )
  })
})

describe('the English path is unchanged', () => {
  const groups: SpecGroupKey[] = ['fabric', 'weight', 'fit', 'performance']
  it('gives every English note the same with no locale and with "en"', () => {
    for (const [group, notes] of [
      ['fabric', FIBRE_NOTES],
      ['fit', FIT_NOTES],
      ['performance', FEATURE_NOTES],
    ] as const) {
      for (const [key, note] of Object.entries(notes)) {
        expect(specNote(group, key), key).toBe(note)
        expect(specNote(group, key, 'en'), key).toBe(note)
      }
    }
    expect(weightNote('40–70 GSM', 'en')).toBe(
      'How heavy the fabric is, in grams per square meter: very light and thin.',
    )
  })
  it('heads the groups in English by default, for garments and for the ball', () => {
    expect(groups.map((key) => specGroupLabel(key))).toEqual([
      'Fabric',
      'Weight',
      'Fit',
      'Performance',
    ])
    expect(groups.map((key) => specGroupLabel(key, 'en', 'Sports Accessories'))).toEqual([
      'Materials',
      'Weight',
      'Size',
      'According to FIFA Quality Pro',
    ])
  })
  it('builds Russian groups only when asked', () => {
    const product = {
      fabricComposition: '100% Polyester',
      gsm: '140–180 GSM',
      garmentFit: 'Athletic Fit',
      performanceFeatures: ['DTF Print'],
    }
    expect(specGroups(product, specNote).map((group) => group.heading)).toEqual([
      'Fabric',
      'Weight',
      'Fit',
      'Performance',
    ])
    const ru = specGroups(product, (group, text) => specNote(group, text, 'ru'), 'ru')
    expect(ru.map((group) => group.heading)).toEqual([
      'Ткань',
      'Плотность',
      'Посадка',
      'Особенности',
    ])
    expect(ru[0]?.items[0]).toEqual({ text: '100% Polyester', note: FIBRE_NOTES_RU.polyester })
  })
})
