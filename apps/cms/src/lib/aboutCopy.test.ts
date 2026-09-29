import { describe, expect, it } from 'vitest'
import { ABOUT } from './aboutCopy'
import { FACTS, LINEAGE } from './companyFacts'

/**
 * "Who we are" states only facts the owner already confirmed (2026-09-07) — the same values
 * the numbers section shows, never a second copy that can drift from them.
 */
describe('the "Who we are" section', () => {
  it('opens with the owner-approved lineage wording', () => {
    expect(ABOUT.lede).toContain(LINEAGE)
  })

  it('takes every figure it shows from FACTS', () => {
    const values = new Set(FACTS.map((fact) => fact.value))
    for (const point of ABOUT.points.filter((p) => /\d/.test(p.value) && p.value !== '1889')) {
      expect(values.has(point.value), point.value).toBe(true)
    }
  })

  // The owner, 2026-09-29: "'A family trade' may let people think that we are traders."
  // LINEAGE's own wording ("manufacturing and exporting") is the owner's and stays.
  it('never calls the company a trade or a trader in its own words', () => {
    const own = JSON.stringify({ ...ABOUT, lede: ABOUT.lede.replace(LINEAGE, '') })
    expect(own).not.toMatch(/\btrade|trader/i)
  })

  it('names the parent company as the building it shares, not as a certificate', () => {
    const text = JSON.stringify(ABOUT)
    expect(text).toContain('DURUS INDUSTRIES')
    expect(text).not.toMatch(/certified/i)
  })
})
