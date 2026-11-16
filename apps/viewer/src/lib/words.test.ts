import { afterEach, describe, expect, it } from 'vitest'
import { categoryName, chrome, footerLine, pageLocale, sitePath } from './locale'
import { WORDS, words } from './words'

const CYRILLIC = /[Ѐ-ӿ]/

/** A garment's and a colour's names are CMS text and pass through untranslated: take them out. */
const own = (line: string) => line.replaceAll('X-MILO', '').replaceAll('Claret Red', '').trim()

/** Every string a value can produce: plain, a tuple, a function (called with samples), an object. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function')
    return strings((value as (...a: unknown[]) => unknown)('X-MILO', 'Claret Red'))
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

afterEach(() => window.history.replaceState({}, '', '/'))

describe('the garment page words in two languages (2026-11-16)', () => {
  it('Russian has every key English has, and nothing else', () => {
    expect(Object.keys(WORDS.ru).sort()).toEqual(Object.keys(WORDS.en).sort())
  })

  it('every Russian line that a visitor reads is Russian', () => {
    // Shared with English on purpose: the HD label's second word starts with a space, and a
    // label whose second half is empty in Russian ("ЭКРАН" alone) has nothing to read.
    const latinOnly = new Set(['', ' ', 'HD'])
    for (const [key, value] of Object.entries(WORDS.ru)) {
      for (const line of strings(value)) {
        if (latinOnly.has(own(line))) continue
        expect(line, `WORDS.ru.${key}`).toMatch(CYRILLIC)
      }
    }
  })

  it('no English line slipped into the Russian list', () => {
    for (const [key, value] of Object.entries(WORDS.ru)) {
      const ru = strings(value)
      const en = strings(WORDS.en[key as keyof typeof WORDS.en])
      for (const line of ru) {
        if (own(line) === '') continue
        expect(en, `WORDS.ru.${key} is the English text`).not.toContain(line)
      }
    }
  })
})

describe('the page language follows the address', () => {
  it('an English garment page speaks English, a /ru one Russian', () => {
    window.history.replaceState({}, '', '/products/rxps/wine')
    expect(pageLocale()).toBe('en')
    expect(words()).toBe(WORDS.en)
    expect(sitePath('/contact')).toBe('/contact')
    expect(categoryName('Sportswear')).toBe('Sportswear')

    window.history.replaceState({}, '', '/ru/products/rxps/wine')
    expect(pageLocale()).toBe('ru')
    expect(words()).toBe(WORDS.ru)
    expect(sitePath('/contact')).toBe('/ru/contact')
    expect(sitePath('/')).toBe('/ru')
    expect(categoryName('Sportswear')).toBe('Спортивная одежда')
    expect(chrome().lang).toBe('ru')
    expect(chrome().navLinks.every((link) => link.href.startsWith('/ru/'))).toBe(true)
  })

  it('a CMS footer line is translated only when its exact English is known', () => {
    window.history.replaceState({}, '', '/ru/products/rxps/wine')
    expect(footerLine('Reply within 24 hours')).toBe('Ответим в течение 24 часов')
    expect(footerLine('A line the owner typed today')).toBe('A line the owner typed today')
    window.history.replaceState({}, '', '/products/rxps/wine')
    expect(footerLine('Reply within 24 hours')).toBe('Reply within 24 hours')
  })
})
