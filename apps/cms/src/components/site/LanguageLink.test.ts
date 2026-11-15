import { describe, expect, it } from 'vitest'
import { twinOf } from './LanguageLink'

describe('the language link’s target (Russian section, 2026-11-15)', () => {
  it('sends an English page to its Russian twin', () => {
    expect(twinOf('/', 'en')).toBe('/ru')
    expect(twinOf('/guides/aql-inspection', 'en')).toBe('/ru/guides/aql-inspection')
  })

  it('sends a Russian page to its English twin', () => {
    expect(twinOf('/ru', 'ru')).toBe('/')
    expect(twinOf('/ru/contact', 'ru')).toBe('/contact')
  })

  it('sends a page with no twin to the other home, never to a 404', () => {
    expect(twinOf('/journal/a-post', 'en')).toBe('/ru')
    expect(twinOf('/nonsense', 'ru')).toBe('/')
  })
})
