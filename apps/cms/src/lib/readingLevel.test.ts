import { describe, expect, it } from 'vitest'
import { readability, syllablesIn } from './readingLevel'

/**
 * FA-I-11 — the instrument, proved BOTH WAYS before it is pointed at the site.
 *
 * The rendered half lives in `apps/cms/e2e/typography.spec.ts`, which applies this to the
 * real pages in a browser. This file's whole job is to show that the number MOVES: a
 * ceiling on a score that cannot rise is the same class of gate as the three GPU
 * harnesses this repo shipped that reported clean while measuring nothing.
 */

describe('syllablesIn', () => {
  it.each([
    ['a', 1],
    ['the', 1],
    ['sketch', 1],
    ['garment', 2],
    ['reference', 3],
    ['manufacturing', 5],
  ])('%s -> %i', (word, count) => {
    expect(syllablesIn(word)).toBe(count)
  })

  it('is honest about being a heuristic — these three are WRONG, and measured', () => {
    // Not assumed: run against the implementation 2026-09-07. `area` and `idea` are
    // three syllables to a reader and two here; `being` is two and comes back one,
    // because the `-ing` leaves one vowel group. Recorded rather than patched — the
    // metric is only ever read in aggregate, and a special case per word is how a proxy
    // quietly becomes a lookup table. If one of these ever starts coming out right, this
    // fails, which is the point: the heuristic changed and every ceiling moved with it.
    expect(syllablesIn('area')).toBe(2)
    expect(syllablesIn('idea')).toBe(2)
    expect(syllablesIn('being')).toBe(1)
  })
})

describe('readability', () => {
  const PLAIN =
    'Send what you have. A sketch is enough. We reply within two business days. ' +
    'Tell us the styles and how many you need.'

  const DENSE =
    'Our vertically integrated manufacturing infrastructure facilitates the ' +
    'comprehensive optimisation of production methodologies across heterogeneous ' +
    'apparel categories, thereby substantiating an operational differentiation that ' +
    'materially advantages internationally distributed procurement organisations ' +
    'pursuing sustainable competitive advantage in performance textiles.'

  it('scores plain copy plainly', () => {
    const result = readability(PLAIN)
    expect(result).not.toBeNull()
    expect(result?.grade).toBeLessThan(6)
    expect(result?.ease).toBeGreaterThan(75)
  })

  it('THE NEGATIVE CONTROL — dense copy scores far worse, so the ceiling can fail', () => {
    const plain = readability(PLAIN)
    const dense = readability(DENSE)
    expect(dense).not.toBeNull()
    // Not "greater than plain" — a real separation, in the direction the ceiling is set.
    expect(dense?.grade, 'the grade did not rise on deliberately dense prose').toBeGreaterThan(20)
    expect(dense?.ease, 'reading ease did not fall on deliberately dense prose').toBeLessThan(20)
    expect((dense?.grade ?? 0) - (plain?.grade ?? 0)).toBeGreaterThan(15)
  })

  it('one long sentence and the same words as several score differently', () => {
    const joined = 'We make it here and we finish it here and we ship it from here.'
    const split = 'We make it here. We finish it here. We ship it from here.'
    expect((readability(joined)?.grade ?? 0) > (readability(split)?.grade ?? 0)).toBe(true)
  })

  it('refuses to score what it cannot score, rather than returning zero', () => {
    // A gallery of mono chips is exactly this: labels, no sentences. Returning 0 would
    // read as "perfectly plain" and pass every ceiling.
    expect(readability('')).toBeNull()
    expect(readability('Outerwear')).toBeNull()
    expect(readability('   \n  ')).toBeNull()
  })

  it('does not split a sentence on a decimal or an abbreviation', () => {
    const text = 'We ship 1.5 million pieces a year. Ask us for the current figure.'
    expect(readability(text)?.sentences).toBe(2)
  })
})
