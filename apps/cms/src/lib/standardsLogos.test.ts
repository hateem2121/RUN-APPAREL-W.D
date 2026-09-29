import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { logosFor, marksFor, STANDARDS_LOGOS } from './standardsLogos'

const PUBLIC_DIR = join(import.meta.dirname, '..', '..', 'public')

const slugs = (entry: string) => logosFor(entry).map((logo) => logo.slug)

/** The size an SVG file declares: its width/height attributes, else its viewBox. */
function svgSize(svg: string): { width: number; height: number } {
  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? ''
  const w = root.match(/\swidth="([\d.]+)"/)?.[1]
  const h = root.match(/\sheight="([\d.]+)"/)?.[1]
  if (w && h) return { width: Number(w), height: Number(h) }
  const box = root.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/)
  if (!box) throw new Error('SVG declares neither width/height nor a viewBox')
  return { width: Number(box[1]), height: Number(box[2]) }
}

describe('logosFor', () => {
  // The two strings the footer really prints (the CMS entries, owner ruling 2026-09-16).
  it('finds the parent entry: SEDEX then SMETA', () => {
    expect(slugs('Parent: SEDEX-registered, SMETA-audited')).toEqual(['sedex', 'smeta'])
  })

  it('finds the suppliers entry: OEKO-TEX, GOTS, GRS in the order they are written', () => {
    expect(slugs('Suppliers: OEKO-TEX, GOTS, GRS')).toEqual(['oeko-tex', 'gots', 'grs'])
  })

  it('follows the order of appearance, not the order of the table', () => {
    expect(slugs('GRS, GOTS and SMETA')).toEqual(['grs', 'gots', 'smeta'])
  })

  // NEGATIVE CONTROL: a token inside a longer word is not the standard. Without the
  // whole-word rule "GRSX" would print the GRS mark, a claim nobody made.
  it('matches whole words only', () => {
    expect(slugs('GRSX')).toEqual([])
    expect(slugs('XGOTS')).toEqual([])
    expect(slugs('NONSEDEXISH')).toEqual([])
    expect(slugs('SMETAS audits')).toEqual([])
  })

  it('and the same tokens ARE found once they stand alone (the control runs both ways)', () => {
    expect(slugs('GRS')).toEqual(['grs'])
    expect(slugs('(GOTS)')).toEqual(['gots'])
  })

  it('is case-insensitive', () => {
    expect(slugs('suppliers: oeko-tex, gots, Grs')).toEqual(['oeko-tex', 'gots', 'grs'])
  })

  it('removes duplicates', () => {
    expect(slugs('GOTS, GOTS and gots again, then SEDEX')).toEqual(['gots', 'sedex'])
  })

  it('returns nothing for an entry naming no body, and for an empty one', () => {
    expect(slugs('Fully prepared to pursue program-specific certification')).toEqual([])
    expect(slugs('')).toEqual([])
  })

  it('returns the five fields the footer draws and nothing else', () => {
    const [logo] = logosFor('GOTS')
    expect(Object.keys(logo ?? {}).sort()).toEqual(['alt', 'height', 'slug', 'src', 'width'])
    expect(logo?.alt).toBe('GOTS')
  })

  // TEXT ONLY until the owner sends a current amfori file (owner, 2026-09-29): the only file
  // on hand was the OLD pre-amfori "Member of BSCI" ring, beside text that says "amfori BSCI".
  it('draws no logo for amfori BSCI, however the entry spells it', () => {
    expect(slugs('Suppliers: amfori BSCI, GOTS')).toEqual(['gots'])
    expect(slugs('BSCI')).toEqual([])
    expect(slugs('amfori BSCI')).toEqual([])
  })

  // ISO 9001 only (owner, 2026-09-29). NEGATIVE CONTROL both ways: the combined badge
  // in the owner's folder shows ISO 22000 too, and that half must never be drawn.
  it('finds ISO 9001, however it is hyphenated, and never ISO 22000', () => {
    expect(slugs('Parent: ISO 9001-certified')).toEqual(['iso-9001'])
    expect(slugs('ISO 9001')).toEqual(['iso-9001'])
    expect(slugs('ISO 22000')).toEqual([])
    expect(slugs('ISO 90012')).toEqual([])
    expect(slugs('Parent: ISO 9001 and ISO 22000')).toEqual(['iso-9001'])
  })

  // SECP is a regulator: named in text, never drawn (owner, 2026-09-29) — its emblem
  // beside a supplier list would read as an endorsement.
  it('draws no logo for the Securities and Exchange Commission of Pakistan', () => {
    expect(
      slugs('Registered with the Securities and Exchange Commission of Pakistan (SECP)'),
    ).toEqual([])
  })

  // The owner's ruling (2026-09-29): only the bodies the company names. The other marks
  // in the owner's folder (ISO 22000, SECP, Made in Green, RCS/OCS, sgi) are not claimed
  // as logos and must not appear as records.
  it('carries exactly the six bodies the owner named for a logo', () => {
    expect(STANDARDS_LOGOS.map((logo) => logo.slug).sort()).toEqual([
      'gots',
      'grs',
      'iso-9001',
      'oeko-tex',
      'sedex',
      'smeta',
    ])
  })
})

describe('marksFor: the one row of marks under the footer facts (owner, 2026-09-29)', () => {
  const PRODUCTION = [
    'Parent: SEDEX-registered, SMETA-audited',
    'Suppliers: ISO 9001, OEKO-TEX, GOTS, GRS',
    'Suppliers: amfori BSCI audits',
    'Group: registered with the SECP',
  ]

  it("gathers every entry's marks in the order the entries name them", () => {
    expect(marksFor(PRODUCTION).map((logo) => logo.slug)).toEqual([
      'sedex',
      'smeta',
      'iso-9001',
      'oeko-tex',
      'gots',
      'grs',
    ])
  })

  // NEGATIVE CONTROL: two entries naming the same body must not print it twice.
  it('draws each body once, however many entries name it', () => {
    expect(
      marksFor(['Parent: SEDEX', 'Suppliers: GOTS, SEDEX', 'GOTS']).map((l) => l.slug),
    ).toEqual(['sedex', 'gots'])
  })

  it('is empty when no entry names a body', () => {
    expect(marksFor([])).toEqual([])
    expect(marksFor(['Program-specific standards on request', 'Suppliers: GRSX'])).toEqual([])
  })
})

describe('the logo files', () => {
  for (const logo of STANDARDS_LOGOS) {
    it(`${logo.slug}: the file exists and is the size the record says`, () => {
      const file = join(PUBLIC_DIR, logo.src)
      expect(existsSync(file), `${file} is missing`).toBe(true)
      const svg = readFileSync(file, 'utf8')
      expect(svgSize(svg)).toEqual({ width: logo.width, height: logo.height })
    })

    it(`${logo.slug}: names its source file and stays small`, () => {
      expect(logo.source).toMatch(/\.(ai|svg)$/)
      const bytes = readFileSync(join(PUBLIC_DIR, logo.src)).length
      expect(bytes).toBeLessThan(24 * 1024)
    })
  }

  // NEGATIVE CONTROL for the size check above: it must be able to fail. A record that
  // is one pixel off must not equal what the file declares.
  it('the size check sees a record that is wrong by one pixel', () => {
    const [logo] = STANDARDS_LOGOS
    const real = svgSize(readFileSync(join(PUBLIC_DIR, logo?.src ?? ''), 'utf8'))
    expect({ width: real.width + 1, height: real.height }).not.toEqual(real)
    expect(svgSize('<svg viewBox="0 0 10 20"></svg>')).toEqual({ width: 10, height: 20 })
  })
})
