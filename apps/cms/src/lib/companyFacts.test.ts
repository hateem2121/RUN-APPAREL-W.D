import { logosFor, STANDARDS_LOGOS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import {
  CERTIFICATION,
  CERTIFICATION_LINES,
  CERTIFICATION_PROMISE,
  CUTTING_LINES,
  FACTS,
  LEAD_TIME,
  PARENT_COMPANY,
  PRECISION_MACHINES,
  SHIPS_TO,
} from './companyFacts'

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

/**
 * The floor-area unit (owner, 2026-10-09): 193,000 is SQUARE METERS. The label said "Sq ft"
 * from the first facts list until that correction; a buyer checking the figure against the
 * building would have found it wrong by an order of magnitude.
 */
describe('the floor area is stated in sq m', () => {
  it('labels the floor area "Sq m under roof", and no label says sq ft', () => {
    const floor = FACTS.find((fact) => fact.value === '193,000')
    expect(floor?.label).toBe('Sq m under roof')
    expect(FACTS.map((fact) => fact.label).join(' ')).not.toMatch(/sq\.?\s*ft/i)
  })
})

/**
 * The production figures the owner's copy deck added (2026-10-08) for the two new pages.
 * They live BESIDE `FACTS`, not inside it: `FACTS` is the home page's №05 band and
 * `/llms.txt`'s facts list, and neither gains a number from this change.
 */
describe('the production figures for the about and factory pages', () => {
  it("state the deck's values, as constants the pages import", () => {
    expect(PRECISION_MACHINES).toEqual({ value: '200+', label: 'Precision machines' })
    expect(CUTTING_LINES).toEqual({ value: '3', label: 'Cutting lines' })
  })

  it('are not added to FACTS (the home page and llms.txt keep their five numbers)', () => {
    expect(FACTS).not.toContain(PRECISION_MACHINES)
    expect(FACTS).not.toContain(CUTTING_LINES)
    expect(FACTS).toHaveLength(5)
  })
})

/** The marks `lines` name that `paragraph` does not, by their names. */
const unbacked = (paragraph: string, lines: readonly string[]) =>
  lines
    .flatMap((line) => logosFor(line))
    .filter((logo) => !logosFor(paragraph).some((held) => held.slug === logo.slug))
    .map((logo) => logo.alt)

/**
 * Polish X7 (2026-10-05): the home page shows the certification paragraph as one line per holder,
 * beside its marks. The paragraph is the owner's approved wording, so every line is held to it.
 */
describe('the certification lines on the home page', () => {
  it('name no mark the owner’s paragraph does not', () => {
    expect(unbacked(CERTIFICATION, CERTIFICATION_LINES)).toEqual([])
    // CONTROL: held to a paragraph that names SEDEX alone, every other mark is reported.
    expect(unbacked('Our parent is SEDEX-registered.', CERTIFICATION_LINES)).toEqual([
      'SMETA',
      'ISO 9001',
      'OEKO-TEX',
      'GOTS',
      'GRS',
    ])
  })

  it('show every mark once, beside the holder that holds it', () => {
    const marks = CERTIFICATION_LINES.flatMap((line) => logosFor(line).map((logo) => logo.slug))
    expect([...marks].sort()).toEqual(STANDARDS_LOGOS.map((logo) => logo.slug).sort())
    const [parent, suppliers, registry] = CERTIFICATION_LINES
    expect(logosFor(parent).map((logo) => logo.slug)).toEqual(['sedex', 'smeta'])
    expect(parent).toContain('DURUS INDUSTRIES')
    expect(logosFor(suppliers).map((logo) => logo.slug)).toEqual([
      'iso-9001',
      'oeko-tex',
      'gots',
      'grs',
    ])
    expect(suppliers).toContain('suppliers')
    // A regulator's registration is a legal fact, not a standard: text, never a mark.
    expect(logosFor(registry)).toEqual([])
  })

  it('keep every holder and SMETA an audit, in the owner’s words where they stand alone', () => {
    const lines = CERTIFICATION_LINES.join(' ')
    for (const words of [
      'DURUS INDUSTRIES',
      'same facility',
      'fabric and trim suppliers',
      'amfori BSCI audits',
      'Securities and Exchange Commission of Pakistan (SECP)',
    ]) {
      expect(CERTIFICATION, `the paragraph lacks "${words}"`).toContain(words)
      expect(lines, `the lines lack "${words}"`).toContain(words)
    }
    expect(lines).toContain('SMETA-audited')
    expect(lines).not.toMatch(/SMETA[\s-]certified/i)
    expect(CERTIFICATION).toContain(CERTIFICATION_LINES[2])
    expect(CERTIFICATION).toContain(CERTIFICATION_PROMISE)
  })
})

/**
 * PLAN.md E3 — the two facts the new company pages share. The lead time is the owner's
 * decision of 2026-10-06 (question tool, A1 #2); the refused 21–45 window of 2026-09-29
 * stays refused above, so the constant must say "your quote states the exact date".
 */
describe('the lead time and the parent company', () => {
  it('state the lead time in the owner’s words, and never as a fixed promise', () => {
    expect(LEAD_TIME).toBe(
      'Usually 2–4 weeks from order confirmation; your quote states the exact date.',
    )
    expect(LEAD_TIME).toContain('2–4 weeks')
    expect(LEAD_TIME).toContain('quote')
    expect(LEAD_TIME).not.toMatch(/21\s*[–-]\s*45/)
  })

  it('name the parent company the certification paragraph names', () => {
    expect(PARENT_COMPANY).toBe('DURUS INDUSTRIES')
    expect(CERTIFICATION).toContain(PARENT_COMPANY)
  })
})
