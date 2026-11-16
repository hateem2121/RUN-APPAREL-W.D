import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OG_LOCALE, pageLanguage, RU_SHELL, SHELL_SELECTORS } from './pageLanguage'

const INDEX = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')

describe('the Russian garment page shell (2026-11-16)', () => {
  it('reads the language from the address, and only the Russian folder is Russian', () => {
    expect(pageLanguage('/ru/products/rxps/wine')).toBe('ru')
    expect(pageLanguage('/ru/products/rxps')).toBe('ru')
    expect(pageLanguage('/products/rxps/wine')).toBe('en')
    expect(pageLanguage('/rxps/wine')).toBe('en')
    expect(pageLanguage('/rugby/wine')).toBe('en')
  })

  // An HTMLRewriter selector that matches nothing is a silent no-op: drop a tag from index.html
  // and every Russian page would quietly go back to declaring English.
  it('every tag the Russian shell rewrites is still in index.html', () => {
    expect(INDEX).toMatch(/<html lang="en">/)
    expect(INDEX).toMatch(/<title>/)
    expect(INDEX).toMatch(/<meta\s+name="description"/)
    expect(INDEX).toMatch(/<meta property="og:locale" content="en_US" \/>/)
    expect(SHELL_SELECTORS).toHaveLength(4)
  })

  it('says en_US for English, as index.html does, and ru_RU for Russian', () => {
    expect(INDEX).toContain(`content="${OG_LOCALE.en}"`)
    expect(OG_LOCALE.ru).toBe('ru_RU')
  })

  it('the Russian floor words are Russian', () => {
    expect(RU_SHELL.title).toMatch(/[Ѐ-ӿ]/)
    expect(RU_SHELL.description).toMatch(/[Ѐ-ӿ]/)
  })
})
