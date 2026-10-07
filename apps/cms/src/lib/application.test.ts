import { describe, expect, it } from 'vitest'
import {
  HONEYPOT_FIELD,
  isHoneypotTripped,
  MAX_LENGTHS,
  ROLE_OPTIONS,
  ROLE_OTHER,
  validateApplication,
} from './application'

/** A floor applicant as the owner described them (F23): no email, no CV, a phone. */
const good = {
  name: 'Imran Bashir',
  phoneCode: '92',
  phone: '300 1234567',
  role: 'Stitching and machining',
}

describe('validateApplication', () => {
  it('accepts name, phone and role alone, the way a floor applicant applies', () => {
    const result = validateApplication({ ...good })
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Imran Bashir',
        phone: '+92 300 1234567',
        email: '',
        role: 'Stitching and machining',
        years: null,
        note: '',
      },
    })
  })

  it('refuses a missing name', () => {
    const result = validateApplication({ ...good, name: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(['name'])
  })

  it('refuses a missing phone, and a code without a number', () => {
    for (const phone of ['', '  ']) {
      const result = validateApplication({ ...good, phone })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(Object.keys(result.errors)).toEqual(['phone'])
    }
  })

  it('refuses a phone that is not a phone number', () => {
    // Fewer than seven digits, or words: nobody can call it back.
    for (const phone of ['12345', 'call me', 'abc-def-ghij']) {
      const result = validateApplication({ ...good, phoneCode: '', phone })
      expect(result.ok, phone).toBe(false)
      if (!result.ok) expect(result.errors.phone, phone).toBeTruthy()
    }
  })

  describe('what you do (D4: eight answers, the last opening a box of its own)', () => {
    it('offers exactly the owner-approved roles, in order, "Something else" last', () => {
      expect(ROLE_OPTIONS.map((option) => option.label)).toEqual([
        'Stitching and machining',
        'Cutting',
        'Printing',
        'Quality checking',
        'Merchandising and coordination',
        'Pattern making and design',
        'Administration',
        'Something else',
      ])
      expect(ROLE_OPTIONS.at(-1)?.value).toBe(ROLE_OTHER)
    })

    it('refuses no role, and a role the form never offered', () => {
      for (const role of ['', 'Chief executive']) {
        const result = validateApplication({ ...good, role })
        expect(result.ok, role).toBe(false)
        if (!result.ok) expect(result.errors.role, role).toBeTruthy()
      }
    })

    it('keeps the applicant’s own words when "Something else" was chosen', () => {
      const result = validateApplication({ ...good, role: ROLE_OTHER, roleOther: '  Embroidery ' })
      expect(result.ok && result.value.role).toBe('Embroidery')
    })

    it('refuses "Something else" with its box left empty', () => {
      const result = validateApplication({ ...good, role: ROLE_OTHER, roleOther: ' ' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.role).toBeTruthy()
    })
  })

  it('keeps a given email, and refuses one that is plainly not an address', () => {
    const kept = validateApplication({ ...good, email: 'imran@example.com' })
    expect(kept.ok && kept.value.email).toBe('imran@example.com')
    const refused = validateApplication({ ...good, email: 'imran at home' })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(Object.keys(refused.errors)).toEqual(['email'])
  })

  it('keeps years of experience only as a whole number from 0 to 60', () => {
    const years = (value: unknown) => {
      const result = validateApplication({ ...good, years: value })
      return result.ok ? result.value.years : 'refused'
    }
    expect(years('0')).toBe(0)
    expect(years('12')).toBe(12)
    expect(years('60')).toBe(60)
    // Optional, so a wrong value is dropped rather than refusing the whole application.
    for (const wrong of ['', '61', '-1', '2.5', 'ten']) expect(years(wrong), wrong).toBeNull()
  })

  it('clips long text instead of refusing it', () => {
    const result = validateApplication({
      ...good,
      name: 'N'.repeat(500),
      note: 'x'.repeat(9000),
      role: ROLE_OTHER,
      roleOther: 'r'.repeat(500),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toHaveLength(MAX_LENGTHS.name)
      expect(result.value.note).toHaveLength(MAX_LENGTHS.note)
      expect(result.value.role).toHaveLength(MAX_LENGTHS.roleOther)
    }
    expect(MAX_LENGTHS.name).toBe(120)
    expect(MAX_LENGTHS.note).toBe(2000)
  })
})

describe('the honeypot', () => {
  it('is the contact form’s own hidden field', () => {
    expect(HONEYPOT_FIELD).toBe('website')
  })

  it('trips only when the hidden field was filled', () => {
    expect(isHoneypotTripped({ ...good })).toBe(false)
    expect(isHoneypotTripped({ ...good, [HONEYPOT_FIELD]: 'http://spam.example' })).toBe(true)
  })
})
