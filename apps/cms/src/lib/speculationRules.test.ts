import { describe, expect, it } from 'vitest'
import { GARMENT_PREFETCH_RULES } from './speculationRules'

/**
 * The one speculation rule the website ships (faster-taps spec, Part 3): Chrome fetches a garment
 * page's document when a finger or a mouse presses its card, and nothing else. Prefetch only —
 * a prerender would run the garment page's scripts and count a visit that may never happen.
 */
describe('GARMENT_PREFETCH_RULES', () => {
  const rules = JSON.parse(GARMENT_PREFETCH_RULES)

  it('prefetches a garment page on a press, and nothing more', () => {
    expect(rules).toEqual({
      prefetch: [{ where: { href_matches: '/products/*/*' }, eagerness: 'conservative' }],
    })
  })

  it('never prerenders', () => {
    expect(Object.keys(rules)).toEqual(['prefetch'])
    expect(GARMENT_PREFETCH_RULES).not.toMatch(/prerender/)
  })
})
