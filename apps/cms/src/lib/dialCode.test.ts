import { describe, expect, it } from 'vitest'
import { countryByCode, editDialCode, nextDialCode } from './dialCode'
import { COUNTRIES } from './dialCodes'

describe('the generated country table', () => {
  it.each([
    ['PK', '92'],
    ['US', '1'],
    ['GB', '44'],
    ['AU', '61'],
    ['DE', '49'],
    ['BR', '55'],
    ['AE', '971'],
  ])('%s dials +%s', (code, dial) => {
    expect(countryByCode(code)?.dial).toBe(dial)
  })

  it('covers the world, once each, with a name for every row', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240)
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length)
    for (const country of COUNTRIES) {
      expect(country.name.length).toBeGreaterThan(1)
      expect(country.name).not.toBe(country.code)
      expect(country.dial).toMatch(/^\d{1,4}$/)
    }
  })

  it('is in alphabetical order, so the list reads like one', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
  })
})

describe('nextDialCode (review focus #5)', () => {
  const auto = { dial: '', edited: false }

  it('fills the code from the country', () => {
    expect(nextDialCode(auto, 'PK')).toEqual({ dial: '92', edited: false })
  })

  it('follows the country while the buyer has not touched the code', () => {
    const pakistan = nextDialCode(auto, 'PK')
    expect(nextDialCode(pakistan, 'GB')).toEqual({ dial: '44', edited: false })
  })

  it('keeps an edited code when the country changes afterwards', () => {
    const typed = editDialCode('971')
    expect(nextDialCode(typed, 'CA')).toEqual({ dial: '971', edited: true })
    expect(nextDialCode(nextDialCode(typed, 'CA'), 'GB')).toEqual({ dial: '971', edited: true })
  })

  it('an unknown or empty country leaves the code blank', () => {
    expect(nextDialCode({ dial: '92', edited: false }, 'ZZ')).toEqual(auto)
    expect(nextDialCode({ dial: '92', edited: false }, '')).toEqual(auto)
  })

  it('clearing the code hands it back to the country', () => {
    const cleared = editDialCode('  ')
    expect(cleared.edited).toBe(false)
    expect(nextDialCode(cleared, 'DE')).toEqual({ dial: '49', edited: false })
  })

  it('reads the country code case-insensitively', () => {
    expect(countryByCode(' pk ')?.name).toBe('Pakistan')
  })
})
