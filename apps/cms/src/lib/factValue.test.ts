import { describe, expect, it } from 'vitest'
import { FACTS } from './companyFacts'
import { parseFactValue } from './factValue'

/**
 * The count-up (owner, 2026-09-29) animates the numbers in `FACTS`. A value it cannot read is
 * shown as the plain text it already is — never NaN, never a zero that stays zero.
 */
describe('parseFactValue', () => {
  it('reads grouped thousands', () => {
    expect(parseFactValue('100,000')).toEqual([{ n: 100000 }])
  })

  it('reads a range as two numbers around its dash', () => {
    expect(parseFactValue('21–45')).toEqual([{ n: 21 }, { sep: '–' }, { n: 45 }])
  })

  it('reads a single number', () => {
    expect(parseFactValue('7')).toEqual([{ n: 7 }])
  })

  it('refuses anything that is not a number, so the text is shown as it is', () => {
    expect(parseFactValue('abc')).toBeNull()
    expect(parseFactValue('')).toBeNull()
    expect(parseFactValue('One')).toBeNull()
    expect(parseFactValue('1.5k')).toBeNull()
  })

  it('reads every figure the numbers section shows', () => {
    for (const fact of FACTS) expect(parseFactValue(fact.value), fact.value).not.toBeNull()
  })
})
