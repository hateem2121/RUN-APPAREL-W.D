import { describe, expect, it } from 'vitest'
import { splitLastWord } from './footerCopy'

describe('splitLastWord', () => {
  it('separates the last word from its trailing punctuation', () => {
    expect(splitLastWord('Have a garment that needs making properly?')).toEqual({
      head: 'Have a garment that needs making ',
      last: 'properly',
      tail: '?',
    })
  })
  it('handles a single word and no punctuation', () => {
    expect(splitLastWord('Hello')).toEqual({ head: '', last: 'Hello', tail: '' })
  })
  it('treats trailing whitespace as absent', () => {
    expect(splitLastWord('Two words  ')).toEqual({ head: 'Two ', last: 'words', tail: '' })
  })
  // The old regex's answers, kept by the scan that replaced it (2026-11-08).
  it('keeps one character as the word when the word is all punctuation', () => {
    expect(splitLastWord('Really !!!')).toEqual({ head: 'Really ', last: '!', tail: '!!' })
    expect(splitLastWord('Wait...!?')).toEqual({ head: '', last: 'Wait', tail: '...!?' })
  })
  it('returns a sentence holding a line break whole, and an empty one empty', () => {
    expect(splitLastWord('Two\nlines?')).toEqual({ head: '', last: 'Two\nlines?', tail: '' })
    expect(splitLastWord('   ')).toEqual({ head: '', last: '', tail: '' })
  })
  // CodeQL js/polynomial-redos (#95): the old regex took 8.6 s on this input in Node 26 (1.1 s at
  // 2,000), so it fails vitest's 5 s limit; the scan answers in well under a millisecond.
  it('answers a long run of "!" before a line break at once', () => {
    const hostile = `${'!'.repeat(4000)}\nx`
    const started = Date.now()
    expect(splitLastWord(hostile).last).toBe(hostile)
    expect(Date.now() - started).toBeLessThan(100)
  })
})
