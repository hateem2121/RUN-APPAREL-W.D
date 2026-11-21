import { describe, expect, it } from 'vitest'
import { LIVE_PRODUCTS } from '../../../../scripts/live-products.mjs'
import { PRODUCT_DESCRIPTIONS_RU, russianDescription } from './productDescriptions.ru'

const entries = Object.entries(PRODUCT_DESCRIPTIONS_RU)

describe('the Russian product descriptions (owner approved all 45, 2026-11-21)', () => {
  it('has one for every live product and none for a product that is not live', () => {
    expect(Object.keys(PRODUCT_DESCRIPTIONS_RU).sort()).toEqual(
      LIVE_PRODUCTS.map((p: { slug: string }) => p.slug).sort(),
    )
  })

  it('writes every line in Russian, and keeps the English it translates', () => {
    for (const [slug, { en, ru }] of entries) {
      expect(ru, slug).toMatch(/[а-яё]{4}/i)
      expect(en, slug).not.toMatch(/[а-яё]/i)
      expect(ru.length, slug).toBeGreaterThan(en.length * 0.6)
      expect(en, slug).toBe(en.trim())
    }
  })

  it('never claims a FIFA approval on a ball, and says each holds no FIFA mark', () => {
    for (const [slug, { ru }] of entries) {
      expect(ru, slug).not.toMatch(/одобрен|сертифицирован/i)
      if (/FIFA/.test(ru)) expect(ru, slug).toMatch(/не несёт знака FIFA/)
    }
  })

  it('answers the Russian only for the exact English, else nothing', () => {
    const { en, ru } = PRODUCT_DESCRIPTIONS_RU.kaizen as { en: string; ru: string }
    expect(russianDescription('kaizen', en)).toBe(ru)
    expect(russianDescription('kaizen', `  ${en}\n`)).toBe(ru)
    // NEGATIVE CONTROLS: a changed English, another garment's English, an unknown slug.
    expect(russianDescription('kaizen', en.replace('16-panel', '18-panel'))).toBe('')
    expect(russianDescription('maxfly', en)).toBe('')
    expect(russianDescription('not-a-product', en)).toBe('')
    expect(russianDescription('toString', '')).toBe('')
  })
})
