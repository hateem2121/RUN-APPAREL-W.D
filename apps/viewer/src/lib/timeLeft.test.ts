import { describe, expect, it } from 'vitest'
import { createTimeLeft, ESTIMATING } from './timeLeft'

/** Runs a steady download and returns every shown number of seconds. */
function steady(totalSeconds: number) {
  const clock = createTimeLeft()
  const seen: Array<{ at: number; fraction: number; line: string }> = []
  for (let at = 0; at <= totalSeconds * 1000; at += 250) {
    const fraction = at / (totalSeconds * 1000)
    seen.push({ at, fraction, line: clock.read(fraction, at) })
  }
  return seen
}

describe('the Working block time left', () => {
  it('promises nothing before 10% is in', () => {
    for (const s of steady(20).filter((x) => x.fraction < 0.1)) expect(s.line).toBe(ESTIMATING)
  })

  it('is close to the truth on a steady line and never rises', () => {
    const shown = steady(20)
      .map((s) => ({ ...s, n: /About (\d+) sec/.exec(s.line) }))
      .filter((s) => s.n)
    expect(shown.length).toBeGreaterThan(10)
    let last = Number.POSITIVE_INFINITY
    for (const s of shown) {
      const value = Number(s.n?.[1])
      expect(value).toBeLessThanOrEqual(last)
      last = value
      expect(Math.abs(value - (20 - s.at / 1000))).toBeLessThanOrEqual(6)
    }
  })

  it('says it cannot tell when no byte has come for the whole window', () => {
    const clock = createTimeLeft()
    for (let at = 0; at <= 3000; at += 300) clock.read(at / 10000, at)
    let line = ''
    for (let at = 3300; at <= 10000; at += 300) line = clock.read(0.3, at)
    expect(line).toBe(ESTIMATING)
  })

  it('shows no time once every byte is in', () => {
    expect(createTimeLeft().read(1, 0)).toBe('')
  })

  it('names minutes on a very long wait', () => {
    const clock = createTimeLeft()
    let line = ''
    for (let at = 0; at <= 30000; at += 300) line = clock.read(0.09 + (at / 30000) * 0.06, at)
    expect(line).toMatch(/About \d+ min left/)
  })
})
