import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { FACTS } from './companyFacts'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { GUIDE_PATHS, GUIDES, GUIDES_INDEX, guideAt } from './guides'
import { ORDER_PHASES } from './orderProcess'
import { buildLlmsTxt } from './llmsTxt'
import { sitemapFor } from './searchVisibility'
import { guideBreadcrumbJsonLd } from './structuredData'

/**
 * The guides' version of `familyPages.test.ts`: a guide missing from one of the lists a
 * public page must be on is silent everywhere else.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const ORIGIN = 'https://wear-run.com'
const BRAND_SUFFIX = ' — RUN APPAREL'

const everyWord = (guide: (typeof GUIDES)[number]): string =>
  [
    guide.title,
    guide.description,
    guide.heading,
    guide.headingAccent,
    guide.lede,
    ...guide.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) =>
        block.kind === 'list'
          ? [...block.items]
          : block.kind === 'point'
            ? [block.title, block.text]
            : block.kind === 'table'
              ? [block.caption, ...block.columns, ...block.rows.flat()]
              : block.kind === 'orderSteps'
                ? // The home page's eight steps, drawn as they are there (polish D4, Q41).
                  ORDER_PHASES.flatMap((phase) => [
                    phase.name,
                    ...phase.steps.flatMap((step) => [step.title, step.body]),
                  ])
                : [block.text],
      ),
    ]),
  ].join('\n')

/** The words of a guide's `point` blocks, by title: what a table row may quote. */
const pointsOf = (guide: (typeof GUIDES)[number]): Map<string, string> =>
  new Map(
    guide.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.kind === 'point' ? [[block.title, block.text] as const] : [],
      ),
    ),
  )

/**
 * Everything wrong with a guide's tables, as sentences: a row whose heading is not one of the
 * guide's own points, or a cell whose words that point does not say. Compared without the first
 * letter's case, because a cell starts a line ("Names and numbers") where the point has the same
 * words mid-sentence ("It suits names and numbers.").
 */
function tableProblems(guide: (typeof GUIDES)[number]): string[] {
  const points = pointsOf(guide)
  const problems: string[] = []
  for (const block of guide.sections.flatMap((section) => section.blocks)) {
    if (block.kind !== 'table') continue
    for (const row of block.rows) {
      const [method, ...cells] = row
      if (row.length !== block.columns.length) {
        problems.push(`"${method}" has ${row.length} cells for ${block.columns.length} columns`)
      }
      const said = points.get(method ?? '')
      if (said === undefined) {
        problems.push(`"${method}" is not one of the guide's own points`)
        continue
      }
      for (const cell of cells) {
        if (!said.toLowerCase().includes(cell.toLowerCase())) {
          problems.push(`"${method}": "${cell}" is not in the guide's words`)
        }
      }
    }
  }
  return problems
}

describe('every guide is wired everywhere a public page must be', () => {
  it('the guide list and the header list name the same addresses, in the same order', () => {
    expect(GUIDE_PATHS).toEqual(GUIDE_PAGE_SOURCES)
  })

  for (const path of GUIDE_PATHS) {
    it(`${path} has a route folder, a policy, a redirect and a sitemap entry`, () => {
      expect(existsSync(join(FRONTEND, path.slice(1), 'page.tsx'))).toBe(true)
      expect(PUBLIC_PAGE_SOURCES).toContain(path)
      expect(CMS_PUBLIC_PATHS).toContain(path)
      expect(sitemapFor('visible', ORIGIN).map((entry) => entry.url)).toContain(`${ORIGIN}${path}`)
    })
  }

  it('every guide is named in llms.txt, and an unknown address throws', () => {
    const text = buildLlmsTxt(ORIGIN)
    for (const guide of GUIDES) expect(text).toContain(`(${ORIGIN}${guide.path})`)
    expect(() => guideAt('/guides/no-such-guide')).toThrow(/no-such-guide/)
  })
})

describe('what a search result shows', () => {
  for (const page of [GUIDES_INDEX, ...GUIDES]) {
    it(`${page.path}: the whole title fits and the description can be the snippet`, () => {
      expect(`${page.title}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    })
  }

  it('no two guides share a title or a description', () => {
    expect(new Set(GUIDES.map((guide) => guide.title)).size).toBe(GUIDES.length)
    expect(new Set(GUIDES.map((guide) => guide.description)).size).toBe(GUIDES.length)
  })

  it('the trail is Home, Guides, then the guide', () => {
    const guide = GUIDES[0] as (typeof GUIDES)[number]
    expect(guideBreadcrumbJsonLd(guide).itemListElement.map((item) => item.item)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/guides`,
      `${ORIGIN}${guide.path}`,
    ])
  })
})

