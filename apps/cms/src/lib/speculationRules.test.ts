import { describe, expect, it } from 'vitest'
import { GARMENT_PREFETCH_RULES, withdrawOnSaveData } from './speculationRules'

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

/**
 * Held back when the browser asks to save data (review of 27 Oct). Chrome already skips every
 * speculation under Save-Data (developer.chrome.com, "Prerender pages", updated 23 Jan 2026); the
 * site removes the rule itself as well, so a browser that does not make that check spends nothing.
 */
describe('withdrawOnSaveData', () => {
  const page = () => {
    const removed: string[] = []
    const scripts = ['a', 'b'].map((id) => ({ remove: () => removed.push(id) }))
    return {
      removed,
      root: {
        querySelectorAll: (selector: string) =>
          selector === 'script[type="speculationrules"]' ? scripts : [],
      },
    }
  }

  it('removes every speculation rule when the browser asks to save data', () => {
    const { root, removed } = page()
    expect(withdrawOnSaveData(root, true)).toBe(2)
    expect(removed).toEqual(['a', 'b'])
  })

  it('leaves the rules alone otherwise', () => {
    const { root, removed } = page()
    expect(withdrawOnSaveData(root, false)).toBe(0)
    expect(removed).toEqual([])
  })
})
