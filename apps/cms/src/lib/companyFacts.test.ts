import { describe, expect, it } from 'vitest'
import { FACTS, SHIPS_TO } from './companyFacts'

/**
 * The owner's review of 2026-09-29: shipment time "may vary order to order", so no fixed
 * window is published; and buyers "can be new and from anywhere", so no list of regions.
 */
describe('the published company facts', () => {
  it('publish no fixed shipment window', () => {
    expect(FACTS.map((fact) => fact.label).join(' ')).not.toMatch(/shipment/i)
    expect(FACTS.map((fact) => fact.value).join(' ')).not.toMatch(/21\s*[–-]\s*45/)
  })

  it('say the company ships worldwide rather than listing regions', () => {
    expect(SHIPS_TO).toMatch(/^Worldwide/)
    expect(SHIPS_TO).not.toMatch(/Europe|America|Oceania/)
  })
})
