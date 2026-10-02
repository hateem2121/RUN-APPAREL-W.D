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
})
