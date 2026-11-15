import { describe, expect, it } from 'vitest'
import { TEMPLATE_FORM_WORDS, templateFieldError, templateNotice } from './templateDownload'
import { TEMPLATE_FORM_WORDS_RU } from './templateDownload.ru'

/*
 * The template form on the Russian guide (Russian section, 2026-11-15; the language audit found it
 * entirely in English there). What would have to break: a Russian page showing an English word or
 * error, a word with no Russian twin, or the English words changing.
 */
const MISSING = { valid: false, valueMissing: true, typeMismatch: false }
const BAD_EMAIL = { valid: false, valueMissing: false, typeMismatch: true }

describe('the tech pack template form in Russian', () => {
  it('has a Russian word for every English one, and only Russian', () => {
    const shape = (words: object): unknown =>
      Object.fromEntries(
        Object.entries(words).map(([k, v]) => [k, typeof v === 'object' ? shape(v) : typeof v]),
      )
    expect(shape(TEMPLATE_FORM_WORDS_RU)).toEqual(shape(TEMPLATE_FORM_WORDS))
    const flat = (v: unknown): string[] =>
      typeof v === 'string' ? [v] : Object.values(v as object).flatMap(flat)
    for (const word of flat(TEMPLATE_FORM_WORDS_RU).filter((w) => w !== '*'))
      expect(word, word).toMatch(/[А-яЁё]/)
  })

  it('says each field error and each refusal in Russian, and English as before', () => {
    for (const field of ['name', 'email', 'company', 'country'])
      expect(templateFieldError(field, MISSING, 'ru'), field).toMatch(/[А-яЁё]/)
    expect(templateFieldError('email', BAD_EMAIL, 'ru')).toBe(
      'Укажите адрес в виде name@company.com.',
    )
    expect(templateFieldError('name', MISSING)).toBe('Enter your name.')
    for (const error of ['too-many', 'storage', 'invalid', 'anything-else'])
      expect(templateNotice({ error }, 'ru')?.text, error).toMatch(/[А-яЁё]/)
    expect(templateNotice({ error: 'too-many' })?.text).toBe(
      'That is several downloads in a short time. Please wait a few minutes and try again.',
    )
    expect(templateNotice({}, 'ru')).toBeNull()
  })
})
