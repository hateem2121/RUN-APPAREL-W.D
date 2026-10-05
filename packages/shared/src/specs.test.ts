import { describe, expect, it } from 'vitest'
import { fabricParts, noteKey, specGroups } from './specs'

describe('fabricParts', () => {
  it('splits a composition at each spaced slash, one bullet per part', () => {
    expect(fabricParts('85% Recycled Polyester / 15% Spandex')).toEqual([
      '85% Recycled Polyester',
      '15% Spandex',
    ])
    expect(fabricParts('Shell: 100% Polyester Taslon / Lining: 100% Polyester Taffeta')).toEqual([
      'Shell: 100% Polyester Taslon',
      'Lining: 100% Polyester Taffeta',
    ])
  })
  it('keeps a slash with no spaces inside its part, and drops empty parts', () => {
    expect(fabricParts('100% Poly/Cotton Blend')).toEqual(['100% Poly/Cotton Blend'])
    expect(fabricParts('  100% Nylon  /  ')).toEqual(['100% Nylon'])
    expect(fabricParts('')).toEqual([])
  })
})

describe('noteKey', () => {
  it('drops case, percentages and a "Shell:"-style label, so garments share one note', () => {
    expect(noteKey('85% Recycled Polyester')).toBe('recycled polyester')
    expect(noteKey('100% Recycled Polyester')).toBe('recycled polyester')
    expect(noteKey('Lining: 100% Polyester Taffeta')).toBe('polyester taffeta')
    expect(noteKey('Odor-resistant  moisture wicking')).toBe('odor-resistant moisture wicking')
  })
  it('keeps numbers that are not percentages', () => {
    expect(noteKey('1.2 mm cowhide leather')).toBe('1.2 mm cowhide leather')
    expect(noteKey('Lightweight 80–100 GSM build')).toBe('lightweight 80–100 gsm build')
    expect(noteKey('22-panel faceted construction')).toBe('22-panel faceted construction')
  })
})

const GARMENT = {
  fabricComposition: '90% Polyester / 10% Spandex',
  gsm: '180–220 GSM',
  garmentFit: 'Flexible compression fit',
  performanceFeatures: ['Breathable mesh panels', ' Flatlock stitching '],
}

describe('specGroups', () => {
  it('gives the four groups in corner order, each item with its words', () => {
    const groups = specGroups(GARMENT)
    expect(groups.map((group) => [group.key, group.heading])).toEqual([
      ['fabric', 'Fabric'],
      ['weight', 'Weight'],
      ['fit', 'Fit'],
      ['performance', 'Performance'],
    ])
    expect(groups.map((group) => group.items.map((item) => item.text))).toEqual([
      ['90% Polyester', '10% Spandex'],
      ['180–220 GSM'],
      ['Flexible compression fit'],
      ['Breathable mesh panels', 'Flatlock stitching'],
    ])
    expect(groups.flatMap((group) => group.items).every((item) => item.note === null)).toBe(true)
  })
  it('leaves out a group with nothing in it (R-PRS has no fit)', () => {
    const groups = specGroups({ ...GARMENT, garmentFit: '  ', performanceFeatures: ['', ' '] })
    expect(groups.map((group) => group.key)).toEqual(['fabric', 'weight'])
  })
  it('asks for each note with the group and the bullet’s words', () => {
    const asked: string[] = []
    const groups = specGroups(GARMENT, (group, text) => {
      asked.push(`${group}:${text}`)
      return group === 'fit' ? 'Snug.' : null
    })
    expect(asked).toEqual([
      'fabric:90% Polyester',
      'fabric:10% Spandex',
      'weight:180–220 GSM',
      'fit:Flexible compression fit',
      'performance:Breathable mesh panels',
      'performance:Flatlock stitching',
    ])
    expect(groups[2]?.items[0]?.note).toBe('Snug.')
  })
})

/*
 * GitHub's code scan (CodeQL, js/polynomial-redos, on PR #128) flagged both splitters: a
 * pattern that starts with `\s+` or `\d+` and then fails re-scans the same run from every
 * position, so a long run of spaces or digits takes quadratic time. The CMS text these read is
 * typed by a person, but the scan blocks the merge, and a linear pattern costs nothing.
 */
describe('long runs stay fast (code scan, 2026-10-05)', () => {
  const RUN = 50_000
  const timed = (work: () => unknown) => {
    const start = Date.now()
    work()
    return Date.now() - start
  }

  it('fabricParts reads a long run of spaces in linear time', () => {
    expect(timed(() => fabricParts(`a${' '.repeat(RUN)}b`))).toBeLessThan(50)
  })

  it('noteKey reads a long run of digits in linear time', () => {
    expect(timed(() => noteKey('0'.repeat(RUN)))).toBeLessThan(50)
  })
})
