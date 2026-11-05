import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// The table moved to @run-apparel/shared on 2026-10-02 (VA-31); the files it names stay here.
import {
  CLIMATE_COMMITMENT,
  logosFor,
  MARK_AREA,
  markBox,
  marksFor,
  STANDARDS_LOGOS,
  type StandardLogoEntry,
  standardWords,
} from '@run-apparel/shared'

const PUBLIC_DIR = join(import.meta.dirname, '..', '..', 'public')

/*
 * THE FIVE RECORDS THE LIVE LIST CARRIED UNTIL 2026-11-05, KEPT HERE ONLY AS A TEST TABLE. The
 * live list is empty since then (none of the marks is RUN APPAREL's to show; `standardsLogos.ts`
 * has each scheme's rule), but the matching rules — whole words, order of mention, each body once
 * — still decide what a future record draws, so they are tested against this table. Nothing here
 * is served: the `src` paths are not files.
 */
const FORMER: readonly StandardLogoEntry[] = [
  {
    slug: 'sedex',
    src: '/x/sedex.svg',
    width: 104,
    height: 28,
    alt: 'Sedex',
    source: 'test.svg',
    words: standardWords('SEDEX'),
  },
  {
    slug: 'smeta',
    src: '/x/smeta.svg',
    width: 96,
    height: 30,
    alt: 'SMETA',
    source: 'test.svg',
    words: standardWords('SMETA'),
  },
  {
    slug: 'oeko-tex',
    src: '/x/oeko-tex.svg',
    width: 44,
    height: 62,
    alt: 'OEKO-TEX',
    source: 'test.svg',
    words: standardWords('OEKO[-\\s]?TEX'),
  },
  {
    slug: 'grs',
    src: '/x/grs.svg',
    width: 104,
    height: 47,
    alt: 'GRS',
    source: 'test.svg',
    words: standardWords('GRS'),
  },
  {
    slug: 'iso-9001',
    src: '/x/iso-9001.svg',
    width: 72,
    height: 72,
    alt: 'ISO 9001',
    source: 'test.svg',
    words: standardWords('ISO[-\\s]?9001'),
  },
]

const slugs = (entry: string) => logosFor(entry, FORMER).map((logo) => logo.slug)

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

/**
 * The marks no record may draw, each with the rule that forbids it (read 2026-11-05 at the
 * scheme's own page; `standardsLogos.ts` quotes each). GOTS since 2026-11-04.
 */
const REFUSED: Readonly<Record<string, string>> = {
  'iso-9001': 'ISO does not permit anyone to use the ISO logo in connection with certification',
  'oeko-tex': 'OEKO-TEX: the logo is for certificate holders; RUN APPAREL holds none',
  grs: 'Textile Exchange TE-301: no Standard logo without prior authorization',
  sedex:
    'Sedex: the logo is for members promoting their membership; DURUS INDUSTRIES is the member',
  smeta: 'SMETA is Sedex’s audit brand, under the same members-only terms',
  gots: 'GOTS sign rules s.3.3.1: no GOTS sign or claim by an uncertified maker',
}

/** Each record in `table` that draws a refused mark, as "slug: why". */
const refusedIn = (table: readonly { slug: string; src: string; alt: string }[]) =>
  table.flatMap((logo) =>
    Object.entries(REFUSED)
      .filter(([body]) =>
        new RegExp(body.replace('-', '[-\\s]?'), 'i').test(`${logo.slug} ${logo.src} ${logo.alt}`),
      )
      .map(([body, why]) => `${body}: ${why}`),
  )

