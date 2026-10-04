import { logosFor, STANDARDS_LOGOS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import {
  CERTIFICATION,
  CERTIFICATION_LINES,
  CERTIFICATION_PROMISE,
  FACTS,
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
