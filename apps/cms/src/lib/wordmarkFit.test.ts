import { describe, expect, it } from 'vitest'
import { fitScale } from './wordmarkFit'

describe('fitScale', () => {
  it('scales the font so the text spans the available width, with a hairline of safety', () => {
    expect(fitScale(1000, 500)).toBeCloseTo(1.99, 2) // 2 × 0.995
    expect(fitScale(500, 1000)).toBeCloseTo(0.4975, 4)
  })
  it('returns 1 when either measurement is missing, so a bad read never blanks the name', () => {
    expect(fitScale(0, 500)).toBe(1)
    expect(fitScale(500, 0)).toBe(1)
    expect(fitScale(Number.NaN, 500)).toBe(1)
  })
})
