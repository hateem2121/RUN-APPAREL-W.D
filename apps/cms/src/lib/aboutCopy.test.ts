import { describe, expect, it } from 'vitest'
import { ABOUT } from './aboutCopy'
import { FACTS, LINEAGE } from './companyFacts'

/**
 * "Who we are" states only facts the owner already confirmed (2026-09-07), and none of the
 * numbers section's figures a second time.
 */
describe('the "Who we are" section', () => {
  it('opens with the owner-approved lineage wording', () => {
    expect(ABOUT.lede).toContain(LINEAGE)
  })

  // №05 shows the numbers two sections later; repeating 200 and 193,000 here made both
  // sections weaker (seen on the rendered page, 2026-09-29). This section keeps what is its own.
  it('repeats no figure the numbers section already shows', () => {
    const values = new Set(FACTS.map((fact) => fact.value))
    expect(ABOUT.points.filter((point) => values.has(point.value))).toEqual([])
  })

  // The owner, 2026-09-29: "'A family trade' may let people think that we are traders."
  // LINEAGE's own wording ("manufacturing and exporting") is the owner's and stays.
  it('never calls the company a trade or a trader in its own words', () => {
    const own = JSON.stringify({ ...ABOUT, lede: ABOUT.lede.replace(LINEAGE, '') })
    expect(own).not.toMatch(/\btrade|trader/i)
  })

  // The owner, 2026-10-09: the 1889 label says "Manufacturing since", LINEAGE's own verb, where
  // it said "Making clothes since" (the family made footballs before clothes).
  it('labels 1889 with the lineage verb, manufacturing', () => {
    expect(LINEAGE).toMatch(/\bmanufacturing\b/)
    expect(ABOUT.points.find((point) => point.value === '1889')?.label).toBe('Manufacturing since')
  })

  it('names the parent company as the building it shares, not as a certificate', () => {
    const text = JSON.stringify(ABOUT)
    expect(text).toContain('DURUS INDUSTRIES')
    expect(text).not.toMatch(/certified/i)
  })
})
