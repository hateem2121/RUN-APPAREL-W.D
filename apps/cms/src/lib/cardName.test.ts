import { describe, expect, it } from 'vitest'
import { nameSegments } from './cardName'

describe('nameSegments — the words of a garment name, hyphenated ones kept whole', () => {
  it('marks each hyphenated word, and only those', () => {
    expect(nameSegments('CLASSIC V-NECK ZIP-UP TEE')).toEqual([
      { text: 'CLASSIC', whole: false, at: 0 },
      { text: ' ', whole: false, at: 7 },
      { text: 'V-NECK', whole: true, at: 8 },
      { text: ' ', whole: false, at: 14 },
      { text: 'ZIP-UP', whole: true, at: 15 },
      { text: ' ', whole: false, at: 21 },
      { text: 'TEE', whole: false, at: 22 },
    ])
  })

  it('gives back exactly the name it was given, spaces included', () => {
    for (const name of [
      'METRO-SHIELD  WINDBREAKER',
      ' Velocity Performance Tee ',
      'Compression-Tights-Performance-Pro',
      '',
    ]) {
      expect(
        nameSegments(name)
          .map((segment) => segment.text)
          .join(''),
      ).toBe(name)
    }
  })

  it('leaves a spaced dash and a hyphen at the edge of a word alone', () => {
    expect(nameSegments('TEE - BLACK').filter((segment) => segment.whole)).toEqual([])
    expect(nameSegments('-PRO PRO-').filter((segment) => segment.whole)).toEqual([])
  })

  it('gives every segment its own key', () => {
    const keys = nameSegments('A-B C-D E').map((segment) => segment.at)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