describe('the live allow-list (2026-11-05: no third-party mark is RUN APPAREL’s to show)', () => {
  it('carries no record at all', () => {
    expect(STANDARDS_LOGOS).toEqual([])
  })

  it('carries none of the refused marks, and its files are gone from the site', () => {
    expect(refusedIn(STANDARDS_LOGOS)).toEqual([])
    for (const body of Object.keys(REFUSED)) {
      expect(
        existsSync(join(PUBLIC_DIR, 'standards', `${body}.svg`)),
        `${body}.svg is served`,
      ).toBe(false)
    }
  })

  // NEGATIVE CONTROL, run both ways: the table the site carried until 2026-11-05 is caught, mark
  // by mark, and the climate badge — the company's own commitment — is not.
  it('catches every record the site carried until 2026-11-05', () => {
    expect(refusedIn(FORMER).map((line) => line.split(':')[0])).toEqual([
      'sedex',
      'smeta',
      'oeko-tex',
      'grs',
      'iso-9001',
    ])
    expect(refusedIn([CLIMATE_COMMITMENT.logo])).toEqual([])
  })

  it('draws nothing for the entries the live footer stores, which it drew five marks for until then', () => {
    const PRODUCTION = [
      'Sister company: SEDEX-registered, SMETA-audited',
      'Suppliers: ISO 9001, OEKO-TEX, GRS',
      'Suppliers: amfori BSCI audits',
      'Both companies: registered with the SECP',
    ]
    expect(marksFor(PRODUCTION)).toEqual([])
    expect(marksFor(PRODUCTION, FORMER).map((logo) => logo.slug)).toEqual([
      'sedex',
      'smeta',
      'iso-9001',
      'oeko-tex',
      'grs',
    ])
  })
})

describe('logosFor (against the former records)', () => {
  it('finds SEDEX then SMETA', () => {
    expect(slugs('Sister company: SEDEX-registered, SMETA-audited')).toEqual(['sedex', 'smeta'])
  })

  it('follows the order of appearance, not the order of the table', () => {
    expect(slugs('GRS, OEKO-TEX and SMETA')).toEqual(['grs', 'oeko-tex', 'smeta'])
  })

  // NEGATIVE CONTROL: a token inside a longer word is not the standard. Without the
  // whole-word rule "GRSX" would print the GRS mark, a claim nobody made.
  it('matches whole words only', () => {
    expect(slugs('GRSX')).toEqual([])
    expect(slugs('XOEKO-TEX')).toEqual([])
    expect(slugs('NONSEDEXISH')).toEqual([])
    expect(slugs('SMETAS audits')).toEqual([])
  })

  it('and the same tokens ARE found once they stand alone (the control runs both ways)', () => {
    expect(slugs('GRS')).toEqual(['grs'])
    expect(slugs('(OEKO-TEX)')).toEqual(['oeko-tex'])
  })

  it('is case-insensitive', () => {
    expect(slugs('suppliers: oeko-tex, Grs')).toEqual(['oeko-tex', 'grs'])
  })

  it('removes duplicates', () => {
    expect(slugs('GRS, GRS and grs again, then SEDEX')).toEqual(['grs', 'sedex'])
  })

  it('returns nothing for an entry naming no body, and for an empty one', () => {
    expect(slugs('Fully prepared to pursue program-specific certification')).toEqual([])
    expect(slugs('')).toEqual([])
  })

  it('returns the five fields the footer draws and nothing else', () => {
    const [logo] = logosFor('GRS', FORMER)
    expect(Object.keys(logo ?? {}).sort()).toEqual(['alt', 'height', 'slug', 'src', 'width'])
  })

  it('finds ISO 9001, however it is hyphenated, and never ISO 22000', () => {
    expect(slugs('ISO 9001-certified')).toEqual(['iso-9001'])
    expect(slugs('ISO 22000')).toEqual([])
    expect(slugs('ISO 90012')).toEqual([])
  })

  it('uses the live list when no table is given', () => {
    expect(logosFor('Suppliers: ISO 9001, OEKO-TEX, GRS')).toEqual([])
  })
})

describe('marksFor (against the former records)', () => {
  // NEGATIVE CONTROL: two entries naming the same body must not print it twice.
  it('draws each body once, however many entries name it', () => {
    expect(
      marksFor(['Holder: SEDEX', 'Suppliers: GRS, SEDEX', 'GRS'], FORMER).map((l) => l.slug),
    ).toEqual(['sedex', 'grs'])
  })

  it('is empty when no entry names a body', () => {
    expect(marksFor([], FORMER)).toEqual([])
    expect(marksFor(['Program-specific standards on request', 'Suppliers: GRSX'], FORMER)).toEqual(
      [],
    )
  })
})