describe('the words state only what the site already states', () => {
  const minimum = FACTS.find((fact) => fact.label.startsWith('Minimum'))?.value ?? 'missing'
  const sampleDays = FACTS.find((fact) => fact.label.startsWith('Working days'))?.value ?? 'missing'

  it('the minimum-order guide carries the confirmed numbers and the terms sentence', () => {
    const words = everyWord(guideAt('/guides/minimum-order-and-samples'))
    expect(words).toContain(`${minimum} pieces per style`)
    expect(words).toContain(`${sampleDays} working days`)
    expect(words).toContain(
      'Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
    )
  })

  // The owner's correction of 2026-09-29: a 3D reference is on request, not part of every order.
  it('the 3D guide says "on request" and never promises one with every order', () => {
    const words = everyWord(guideAt('/guides/3d-garment-reference'))
    expect(words).toContain('on request')
    expect(words).not.toMatch(/every (?:order|garment) (?:gets|ships with|comes with)/i)
    expect(words).toContain('not a color match')
  })

  for (const guide of GUIDES) {
    it(`${guide.path}: no printing method, lead time, certificate, founding year or invented proof`, () => {
      const words = everyWord(guide)
      // The printing guide names the methods the owner confirmed are done in the building.
      if (guide.path !== '/guides/garment-printing-methods') {
        expect(words).not.toMatch(/sublimat|embroider/i)
      }
      expect(words).not.toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*days/i)
      expect(words).not.toMatch(/certified|OEKO|GOTS|SMETA|SEDEX|ISO\s?9001/i)
      expect(words).not.toMatch(/1889|since \d{4}|founded|established/i)
      expect(words).not.toMatch(/trusted by|\d+\+?\s*(?:brands|teams|clients|customers)/i)
    })
  }
})

describe("the three guides built from the owner's own facts (2026-09-30)", () => {
  it('the printing guide names exactly the seven methods the owner confirmed', () => {
    const guide = guideAt('/guides/garment-printing-methods')
    const methods = guide.sections[0]?.blocks.flatMap((block) =>
      block.kind === 'point' ? [block.title] : [],
    )
    expect(methods).toEqual([
      'Screen printing',
      'Sublimation',
      'DTF (direct to film)',
      'DTG (direct to garment)',
      'Heat transfer vinyl',
      'Embroidery',
      'Special inks',
    ])
    expect(everyWord(guide)).toContain('inside our own building')
  })

  // Left out by the owner's choice: no test report stands behind the sheets' figures, the
  // certificates are the suppliers', and an unsourced environmental percentage is a legal risk.
  it("the fabrics guide carries weights and uses, and none of the sheets' unproven figures", () => {
    const words = everyWord(guideAt('/guides/sportswear-fabrics-and-weights'))
    expect(words).toContain('120 to 200 GSM')
    expect(words).toContain('made to match')
    expect(words).not.toMatch(/mm\/hr|L\/m|wicking rate|drying time|\d\/5|⭐/i)
    expect(words).not.toMatch(/TENCEL|carbon|emissions|\d+\s?%/i)
  })

  it('the packaging guide says there is no set minimum', () => {
    expect(everyWord(guideAt('/guides/private-label-packaging'))).toContain('no set minimum')
  })
})

/*
 * Polish X22 (audit of 3 October 2026, the owner's plan of 4 October): "Which method for your
 * garment" was a paragraph where a small table is faster. The table says nothing the guide does
 * not: each row is one of the seven points, and each cell is that point's own words.
 */
describe('the printing guide’s table (polish X22)', () => {
  const guide = guideAt('/guides/garment-printing-methods')
  const table = guide.sections
    .find((section) => section.heading === 'Which method for your garment')
    ?.blocks.find((block) => block.kind === 'table')

  it('sits in "Which method for your garment", one row per method, in the guide’s order', () => {
    if (table?.kind !== 'table') throw new Error('the section has no table')
    expect(table.rows.map((row) => row[0])).toEqual([...pointsOf(guide).keys()])
    expect(table.caption.length).toBeGreaterThan(0)
  })

  // The owner, 2026-10-04: no minimum column, because the guide states one minimum for all.
  it('has no minimum column, and no column without a cell in every row', () => {
    if (table?.kind !== 'table') throw new Error('the section has no table')
    expect(table.columns.join(' ')).not.toMatch(/minimum|MOQ/i)
    for (const row of table.rows) expect(row.every((cell) => cell.trim().length > 0)).toBe(true)
  })

  it('every cell is the guide’s own words, from the row’s own point', () => {
    expect(tableProblems(guide)).toEqual([])
  })

  // NEGATIVE CONTROL, run both ways: a cell the point does not say, a row that is no point, and a
  // short row are each named; the guide's own table gives nothing to name (the test above).
  it('sees a cell, a row or a column the guide does not have', () => {
    if (table?.kind !== 'table') throw new Error('the section has no table')
    const planted = (rows: readonly (readonly string[])[]) => ({
      ...guide,
      sections: [...guide.sections, { heading: 'x', blocks: [{ ...table, rows }] }],
    })
    expect(tableProblems(planted([['Screen printing', 'A soft feel on the skin']]))).toContain(
      '"Screen printing": "A soft feel on the skin" is not in the guide\'s words',
    )
    expect(tableProblems(planted([['Foil', 'Names and numbers']]))).toContain(
      '"Foil" is not one of the guide\'s own points',
    )
    expect(tableProblems(planted([['Embroidery']]))).toContain(
      '"Embroidery" has 1 cells for 2 columns',
    )
  })
})

