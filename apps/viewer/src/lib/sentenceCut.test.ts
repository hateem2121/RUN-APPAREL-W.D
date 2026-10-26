import { describe, expect, it } from 'vitest'
import { longestFittingSentences, sentenceEnds } from './sentenceCut'

/**
 * The summary above "Read more" ends at a full stop (owner, 2026-10-26, site check). The copy is
 * invented in the shape of the live R-XPS description, whose summary read "…a chamois pad in
 * sever…": a long first sentence, a second that runs past the third line, a third after it.
 */
const SKINSUIT =
  'A women’s race skinsuit in a nylon knit that stretches four ways. Compression spandex, a ' +
  'chamois pad in several densities and breathable mesh bib straps all sit under a full ' +
  'digital print. Silicone leg grippers and flatlock stitching hold you in an aero race ' +
  'position over long distances.'

/** Three lines of about 45 characters: a stand-in for the browser's own measure of the clamp. */
const THREE_LINES = 135
const fitsThreeLines = (candidate: string) => candidate.length <= THREE_LINES

describe('sentenceEnds', () => {
  it('lists the end of each sentence but the last, which is the whole text', () => {
    const ends = sentenceEnds(SKINSUIT)
    expect(ends).toHaveLength(2)
    expect(SKINSUIT.slice(0, ends[0])).toMatch(/stretches four ways\.$/)
    expect(SKINSUIT.slice(0, ends[1])).toMatch(/under a full digital print\.$/)
  })

  it('counts ? and ! and a closing quote after the mark', () => {
    const text = 'Built to race! Does it fit? “Yes.” Cut for the saddle.'
    const ends = sentenceEnds(text)
    expect(ends.map((end) => text.slice(0, end))).toEqual([
      'Built to race!',
      'Built to race! Does it fit?',
      'Built to race! Does it fit? “Yes.”',
    ])
  })

  it('does not stop at an abbreviation, an initial, a dotted token or an ellipsis', () => {
    expect(sentenceEnds('Pad options, e.g. a thick one, suit long rides. Sizes vary.')).toEqual([
      'Pad options, e.g. a thick one, suit long rides.'.length,
    ])
    expect(sentenceEnds('Designed by R. Okafor for the team. It fits.')).toEqual([
      'Designed by R. Okafor for the team.'.length,
    ])
    expect(sentenceEnds('Made for the U.S. Army cycling team. It fits.')).toEqual([
      'Made for the U.S. Army cycling team.'.length,
    ])
    expect(sentenceEnds('Approx. five panels. Then more.')).toEqual(['Approx. five panels.'.length])
    expect(sentenceEnds('Light... and fast. Then more.')).toEqual(['Light... and fast.'.length])
    expect(sentenceEnds('No. 5 pad. Then more.')).toEqual(['No. 5 pad.'.length])
  })

  it('does not stop inside a number', () => {
    expect(sentenceEnds('Knit at 4.5 mm gauge, 160 GSM. Then more.')).toEqual([
      'Knit at 4.5 mm gauge, 160 GSM.'.length,
    ])
  })

  it('has no ends in text without a sentence stop, or with only the closing one', () => {
    expect(sentenceEnds('A race skinsuit with no full stop')).toEqual([])
    expect(sentenceEnds('One sentence only.')).toEqual([])
    expect(sentenceEnds('One sentence only.   ')).toEqual([])
    expect(sentenceEnds('')).toEqual([])
  })
})

describe('longestFittingSentences', () => {
  it('stops at a full stop, where a plain cut at the same length stops inside a word', () => {
    const cut = longestFittingSentences(SKINSUIT, fitsThreeLines)
    expect(cut).not.toBeNull()
    const summary = SKINSUIT.slice(0, cut as number)
    expect(summary).toBe('A women’s race skinsuit in a nylon knit that stretches four ways.')
    expect(summary.endsWith('.')).toBe(true)
    // What the browser's clamp did to the same text: the old behaviour, for the comparison.
    const plainCut = SKINSUIT.slice(0, THREE_LINES)
    expect(plainCut.endsWith('.')).toBe(false)
    expect(plainCut).toMatch(/[a-z]$/i)
  })

  it('takes as many whole sentences as fit', () => {
    const cut = longestFittingSentences(SKINSUIT, (candidate) => candidate.length <= 200)
    expect(SKINSUIT.slice(0, cut as number).endsWith('full digital print.')).toBe(true)
  })

  it('is null when not even the first sentence fits: the browser keeps its own cut', () => {
    expect(longestFittingSentences(SKINSUIT, (candidate) => candidate.length <= 40)).toBeNull()
  })

  it('is null for a single sentence: there is nothing shorter that ends at a stop', () => {
    expect(longestFittingSentences('One long sentence only.', () => true)).toBeNull()
  })
})