describe('the mark files', () => {
  for (const logo of STANDARDS_LOGOS) {
    it(`${logo.slug}: the file exists and is the size the record says`, () => {
      const file = join(PUBLIC_DIR, logo.src)
      expect(existsSync(file), `${file} is missing`).toBe(true)
      expect(svgSize(readFileSync(file, 'utf8'))).toEqual({
        width: logo.width,
        height: logo.height,
      })
    })
  }

  it('the footer draws marks with no chip behind them', () => {
    // The footer's stylesheet is shared with the garment pages since 2026-10-02 (VA-31).
    const css = readFileSync(
      join(import.meta.dirname, '../../../../packages/ui/src/footer.css'),
      'utf8',
    )
    const rule = css.match(/\.footer-logo\s*\{[^}]*\}/)?.[0] ?? ''
    // Found first: a rule that moved away would otherwise pass the next line by being empty.
    expect(rule, '.footer-logo is not in the footer stylesheet').not.toBe('')
    expect(rule).not.toMatch(/background/)
  })

  /*
   * The company's own climate commitment (owner, 2026-10-17): its badge is the Hub's artwork, kept
   * in its own colours (white lettering on its teal). It must be the file and size the record says,
   * plain paths with no style, text or picture inside it, and say "Committed", never "Certified".
   */
  it('the climate commitment badge is its file, at its size, plain paths, and says Committed', () => {
    const { logo, line, href } = CLIMATE_COMMITMENT
    const file = join(PUBLIC_DIR, logo.src)
    expect(existsSync(file), `${file} is missing`).toBe(true)
    const svg = readFileSync(file, 'utf8')
    expect(svgSize(svg)).toEqual({ width: logo.width, height: logo.height })
    expect(svg).not.toMatch(/<style|<text|<image|class=/)
    expect(svg.length).toBeLessThan(24 * 1024)
    for (const words of [line, logo.alt]) {
      expect(words).toMatch(/Committed/)
      expect(words).not.toMatch(/certif/i)
    }
    expect(href).toBe('https://smeclimatehub.org/our-smes/?search=RUN+APPAREL')
    // Not in the allow-list: no CMS entry draws it, and no entry can draw it twice.
    expect(STANDARDS_LOGOS.map((entry) => entry.src)).not.toContain(logo.src)
  })

  // NEGATIVE CONTROL for the size check above: it must be able to fail.
  it('the size check sees a record that is wrong by one pixel', () => {
    const real = svgSize(readFileSync(join(PUBLIC_DIR, CLIMATE_COMMITMENT.logo.src), 'utf8'))
    expect({ width: real.width + 1, height: real.height }).not.toEqual(real)
    expect(svgSize('<svg viewBox="0 0 10 20"></svg>')).toEqual({ width: 10, height: 20 })
  })
})

// Polish X23: at one height the wordmarks ran long and the badges stayed small.
describe('markBox', () => {
  it('draws every mark at about the same area, each in its own proportions', () => {
    for (const logo of FORMER) {
      const box = markBox(logo)
      const ratio = logo.width / logo.height
      // Whole pixels: within 4% of the area, and of the file's proportions.
      expect(Math.abs(box.width * box.height - MARK_AREA) / MARK_AREA, logo.slug).toBeLessThan(0.04)
      expect(Math.abs(box.width / box.height - ratio) / ratio, logo.slug).toBeLessThan(0.04)
    }
  })

  it('draws a wide wordmark shorter than a square badge, and a tall label taller', () => {
    const height = (slug: string) =>
      markBox(FORMER.find((logo) => logo.slug === slug) ?? { width: 1, height: 1 }).height
    expect(height('sedex')).toBeLessThan(height('iso-9001'))
    expect(height('oeko-tex')).toBeGreaterThan(height('iso-9001'))
    // NEGATIVE CONTROL: the old rule, one 32px height for every mark, fails the area check.
    const oneHeightArea = 32 * 32 * (104 / 28)
    expect(Math.abs(oneHeightArea - MARK_AREA) / MARK_AREA).toBeGreaterThan(0.04)
  })
})
