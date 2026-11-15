import { describe, expect, it } from 'vitest'
import { enPathOf, hasRussianTwin, ruPath } from './locale'

describe('ruPath and enPathOf', () => {
  it('puts the Russian home at /ru, not /ru/', () => {
    expect(ruPath('/')).toBe('/ru')
    expect(enPathOf('/ru')).toBe('/')
  })

  it('prefixes every other page with /ru and keeps its English slug', () => {
    expect(ruPath('/guides/aql-inspection')).toBe('/ru/guides/aql-inspection')
    expect(ruPath('/custom-teamwear-manufacturer')).toBe('/ru/custom-teamwear-manufacturer')
  })

  it('round-trips', () => {
    for (const path of ['/', '/contact', '/guides/aql-inspection', '/faq/orders-and-samples']) {
      expect(enPathOf(ruPath(path))).toBe(path)
    }
  })

  it('refuses a path that is not Russian rather than guessing', () => {
    expect(() => enPathOf('/contact')).toThrow()
    expect(() => enPathOf('/rugby')).toThrow()
  })
})

describe('hasRussianTwin', () => {
  it('is true for pages whose words live in code', () => {
    expect(hasRussianTwin('/')).toBe(true)
    expect(hasRussianTwin('/journal')).toBe(true)
    expect(hasRussianTwin('/case-studies')).toBe(true)
    expect(hasRussianTwin('/guides/aql-inspection')).toBe(true)
  })

  it('is false for single posts and case studies, whose words live in the database (owner, 2026-11-15)', () => {
    expect(hasRussianTwin('/journal/some-post')).toBe(false)
    expect(hasRussianTwin('/journal/:slug')).toBe(false)
    expect(hasRussianTwin('/case-studies/some-study')).toBe(false)
  })

  it('is false for the 3D garment pages, which stay English (design, non-goals)', () => {
    expect(hasRussianTwin('/products/rxps/wine')).toBe(false)
    expect(hasRussianTwin('/products/rxps')).toBe(false)
    expect(hasRussianTwin('/products')).toBe(true)
  })
})
