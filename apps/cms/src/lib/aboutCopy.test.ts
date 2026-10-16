import { describe, expect, it } from 'vitest'
import { ABOUT, LINEAGE_HERE } from './aboutCopy'
import { FACTORY_PAGE } from './aboutPages'
import { FACTS, LINEAGE } from './companyFacts'

/**
 * "Who we are" states only facts the site already states, and none of the numbers section's
 * figures a second time but the one the owner chose to show in both (2026-10-16).
 */
describe('the "Who we are" section', () => {
  /*
   * The owner, 2026-10-16: the year is the hero's and the first figure's, so the heading and the
   * lineage sentence here lose it. The shared LINEAGE keeps it (press.ts reads 1889 out of it).
   */
  it('says the lineage without its year, in the owner’s words, and leaves the shared one whole', () => {
    expect(ABOUT.lede).toContain(LINEAGE_HERE)
    expect(LINEAGE_HERE).toContain('without a break since it began')
    // The second sentence is the shared lineage's own, word for word.
    expect(LINEAGE).toContain(LINEAGE_HERE.slice(LINEAGE_HERE.indexOf('Company')))
    expect(LINEAGE).toContain('1889')
  })

  it('says 1889 once, as the first figure, and not in the heading or the words', () => {
    const words = [ABOUT.heading, ABOUT.accent, ABOUT.lede, ABOUT.body].join(' ')
    expect(words).not.toContain('1889')
    // Tied, so a narrow screen never leaves "generations." alone on the last line (TY-12/13).
    expect(ABOUT.accent).toBe('for generations.')
    expect(ABOUT.points[0]).toEqual({
      value: '1889',
      label: 'Manufacturing since',
      labelFirst: true,
    })
  })

  // №05 shows the numbers four sections later. The owner chose on 2026-10-16 to show the floor
  // area in both (option C); every other №05 figure stays there alone.
  it('repeats no figure the numbers section shows, but the floor area the owner chose', () => {
    const values = new Set(FACTS.map((fact) => fact.value))
    const floor = FACTS.find((fact) => fact.label === 'Sq m under roof')
    expect(
      ABOUT.points.filter((point) => values.has(point.value)).map((point) => point.value),
    ).toEqual([floor?.value])
  })

  it('reads the floor area from FACTS and the solar share as the factory page says it', () => {
    const floor = ABOUT.points.find((point) => point.label === 'Sq m under roof')
    expect(floor?.value).toBe(FACTS.find((fact) => fact.label === 'Sq m under roof')?.value)
    const solar = ABOUT.points.find((point) => 'prefix' in point)
    expect(solar && `${solar.prefix} ${solar.value}`).toBe(FACTORY_PAGE.howWeRunIt.stat)
  })

  it('counts up the quantities only: never the year, never a word', () => {
    expect(ABOUT.points.filter((point) => 'countUp' in point).map((point) => point.value)).toEqual([
      '193,000',
      '80%',
    ])
  })

  // The owner, 2026-09-29: "'A family trade' may let people think that we are traders."
  it('never calls the company a trade or a trader', () => {
    expect(JSON.stringify(ABOUT)).not.toMatch(/\btrade|trader/i)
  })

  // The owner, 2026-10-09: the 1889 label says "Manufacturing since", the lineage's own verb, where
  // it said "Making clothes since" (the family made footballs before clothes).
  it('labels 1889 with the lineage verb, manufacturing', () => {
    expect(LINEAGE_HERE).toMatch(/\bmanufacturing\b/)
    expect(ABOUT.points.find((point) => point.value === '1889')?.label).toBe('Manufacturing since')
  })

  it('names the parent company as the building it shares, not as a certificate', () => {
    const text = JSON.stringify(ABOUT)
    expect(text).toContain('DURUS INDUSTRIES')
    expect(text).not.toMatch(/certified/i)
  })
})
