import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIVE_PRODUCTS } from '../../../../scripts/live-products.mjs'
import { LONG_WORD, SOFT_HYPHEN, SYLLABLES, softHyphenate, syllableBreaks } from './softHyphenate'

/**
 * SZ-06 — soft hyphens for the colourway rail's label.
 *
 * Measured live 2026-09-17 on all 80 pages: 50 of 400 labels broke INSIDE a word at 390px
 * ("TERRACO" / "TTA") and 70 at 320px. A soft hyphen gives the line a syllable to end on.
 * `|` marks a soft hyphen in the expectations below, so a real hyphen stays visible.
 */
const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const marked = (text: string) => text.split(SOFT_HYPHEN).join('|')

/** Every word of `LONG_WORD` letters or more in `texts`, lower-cased, de-duplicated, sorted. */
const longWords = (texts: string[]) =>
  [
    ...new Set(
      texts
        .flatMap((text) => text.match(/[A-Za-z]+/g) ?? [])
        .filter((word) => word.length >= LONG_WORD)
        .map((word) => word.toLowerCase()),
    ),
  ].sort()

/**
 * Syllables longer than the rule below allows, because each is one sound. On the narrowest
 * phones the rail's `overflow-wrap: anywhere` still breaks these two, as it did before.
 */
const ONE_SOUND = ['chest', 'quoise']

describe('softHyphenate (SZ-06)', () => {
  it('uses U+00AD, and leaves words under seven letters alone', () => {
    expect(SOFT_HYPHEN.codePointAt(0)).toBe(0xad)
    expect(SOFT_HYPHEN).toHaveLength(1)
    expect(LONG_WORD).toBe(7)
    for (const label of ['Powder Blue / Sky', 'Pebble / Optic White', 'Wine / Black', 'Citron']) {
      expect(softHyphenate(label)).toBe(label)
    }
  })

  it('breaks the live labels at their syllables and keeps their case', () => {
    expect(marked(softHyphenate('Terracotta / Blush'))).toBe('Ter|ra|cotta / Blush')
    expect(marked(softHyphenate('Lavender / Indigo'))).toBe('Lav|en|der / Indigo')
    expect(marked(softHyphenate('Magenta / Burgundy'))).toBe('Ma|genta / Bur|gundy')
    expect(marked(softHyphenate('Tangerine / Rust'))).toBe('Tan|ger|ine / Rust')
    expect(marked(softHyphenate('TURQUOISE'))).toBe('TUR|QUOISE')
    expect(marked(softHyphenate('turquoise'))).toBe('tur|quoise')
  })

  it('never changes a letter: without the soft hyphens the label is the input', () => {
    const labels = [
      ...Object.keys(SYLLABLES),
      'Terracotta / Blush',
      'Cranberry',
      'Constructor',
      'Pantone 2945C',
      'Écarlate',
    ]
    for (const label of labels) {
      expect(softHyphenate(label).split(SOFT_HYPHEN).join('')).toBe(label)
    }
  })

  /**
   * ⚠️ THE LENGTH RULE IS A MEASUREMENT, NOT TASTE. At 320px the label box holds five mono
   * cells in WebKit and six in Chromium (by one layout unit), and Chromium breaks INSIDE a
   * syllable when no soft hyphen fits a line, hyphen included (measured 2026-09-17 in
   * Chromium, Firefox and WebKit). A non-final syllable of four letters plus its hyphen
   * always fits five cells; a last one of five does too.
   */
  it.each(Object.entries(SYLLABLES))(
    'splits %s only where a 320px line can end (%s)',
    (word, split) => {
      const pieces = split.split('-')
      expect(pieces.join(''), 'an entry must spell its own key').toBe(word)
      expect(pieces.length, 'an entry with no break point does nothing').toBeGreaterThan(1)
      expect(
        pieces[0]!.length,
        'at least two letters before the first break',
      ).toBeGreaterThanOrEqual(2)
      expect(
        pieces.at(-1)!.length,
        'at least three letters after the last break',
      ).toBeGreaterThanOrEqual(3)
      pieces.forEach((piece, index) => {
        const limit = index === pieces.length - 1 ? 5 : 4
        if (piece.length > limit) {
          expect(ONE_SOUND, `"${piece}" in ${word} is longer than a 320px line allows`).toContain(
            piece,
          )
        }
      })
      expect(syllableBreaks(word)).toHaveLength(pieces.length - 1)
    },
  )

  it.each([
    ['Cranberry', 'Cran|berry'],
    ['Periwinkle', 'Peri|winkle'],
    ['Aquamarine', 'Aqua|marine'],
    ['Champagne', 'Cham|pagne'],
    ['Midnight', 'Mid|night'],
    ['Sandstone', 'Sand|stone'],
    ['Chartreuse', 'Char|treuse'],
    ['Buttercream', 'Butter|cream'],
    ['Watermelon', 'Water|melon'],
    ['Mackerel', 'Mack|erel'],
    ['Constructor', 'Cons|truc|tor'],
  ])('breaks %s, which it has no entry for, at a syllable: %s', (word, expected) => {
    expect(Object.hasOwn(SYLLABLES, word.toLowerCase())).toBe(false)
    expect(marked(softHyphenate(word))).toBe(expected)
  })

  it.each(['Rhythms', 'Strengths', 'Écarlate'])(
    'leaves %s alone, having no safe place to break it',
    (word) => {
      expect(syllableBreaks(word)).toEqual([])
      expect(softHyphenate(word)).toBe(word)
    },
  )

  it('breaks the letters of a label that also holds digits', () => {
    expect(marked(softHyphenate('Pantone 2945C'))).toBe('Pan|tone 2945C')
  })
})

describe('the dictionary keeps up with the words the rail can show (SZ-06 drift)', () => {
  it('carries every 7+ letter word in the pipeline colour palette', () => {
    const source = readFileSync(
      join(REPO, 'tools', 'asset-pipeline', 'src', 'colour-name.ts'),
      'utf8',
    )
    const names = [...source.matchAll(/\{ name: '([^']+)', hex: '#[0-9A-Fa-f]{6}' \}/g)].map(
      (match) => match[1] ?? '',
    )
    // The control: the palette was read at all — 54 names on 2026-09-17, Terracotta among them.
    expect(names.length, 'the palette pattern matched almost nothing').toBeGreaterThanOrEqual(50)
    expect(names).toContain('Terracotta')
    const missing = longWords(names).filter((word) => !Object.hasOwn(SYLLABLES, word))
    expect(
      missing,
      'tools/asset-pipeline/src/colour-name.ts gained a long word with no entry in SYLLABLES',
    ).toEqual([])
  })

  it('carries every 7+ letter word in a live colourway slug', () => {
    const words = longWords(
      LIVE_PRODUCTS.flatMap((product) =>
        product.colourways.map((slug) => slug.replaceAll('-', ' ')),
      ),
    )
    // The control: eight such words on 2026-09-17, one of them missing from the palette.
    expect(words).toContain('lavender')
    expect(words.length).toBeGreaterThanOrEqual(8)
    const missing = words.filter((word) => !Object.hasOwn(SYLLABLES, word))
    expect(
      missing,
      'a live colourway uses a long word with no entry in SYLLABLES (scripts/live-products.mjs)',
    ).toEqual([])
  })
})