/*
 * Polish X22: the guides were walls of text, "though you have factory photos of screen printing
 * and inspection". A section may show ONE of the owner's factory photos, and only where the
 * section's own words name what it shows: the photo illustrates a sentence, it makes no claim.
 * Each is listed here with those words, so a photo moved to a section that does not name it, or
 * words edited away from under one, fails.
 */
describe('a guide shows a factory photo only beside words that name it (polish X22)', () => {
  // In the order of `GUIDES`.
  const NAMED_BY = [
    ['/guides/minimum-order-and-samples', 'The minimum order', 'stitching', 'the same team'],
    ['/guides/garment-printing-methods', 'The seven methods', 'screen-printing', 'Screen printing'],
    [
      '/guides/sportswear-fabrics-and-weights',
      'Confirmed on a sample',
      'lab',
      'confirmed against a physical sample',
    ],
    ['/guides/private-label-packaging', 'Where it happens', 'tagging', 'Tagging'],
    ['/guides/shipping-and-import-duties', 'The price terms we quote', 'exterior', 'our building'],
  ] as const

  const shown = GUIDES.flatMap((guide) =>
    guide.sections.flatMap((section) =>
      section.photo ? [[guide.path, section.heading, section.photo] as const] : [],
    ),
  )

  it('shows exactly the photos listed, in the sections listed', () => {
    expect(shown).toEqual(NAMED_BY.map(([path, heading, slug]) => [path, heading, slug]))
  })

  for (const [path, heading, slug, words] of NAMED_BY) {
    it(`${path}: "${heading}" names what its photo shows ("${words}")`, () => {
      const section = guideAt(path).sections.find((entry) => entry.heading === heading)
      if (!section) throw new Error(`${path} has no section "${heading}"`)
      const sectionWords = everyWord({ ...guideAt(path), sections: [section] })
      expect(sectionWords).toContain(words)
      expect(FACTORY_PHOTOS.map((photo) => photo.slug)).toContain(slug)
    })
  }

  it('no guide shows a photo twice, and the order guide adds none to its eight cards', () => {
    for (const guide of GUIDES) {
      const slugs = guide.sections.flatMap((section) => (section.photo ? [section.photo] : []))
      expect(new Set(slugs).size, guide.path).toBe(slugs.length)
    }
    const order = guideAt('/guides/how-a-private-label-order-works')
    expect(order.sections.filter((section) => section.photo)).toEqual([])
  })
})

describe('the shipping guide (owner, 2026-09-30)', () => {
  const words = everyWord(guideAt('/guides/shipping-and-import-duties'))

  it('names the four ways and five terms the owner ticked, and nothing else', () => {
    const titles = guideAt('/guides/shipping-and-import-duties').sections.flatMap((section) =>
      section.blocks.flatMap((block) => (block.kind === 'point' ? [block.title] : [])),
    )
    expect(titles).toEqual([
      'Air courier',
      'Air freight',
      'Sea freight',
      'Your own forwarder',
      'EXW (Ex Works)',
      'FOB (Free On Board)',
      'CFR and CIF',
      'DDP (Delivered Duty Paid)',
    ])
    expect(words).not.toMatch(/\b(?:FCA|CPT|CIP|DAP|DPU|FAS)\b/)
  })

  // Neither was given: a transit time is a promise, and a duty rate is the buyer's country's.
  it('states no transit time and no duty rate', () => {
    expect(words).not.toMatch(/\d+\s*(?:working )?(?:days|weeks)/i)
    expect(words).not.toMatch(/\d+(?:\.\d+)?\s?%/)
  })

  it('keeps the terms page sentence and says FOB, CFR and CIF are sea terms', () => {
    expect(words).toContain(
      'Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
    )
    expect(words).toContain('FOB, CFR and CIF are used for sea freight.')
  })
})
