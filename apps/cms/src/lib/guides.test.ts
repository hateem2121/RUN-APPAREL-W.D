import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { WEIGHT_BANDS, weightNote } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { GUIDE_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { escapeRegExp } from '../../regexEscape.mjs'
import { FACTORY_PAGE } from './aboutPages'
import { CERTIFICATION_LINES, FACTS, LEAD_TIME } from './companyFacts'
import { faqEntryById, OWNER_FIGURES } from './faqs'
import { FACTORY_PHOTOS, WHOLE_PHOTOS } from './factoryPhotos'
import { GLOSSARY_TERMS } from './glossary'
import { BUYER_QUESTIONS, countCell, CSV_PATH } from './buyerQuestions'
import { toolWords } from './guideTools'
import {
  GARMENT_FABRICS,
  GUIDE_PATHS,
  GUIDES,
  GUIDES_INDEX,
  guideAt,
  legalLine,
  READ_NEXT,
} from './guides'
import { MAX_FILES } from './inquiryFiles'
import { ACCEPTED_KINDS, LIMIT } from './inquiryForm'
import { ORDER_PHASES } from './orderProcess'
import { templateFormWords } from './templateDownload'
import { buildLlmsTxt } from './llmsTxt'
import { sitemapFor } from './searchVisibility'
import { guideBreadcrumbJsonLd } from './structuredData'

/**
 * The guides' version of `familyPages.test.ts`: a guide missing from one of the lists a
 * public page must be on is silent everywhere else.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const ORIGIN = 'https://wear-run.com'
const BRAND_SUFFIX = ' | RUN APPAREL'

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
                : block.kind === 'legal'
                  ? [legalLine(block.checked)]
                  : // The template form and the tools carry fixed words of their own (C1, C6).
                    block.kind === 'download'
                    ? templateFormWords()
                    : block.kind === 'tool'
                      ? toolWords(block.tool)
                      : block.kind === 'chart'
                        ? // The chart's bars carry the table's topics and counts, nothing more (C7).
                          BUYER_QUESTIONS.flatMap((row) => [row.topic, countCell(row.count)])
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
 * Sentences a guide takes word for word from the site's own approved sources, and which carry a word
 * the checks below ban anywhere else ("certified", an ISO number, a percentage, a number of days or
 * weeks). The checks run on a guide's words WITHOUT these sentences, so the same claim in any other
 * words still fails. Owner, 2026-10-26 (site check): the guides now state the company's certificate
 * holders, the recycled-fabric answer, the bulk lead time, the problem window and the factory page's
 * cutting line.
 */
const APPROVED_SENTENCES: readonly string[] = [
  ...CERTIFICATION_LINES,
  faqEntryById('recycled-organic').entry.answer.replace(/^Yes\. /, ''),
  faqEntryById('order-certificates').entry.answer,
  faqEntryById('order-problem').entry.answer,
  LEAD_TIME,
  FACTORY_PAGE.walkthrough.stages.find((stage) => stage.title.startsWith('Cutting'))?.body ?? '',
]

const without = (words: string): string =>
  APPROVED_SENTENCES.reduce((text, sentence) => text.split(sentence).join(''), words)

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

  /*
   * ⚠️ A WRAPPED DRAFT FIELD ONCE SHIPPED HALF (6 Nov 2026). The vetting guide's description and lede
   * wrapped onto a second line in the owner's draft, the converter read only the first, and both
   * shipped ending "...EU origin papers and" / "...its bank" — the length check passed at 101
   * characters. A description or lede is whole sentences, so each must end as a sentence ends.
   */
  const endsAsASentence = (text: string) => /[.?!][’”)]?$/.test(text.trim())
  it('every description and lede ends as a sentence ends', () => {
    const cut = GUIDES.flatMap((guide) =>
      [guide.description, guide.lede]
        .filter((text) => !endsAsASentence(text))
        .map((text) => `${guide.path}: "…${text.slice(-40)}"`),
    )
    expect(cut).toEqual([])
    // NEGATIVE CONTROL: the half-shipped description is caught, the whole one is not.
    expect(
      endsAsASentence(
        'Check a clothing factory before you pay: its company record, bank account, EU origin papers and',
      ),
    ).toBe(false)
    expect(endsAsASentence('Each part is quoted.')).toBe(true)
  })

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

  /*
   * The vetting guide (buyer library, owner approved 2026-11-06) explains the certificates and social
   * audits a buyer may be shown, by each scheme's own name (OEKO-TEX, SMETA on Sedex, ISO 9001), so
   * a buyer can check them. It claims none for RUN, says whose name each is in, and never says
   * "certified" or names GOTS, which stay refused there as everywhere.
   */
  const NAMES_THE_SCHEMES = new Set(['/guides/how-to-vet-a-clothing-manufacturer'])

  for (const guide of GUIDES) {
    it(`${guide.path}: no printing method, lead time, certificate, founding year or invented proof`, () => {
      const words = without(everyWord(guide))
      // The printing guide names the methods the owner confirmed are done in the building.
      if (guide.path !== '/guides/garment-printing-methods') {
        expect(words).not.toMatch(/sublimat|embroider/i)
      }
      expect(words).not.toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*days/i)
      expect(words).not.toMatch(
        NAMES_THE_SCHEMES.has(guide.path)
          ? /certified|GOTS/i
          : /certified|OEKO|GOTS|SMETA|SEDEX|ISO\s?9001/i,
      )
      // 1889 as a year, never inside a standard's number (the pattern-making guide cites ISO 18890).
      expect(words).not.toMatch(/\b1889\b|since \d{4}|founded|established/i)
      expect(words).not.toMatch(/trusted by|\d+\+?\s*(?:brands|teams|clients|customers)/i)
    })
  }

  it('NEGATIVE CONTROL: the year 1889 is still caught, and a standard’s number is not', () => {
    expect('The works dates from 1889.').toMatch(/\b1889\b/)
    expect('ISO 18890 sets the size designation.').not.toMatch(/\b1889\b/)
  })
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
    expect(everyWord(guide)).toContain('on the same site')
  })

  // Left out by the owner's choice: no test report stands behind the sheets' figures, the
  // certificates are the suppliers', and an unsourced environmental percentage is a legal risk.
  it("the fabrics guide carries weights and uses, and none of the sheets' unproven figures", () => {
    const guide = guideAt('/guides/sportswear-fabrics-and-weights')
    const words = everyWord(guide)
    expect(words).toContain('120 to 200 GSM')
    expect(words).toContain('made to match')
    expect(words).not.toMatch(/mm\/hr|L\/m|wicking rate|drying time|\d\/5|⭐/i)
    expect(words).not.toMatch(/TENCEL|carbon|emissions/i)
    // Owner, 2026-10-26: the table of reference garments states each one's published composition, and
    // the cutting line is the factory page's own. A percentage anywhere else in the guide still fails.
    const prose = without(
      everyWord({
        ...guide,
        sections: guide.sections.map((section) => ({
          ...section,
          blocks: section.blocks.filter((block) => block.kind !== 'table'),
        })),
      }),
    )
    expect(prose).not.toMatch(/\d+\s?%/)
    // NEGATIVE CONTROL: the same check sees a percentage planted in the prose.
    expect(`${prose}\nCuts carbon by 40%.`).toMatch(/\d+\s?%/)
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
    ['/guides/shipping-and-import-duties', 'The price terms we quote', 'exterior', 'our buildings'],
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
    expect(order.sections.filter((section) => section.photo || section.stage)).toEqual([])
  })

  /*
   * A WHOLE photo as a section's background (the owner's rule of 2026-11-05: never cut, the whole
   * background), held to the same idea as the cut photos above: only beside words that name it.
   */
  const STAGED_BY = [
    // The cost guide's price section, behind the words "hang tags" (buyer library, 2026-11-06).
    [
      '/guides/cost-to-start-an-activewear-brand',
      'What changes the price of one piece',
      'whole-tagging',
      'hang tags',
    ],
    ['/guides/how-soccer-balls-are-made', 'On our floor', 'whole-ball-stitching', 'hand-stitched'],
    // The buyer library (owner approved 2026-11-06): the stitching floor, the end of the line and the
    // ball hall, each behind words that name it.
    [
      '/guides/how-to-vet-a-clothing-manufacturer',
      'What we can show you',
      'whole-stitching',
      'stitching floor',
    ],
    ['/guides/stitch-and-seam-types', 'On our floor', 'whole-stitching', 'Our stitching floor'],
    [
      '/guides/apparel-manufacturing-machinery',
      'What are the main types of industrial sewing machine?',
      'whole-stitching',
      'industrial sewing line',
    ],
    [
      '/guides/apparel-manufacturing-machinery',
      'How are finished garments checked and packed?',
      'whole-tagging',
      'tagged',
    ],
    [
      '/guides/apparel-manufacturing-machinery',
      'Soccer balls: what does a ball line use?',
      'whole-ball-stitching',
      'stitched by hand',
    ],
  ] as const

  it('shows exactly the whole photos listed, in the sections listed, each a real whole photo', () => {
    const staged = GUIDES.flatMap((guide) =>
      guide.sections.flatMap((section) =>
        section.stage ? [[guide.path, section.heading, section.stage] as const] : [],
      ),
    )
    expect(staged).toEqual(STAGED_BY.map(([path, heading, slug]) => [path, heading, slug]))
    for (const [path, heading, slug, words] of STAGED_BY) {
      expect(WHOLE_PHOTOS.map((photo) => photo.slug)).toContain(slug)
      const section = guideAt(path).sections.find((entry) => entry.heading === heading)
      expect(everyWord({ ...guideAt(path), sections: section ? [section] : [] })).toContain(words)
    }
  })
})

describe('the shipping guide (owner, 2026-09-30)', () => {
  const words = everyWord(guideAt('/guides/shipping-and-import-duties'))

  // The buyer library (owner, 2026-11-06): FCA is quoted on request and DAP is offered too, so seven
  // terms in the Incoterms rules' own order. CPT, CIP, DPU and FAS are still not quoted.
  it('names the four ways and the terms the owner ticked, and nothing else', () => {
    const titles = guideAt('/guides/shipping-and-import-duties').sections.flatMap((section) =>
      section.blocks.flatMap((block) => (block.kind === 'point' ? [block.title] : [])),
    )
    expect(titles).toEqual([
      'Air courier',
      'Air freight',
      'Sea freight',
      'Your own forwarder',
      'EXW (Ex Works)',
      'FCA (Free Carrier)',
      'FOB (Free On Board)',
      'CFR and CIF',
      'DAP (Delivered at Place)',
      'DDP (Delivered Duty Paid)',
    ])
    expect(words).not.toMatch(/\b(?:CPT|CIP|DPU|FAS)\b/)
  })

  /*
   * A transit time is a promise, and the duty on a garment is the buyer's country's. Owner, 2026-10-26:
   * the guide also says the bulk lead time (`LEAD_TIME`) and the problem window (the FAQ's answer), both
   * word for word and neither a transit time; any other number of days or weeks fails. Owner,
   * 2026-11-06 (buyer library): one section gives the duty on soccer balls, each rate read from that
   * market's official tariff and dated; a percentage anywhere else on the page still fails.
   */
  it('states no transit time, and duty rates only in the soccer-ball section', () => {
    expect(words).toContain(LEAD_TIME)
    expect(words).toContain(faqEntryById('order-problem').entry.answer)
    expect(without(words)).not.toMatch(/\d+\s*(?:working )?(?:days|weeks)/i)
    expect(`${without(words)}\nTransit takes 5 days.`).toMatch(/\d+\s*(?:working )?(?:days|weeks)/i)
    const guide = guideAt('/guides/shipping-and-import-duties')
    const outsideBalls = everyWord({
      ...guide,
      sections: guide.sections.filter((section) => section.heading !== 'Shipping soccer balls'),
    })
    expect(outsideBalls).not.toMatch(/\d+(?:\.\d+)?\s?%/)
    // NEGATIVE CONTROL: the same check sees a rate planted in another section.
    expect(`${outsideBalls}\nThe duty is 12%.`).toMatch(/\d+(?:\.\d+)?\s?%/)
  })

  it('keeps the terms page sentence and says FOB, CFR and CIF are sea terms', () => {
    expect(words).toContain(
      'Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
    )
    expect(words).toContain('FOB, CFR and CIF are used for sea freight.')
  })
})

/**
 * The owner's choices of 2026-10-08: reference garments under three guides, each following a real
 * section, and 2–3 guides to read next after every guide.
 */
describe('garments and read-next links (2026-10-08)', () => {
  // The soccer-ball guide links the one ball with a 3D page (wave 1, owner's approval 2026-11-05):
  // a catalogue with one ball cannot give three picks, so it links that one.
  const ONE_PICK = new Set(['/guides/how-soccer-balls-are-made'])

  it('links garments from the 3D, printing, fabrics, ball and outerwear guides only, each after a real section', () => {
    const withGarments = GUIDES.filter((guide) => guide.garments).map((guide) => guide.path)
    expect(withGarments).toEqual([
      '/guides/3d-garment-reference',
      '/guides/garment-printing-methods',
      '/guides/sportswear-fabrics-and-weights',
      '/guides/how-soccer-balls-are-made',
      // The buyer library (owner approved 2026-11-06): three outerwear garments, each re-read live.
      '/guides/outerwear-and-waterproof-fabrics',
    ])
    for (const guide of GUIDES) {
      if (!guide.garments) continue
      const headings = guide.sections.map((section) => section.heading)
      expect(headings, guide.path).toContain(guide.garments.after)
      const slugs = guide.garments.picks.map((pick) => pick.slug)
      expect(slugs.length, guide.path).toBe(ONE_PICK.has(guide.path) ? 1 : 3)
      expect(new Set(slugs).size, guide.path).toBe(slugs.length)
      for (const slug of slugs) expect(slug, guide.path).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('names what each printing and fabrics pick shows; the 3D picks show the garment itself', () => {
    for (const path of [
      '/guides/garment-printing-methods',
      '/guides/sportswear-fabrics-and-weights',
    ]) {
      for (const pick of guideAt(path).garments?.picks ?? []) expect(pick.shows, path).toBeTruthy()
    }
    for (const pick of guideAt('/guides/3d-garment-reference').garments?.picks ?? []) {
      expect(pick.shows).toBeUndefined()
    }
  })

  it('gives every guide 2 or 3 other real guides to read next, and no other page any', () => {
    expect(Object.keys(READ_NEXT).sort()).toEqual(GUIDES.map((guide) => guide.path).sort())
    for (const [path, next] of Object.entries(READ_NEXT)) {
      expect(next.length, path).toBeGreaterThanOrEqual(2)
      expect(next.length, path).toBeLessThanOrEqual(3)
      expect(next, path).not.toContain(path)
      expect(new Set(next).size, path).toBe(next.length)
      for (const target of next) expect(() => guideAt(target), `${path} → ${target}`).not.toThrow()
    }
  })
})

/**
 * The country comparison quotes official pages only (owner, 2026-10-08: "cited public data"), each
 * listed under "Sources" with its date. A source on any other host, or with no date, fails here.
 * Since 2026-10-26 it covers six markets (owner, site check), so the hosts are the EU's and the UK's,
 * the US federal government's (and CBP's own bulletin account, where its CSMS messages are
 * published), Canada's, Australia's and New Zealand's.
 */
describe('a guide’s sources (2026-10-08)', () => {
  const OFFICIAL =
    /^https:\/\/(?:(?:[a-z0-9-]+\.)*(?:europa\.eu|gov\.uk|gov|gc\.ca|gov\.au|govt\.nz)\/|content\.govdelivery\.com\/accounts\/USDHSCBP\/)/
  /*
   * Wave 1 (owner's approval, 2026-11-05; his rule for the library: never a manufacturer's or a
   * seller's page). The ball guide quotes the bodies that set the game's rules (IFAB, FIFA, The FA,
   * US Youth Soccer), two peer-reviewed papers by DOI, and the ILO and the Atlanta Agreement's text.
   * The page on how the guides are written quotes Google's own guidance.
   */
  const BALL_BODIES =
    /^https:\/\/(?:www\.)?(?:theifab\.com|thefa\.com|futurefit\.englandfootball\.com|usyouthsoccer\.org|inside\.fifa\.com|digitalhub\.fifa\.com|doi\.org|imacpak\.org|ilo\.org)\//
  const GOOGLE_GUIDANCE = /^https:\/\/developers\.google\.com\/search\/docs\//
  /*
   * The buyer library (owner approved every word, 2026-11-06; his rule: never a manufacturer’s or a
   * seller’s page). Each guide may quote only the hosts it was researched on: standards bodies,
   * governments and their law sites, universities, journals by DOI, the schemes it explains, the
   * game’s rule makers, and, in the software guide only, each program’s own documentation. A new
   * source on any other host fails here until its host is added on purpose.
   */
  const hosts = (...names: string[]) =>
    new RegExp(`^https://(?:www\\.)?(?:${names.map(escapeRegExp).join('|')})/`)
  const HOSTS_FOR: Readonly<Record<string, RegExp>> = {
    // The four guides the library deepened (owner approved 2026-11-06), in `GUIDES` order.
    '/guides/garment-printing-methods': hosts(
      'blogs.clemson.edu',
      'doi.org',
      'inside.fifa.com',
      'iso.org',
      'kirim.kmutt.ac.th',
      'knowledge.bsigroup.com',
      'library.taga.org',
      'members.aatcc.org',
    ),
    '/guides/sportswear-fabrics-and-weights': hosts(
      'astm.org',
      'doi.org',
      'ecfr.gov',
      'ftc.gov',
      'iso.org',
      'legislation.gov.uk',
      'nist.gov',
      'pubs.nmsu.edu',
    ),
    '/guides/shipping-and-import-duties': hosts(
      'abf.gov.au',
      'academy.iccwbo.org',
      'cbp.gov',
      'cbsa-asfc.gc.ca',
      'content.govdelivery.com',
      'ec.europa.eu',
      'gov.uk',
      'hts.usitc.gov',
      'iata.org',
      'iccwbo.org',
      // C6: the carton calculator's exact inch and foot, and its rounding (NIST, 2026-11-06).
      'nist.gov',
      'taxation-customs.ec.europa.eu',
      'trade-tariff.service.gov.uk',
      'trade.ec.europa.eu',
      'usitc.gov',
      'wcoomd.org',
      'whitehouse.gov',
    ),
    '/guides/cost-to-start-an-activewear-brand': hosts(
      'cbp.gov',
      'content.govdelivery.com',
      'europa.eu',
      'gov.uk',
      'law.cornell.edu',
      'sba.gov',
      'trade.ec.europa.eu',
    ),
    '/guides/pakistan-vs-china-vs-turkey': OFFICIAL,
    '/guides/how-soccer-balls-are-made': BALL_BODIES,
    '/guides/how-we-write-our-guides': GOOGLE_GUIDANCE,
    '/guides/how-to-vet-a-clothing-manufacturer': hosts(
      'amfori.org',
      'cbp.gov',
      'content.govdelivery.com',
      'dhs.gov',
      'dol.gov',
      'eservices.secp.gov.pk',
      'fbr.gov.pk',
      'gov.uk',
      'ic3.gov',
      'ilo.org',
      'inside.fifa.com',
      'iso.org',
      'mywrapcompliance.org',
      'ncsc.gov.uk',
      'oecd.org',
      'oeil.europarl.europa.eu',
      'oeko-tex.com',
      'sa-intl.org',
      'secp.gov.pk',
      'sedex.com',
      'taxation-customs.ec.europa.eu',
      'textileexchange.org',
      'trade.ec.europa.eu',
      'transition-pathways.europa.eu',
      'ustr.gov',
      'wrapcompliance.org',
    ),
    '/guides/clothing-labels': hosts(
      'businesscompanion.info',
      'competition-bureau.canada.ca',
      'cpsc.gov',
      'ecfr.gov',
      'eur-lex.europa.eu',
      'europa.eu',
      'evs.ee',
      'federalregister.gov',
      'ftc.gov',
      'ginetex.net',
      'gov.uk',
      'govinfo.gov',
      'inside.fifa.com',
      'legislation.gov.au',
      'legislation.gov.uk',
      'publications.gc.ca',
      'single-market-economy.ec.europa.eu',
      'store.astm.org',
      'theifab.com',
    ),
    '/guides/apparel-trims': hosts(
      'boutique.afnor.org',
      'cpsc.gov',
      'ecc.isc.ac',
      'ecfr.gov',
      'eur-lex.europa.eu',
      'evs.ee',
      'hts.usitc.gov',
      'inside.fifa.com',
      'store.astm.org',
      'store.uni.com',
    ),
    '/guides/sportswear-fibers': hosts(
      'doi.org',
      'ecfr.gov',
      'eur-lex.europa.eu',
      'ftc.gov',
      'gov.uk',
      'iso.org',
      'textileexchange.org',
    ),
    '/guides/yarn-count-and-denier': hosts(
      'archive.nptel.ac.in',
      'doi.org',
      'eur-lex.europa.eu',
      'iso.org',
      'nist.gov',
      'store.astm.org',
    ),
    '/guides/sportswear-pattern-making': hosts(
      'doi.org',
      'eur-lex.europa.eu',
      'evs.ee',
      'iso.org',
      'sis.se',
      'store.astm.org',
      'support.clo3d.com',
    ),
    '/guides/stitch-and-seam-types': hosts(
      'digitalcommons.usu.edu',
      'doi.org',
      'inside.fifa.com',
      'iso.org',
      'store.astm.org',
    ),
    '/guides/outerwear-and-waterproof-fabrics': hosts(
      'astm.org',
      'committee.iso.org',
      'dec.ny.gov',
      'doi.org',
      'evs.ee',
      'members.aatcc.org',
      'nist.gov',
      'trade-tariff.service.gov.uk',
    ),
    '/guides/dyeing-and-color-matching': hosts(
      'cie.co.at',
      'committee.iso.org',
      'doi.org',
      'ecfr.gov',
      'epa.gov',
      'eur-lex.europa.eu',
      'members.aatcc.org',
      'store.astm.org',
    ),
    '/guides/garment-cutting': hosts(
      'arxiv.org',
      'doi.org',
      'hdl.handle.net',
      'onetonline.org',
      'web.archive.org',
    ),
    '/guides/sportswear-compliance-by-market': hosts(
      'business.gov.au',
      'cbp.gov',
      'cbsa-asfc.gc.ca',
      'competition-bureau.canada.ca',
      'cpsc.gov',
      'dec.ny.gov',
      'dhs.gov',
      'ecfr.gov',
      'ecologie.gouv.fr',
      'eur-lex.europa.eu',
      'federalregister.gov',
      'gov.uk',
      'laws-lois.justice.gc.ca',
      'legifrance.gouv.fr',
      'legislation.gov.au',
      'legislation.gov.uk',
      'legislature.maine.gov',
      'legislature.vermont.gov',
      'oeil.europarl.europa.eu',
      'revisor.mn.gov',
      'transition-pathways.europa.eu',
      'ustr.gov',
    ),
    '/guides/apparel-manufacturing-machinery': hosts(
      'catalog.ncsu.edu',
      'doi.org',
      'engineeringsport.co.uk',
      'inside.fifa.com',
      'iso.org',
      'jtatm.textiles.ncsu.edu',
      'onetonline.org',
    ),
    '/guides/apparel-design-software': hosts(
      'catalog.fitnyc.edu',
      'catalog.ncsu.edu',
      'doi.org',
      'freesewing.eu',
      'github.com',
      'gitlab.com',
      'help.browzwear.com',
      'help.style3d.com',
      'khronos.org',
      'npmjs.com',
      'opensource.org',
      'store.astm.org',
      'support.clo3d.com',
      'support.marvelousdesigner.com',
    ),
    '/guides/how-to-order-team-kits': hosts(
      'bucksfa.freshdesk.com',
      'iso.org',
      'nfhs.org',
      'northumberlandfa.com',
      'ohsaa.org',
      'theifab.com',
    ),
    '/guides/apparel-manufacturing-technology': hosts(
      'dec.ny.gov',
      'doi.org',
      'eur-lex.europa.eu',
      'europarl.europa.eu',
      'gs1us.org',
      'ideas.repec.org',
      'ilo.org',
      'inside.fifa.com',
      'nfc-forum.org',
      'ref-pd.gs1.org',
      'single-market-economy.ec.europa.eu',
      'supplychain.gs1us.org',
      'susproc.jrc.ec.europa.eu',
      'transition-pathways.europa.eu',
    ),
    // C1: a peer-reviewed study, three college course pages and two standards bodies (no seller).
    '/guides/tech-pack-template': hosts(
      'catalog.cccd.edu',
      'doi.org',
      'fitnyc.edu',
      'knowledge.bsigroup.com',
      'members.aatcc.org',
      'westvalley.edu',
    ),
    // C2: standards bodies and the US federal rules that define the words (no inspection company).
    '/guides/aql-inspection': hosts(
      'asq.org',
      'ecfr.gov',
      'ilac.org',
      'iso.org',
      'itl.nist.gov',
      'store.astm.org',
      'wto.org',
    ),
    // C3: the standards bodies' own pages, one study by DOI, FIFA, and ILAC's arrangement.
    '/guides/fabric-and-garment-testing': hosts(
      'doi.org',
      'ilac.org',
      'inside.fifa.com',
      'iso.org',
      'members.aatcc.org',
      'store.astm.org',
    ),
    // C7: the UK statistics guidance, W3C's chart advice, Google's dataset page and the CC license.
    '/guides/what-sportswear-buyers-ask': hosts(
      'analysisfunction.civilservice.gov.uk',
      'creativecommons.org',
      'developers.google.com',
      'w3.org',
    ),
  }

  it('lists only the pages each guide may quote, each dated', () => {
    const quoting = GUIDES.filter((guide) => guide.sources)
    expect(quoting.map((guide) => guide.path)).toEqual(Object.keys(HOSTS_FOR))
    for (const guide of quoting) {
      for (const source of guide.sources ?? []) {
        expect(source.url, source.name).toMatch(HOSTS_FOR[guide.path] as RegExp)
        expect(source.date, source.name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Date.parse(source.date), source.name).not.toBeGreaterThan(Date.now())
        expect(['read', 'published', 'updated']).toContain(source.kind)
      }
    }
  })

  it('NEGATIVE CONTROL: a source on another host is refused', () => {
    expect('https://www.example.com/report').not.toMatch(OFFICIAL)
    expect('https://europa.eu.example.com/x').not.toMatch(OFFICIAL)
    expect('https://cbp.gov.example.com/x').not.toMatch(OFFICIAL)
    expect('https://content.govdelivery.com/accounts/SOMEONE/bulletins/1').not.toMatch(OFFICIAL)
    // A ball maker's or seller's page, and a look-alike host, are refused for the ball guide.
    expect('https://www.soccerballshop.com/how-balls-are-made').not.toMatch(BALL_BODIES)
    expect('https://inside.fifa.com.example.com/x').not.toMatch(BALL_BODIES)
    expect('https://digitalhub.fifa.com.example.com/x').not.toMatch(BALL_BODIES)
    expect('https://developers.google.com.example.com/search/docs/x').not.toMatch(GOOGLE_GUIDANCE)
  })
})

/*
 * The longer guides (owner, 2026-10-26, site check). The owner approved the additions and gave the
 * facts the draft lacked; these hold the three rules the additions were written under: no typed count
 * of the catalogue, every figure from a constant the site already reads, and nothing said twice.
 */
describe('the guides’ additions of 2026-10-26 (owner, site check)', () => {
  const minimum = FACTS.find((fact) => fact.label.startsWith('Minimum'))?.value ?? 'missing'
  const wordsOf = (path: string): string => everyWord(guideAt(path))

  // A garment, colorway or family counted in words or digits is a database figure: a guide is static,
  // so the count is wrong the day a garment is added (the draft's "41 reference garments, 19 teamwear
  // ... five colorways each").
  const COUNTED_CATALOGUE =
    /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|nineteen|twenty|thirty|forty|forty-one) (?:reference |live )?(?:garments|colou?rways|families|products)\b|\b\d+ (?:teamwear|sportswear|outerwear|casual wear)\b|\b(?:nine|seven|six|three) of them\b/i

  it('no guide counts the catalogue', () => {
    for (const guide of GUIDES) expect(everyWord(guide), guide.path).not.toMatch(COUNTED_CATALOGUE)
  })

  // NEGATIVE CONTROL, run both ways: the draft's own sentences are caught, and a plain one is not.
  it('the check sees the draft’s counts', () => {
    for (const planted of [
      'There are 41 reference garments in four families.',
      '19 teamwear and uniforms, 10 sportswear.',
      'Each garment comes in five colorways.',
      'Sublimation is named on nine of them.',
    ]) {
      expect(planted, planted).toMatch(COUNTED_CATALOGUE)
    }
    expect('Every colorway of the garment, each on its own page.').not.toMatch(COUNTED_CATALOGUE)
  })

  it('the 3D guide leaves out the block on a 3D reference of the buyer’s own garment', () => {
    const headings = guideAt('/guides/3d-garment-reference').sections.map((s) => s.heading)
    expect(headings).not.toContain('A 3D reference of your own garment')
    expect(headings).toEqual(
      expect.arrayContaining([
        'What each garment page states',
        'Which garments have one',
        'Ask from the garment page',
      ]),
    )
  })

  it('the minimum-order guide states the reorder, the split and the sample fee from the site’s figures', () => {
    const words = wordsOf('/guides/minimum-order-and-samples')
    expect(words).toContain(`A reorder has the same minimum: ${minimum} pieces per style.`)
    expect(words).toContain(`for example ${OWNER_FIGURES.sizeSplit}.`)
    expect(words).toContain(`You can order fewer than ${minimum} pieces of a style.`)
    expect(words).toContain(
      'The sample fee depends on the style and its print, and we quote it with the sample.',
    )
    expect(words).toContain(LEAD_TIME)
  })

  // One sentence for the terms, in the guides that speak of payment and nowhere else. The order
  // guide joined on 2026-11-05 (owner approved its "Paying for your order"), in the same words.
  it('the deposit and the balance are stated by the order, minimum-order and cost guides only', () => {
    const terms = 'Production starts on a 50% deposit; the balance is due before shipment.'
    const saying = GUIDES.filter((guide) => everyWord(guide).includes(terms)).map(
      (guide) => guide.path,
    )
    expect(saying).toEqual([
      '/guides/how-a-private-label-order-works',
      '/guides/minimum-order-and-samples',
      '/guides/cost-to-start-an-activewear-brand',
    ])
  })

  // The buyer library (owner approved 2026-11-06) adds HS codes: the invoice gives the six-digit code,
  // and the buyer’s broker confirms the national one. So the page names HS codes, and still types none.
  it('the shipping guide gives the owner’s ports and the sample courier, and types no tariff code', () => {
    const words = wordsOf('/guides/shipping-and-import-duties')
    expect(words).toContain(
      'Air shipments leave from Sialkot International Airport and sea freight from Karachi.',
    )
    expect(words).toContain('The buyer pays a sample’s courier.')
    expect(words).toContain('Our commercial invoice gives the six-digit HS code')
    // No code of ten or eight digits for a garment; the ball section’s codes are the tariffs’ own.
    const guide = guideAt('/guides/shipping-and-import-duties')
    const outsideBalls = everyWord({
      ...guide,
      sections: guide.sections.filter((section) => section.heading !== 'Shipping soccer balls'),
    })
    expect(outsideBalls).not.toMatch(/\b\d{4}\.\d{2}(?:\.\d{2})?\b|\b\d{8,10}\b/)
  })

  it('the packaging guide gives the owner’s one sentence on labels and no other label fact', () => {
    const words = wordsOf('/guides/private-label-packaging')
    expect(words).toContain('Labels, barcodes and carton markings are agreed with each customer.')
    expect(words).not.toMatch(/woven|heat-transfer|barcode stickers|SKU/i)
  })

  it('the printing and packaging guides say what the form takes, in the form’s own words and limits', () => {
    for (const path of ['/guides/garment-printing-methods', '/guides/private-label-packaging']) {
      const words = wordsOf(path)
      expect(words, path).toContain(ACCEPTED_KINDS)
      expect(words, path).toContain(`up to ${MAX_FILES} files and ${LIMIT} in total`)
      // The kinds carry their extensions: an old .doc is refused (site check-up, 2026-10-22).
      expect(words, path).toContain('Word (.docx)')
    }
  })

  it('the country guide names each certificate holder in the company’s own three lines', () => {
    const answer = pointsOf(guideAt('/guides/pakistan-vs-china-vs-turkey')).get(
      'Whose name is each certificate in?',
    )
    expect(answer).toBe(CERTIFICATION_LINES.join(' '))
    // SMETA is an audit, never a certificate (`companyFacts.ts`).
    expect(answer).toContain('SMETA-audited')
    expect(answer).not.toMatch(/SMETA-certified/i)
  })

  // Six markets, each rate one an official page prints (owner, 2026-10-26: "research all the rates;
  // for those you find nothing, do not mention"). No total: no official page prints one.
  it('the country guide covers the six markets the owner approved, and adds no rates up', () => {
    const guide = guideAt('/guides/pakistan-vs-china-vs-turkey')
    expect(guide.sections.map((section) => section.heading).slice(0, 6)).toEqual([
      'Bringing it into the European Union',
      'Bringing it into the United Kingdom',
      'Bringing it into the US',
      'Bringing it into Canada',
      'Bringing it into Australia',
      'Bringing it into New Zealand',
    ])
    const words = wordsOf(guide.path)
    expect(words).toContain(
      'Since July 24, 2026, a Section 301 duty is added on top: 10% on goods from Pakistan, 12.5% from Türkiye and 12.5% from China.',
    )
    expect(words).not.toMatch(/\btotal\b|\bin all\b|\badds up\b/i)
  })

  it('the country guide’s works figures are the site’s own', () => {
    const people = FACTS.find((fact) => fact.label.startsWith('People'))?.value ?? 'missing'
    const floor = FACTS.find((fact) => fact.label.startsWith('Sq m'))?.value ?? 'missing'
    expect(wordsOf('/guides/pakistan-vs-china-vs-turkey')).toContain(
      `The works has ${people} people and ${floor} square meters under roof, in six buildings on one site.`,
    )
  })

  // "Reading a weight" is built from the bands the garment pages use, so the two cannot drift.
  it('the fabrics guide states every weight band the garment pages use', () => {
    const words = wordsOf('/guides/sportswear-fabrics-and-weights')
    const [first, ...rest] = WEIGHT_BANDS
    expect(words).toContain(`Under ${first?.below} GSM is ${first?.band}.`)
    for (const [index, band] of rest.entries()) {
      const from = WEIGHT_BANDS[index]?.below
      expect(words).toContain(
        Number.isFinite(band.below)
          ? `From ${from} to ${band.below} is ${band.band}.`
          : `From ${from} up is ${band.band}.`,
      )
    }
    // And a garment page puts a fabric in the band the guide names for its middle.
    for (const band of WEIGHT_BANDS) {
      const middle = Number.isFinite(band.below) ? band.below - 1 : 400
      expect(weightNote(`${middle} GSM`), `${middle} GSM`).toContain(band.band)
    }
  })

  // Its rows are garments' own published specs, typed because a guide is static (the guide says so).
  it('the table of reference garments gives each row a composition that adds to 100% and a weight', () => {
    // Found by its caption: the library's ounces and garment-match tables now come before it (2026-11-06).
    const table = guideAt('/guides/sportswear-fabrics-and-weights')
      .sections.flatMap((section) => section.blocks)
      .find((block) => block.kind === 'table' && block.caption === 'What each garment is made of')
    if (table?.kind !== 'table') throw new Error('the fabrics guide has no table of garments')
    // Two columns, so it stays a table on a 320px phone (`GuideTable`): the weight rides in the cell.
    expect(table.columns).toEqual(['Garment', 'Made of'])
    expect(table.rows).toEqual(
      GARMENT_FABRICS.map(([garment, composition, weight]) => [
        garment,
        `${composition}, ${weight}`,
      ]),
    )
    expect(new Set(GARMENT_FABRICS.map((row) => row[0])).size).toBe(GARMENT_FABRICS.length)
    const total = (composition: string) =>
      [...composition.matchAll(/(\d+)%/g)].reduce((sum, match) => sum + Number(match[1]), 0)
    for (const [garment, composition, weight] of GARMENT_FABRICS) {
      expect(total(composition ?? ''), garment).toBe(100)
      expect(weight, garment).toMatch(/GSM$|^\d+(?:\.\d+)? mm/)
    }
    // NEGATIVE CONTROL: a composition that does not add up is seen.
    expect(total('88% polyester, 10% spandex')).not.toBe(100)
  })

  // The page keys each section on its heading: a repeat is a React key clash and two sections that
  // read as one.
  it('no two sections of a guide share a heading', () => {
    for (const guide of GUIDES) {
      const headings = guide.sections.map((section) => section.heading)
      expect(new Set(headings).size, guide.path).toBe(headings.length)
    }
  })

  /*
   * The owner's rule: nothing said twice on one page. Any run of FIVE words that appears twice in a
   * guide's lede and sections is named here. Tables are left out of the count: the printing guide's
   * table is its own points again by design, and the fabrics guide's rows are garments' specs.
   * Four words would also name "the way you want" in every guide that says it once in a heading and
   * once in a sentence, which the older guides already do.
   */
  const repeatsIn = (guide: (typeof GUIDES)[number], run = 5): string[] => {
    const segments = [
      guide.lede,
      ...guide.sections.flatMap((section) => [
        section.heading,
        ...section.blocks.flatMap((block) =>
          block.kind === 'list'
            ? [...block.items]
            : block.kind === 'point'
              ? [block.title, block.text]
              : // The owner's legal line is one sentence under every law section, by his rule
                // (the buyer library, 2026-11-05), so it is not a repeat.
                block.kind === 'table' || block.kind === 'orderSteps' || block.kind === 'legal'
                ? []
                : // A form or a tool says nothing a second time either (C1, C6).
                  block.kind === 'download'
                  ? templateFormWords()
                  : block.kind === 'tool'
                    ? toolWords(block.tool)
                    : // The chart says only what its table says (C7), which is outside this count.
                      block.kind === 'chart'
                      ? []
                      : [block.text],
        ),
      ]),
    ]
    const seen = new Map<string, number>()
    for (const segment of segments) {
      const words = segment
        .toLowerCase()
        .replace(/[^a-z0-9%'’\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
      const here = new Set<string>()
      for (let at = 0; at + run <= words.length; at += 1) {
        here.add(words.slice(at, at + run).join(' '))
      }
      for (const gram of here) seen.set(gram, (seen.get(gram) ?? 0) + 1)
    }
    return [...seen].filter(([, count]) => count > 1).map(([gram]) => gram)
  }

  // The older guides' own repeats, measured on the guides as they stood on 2026-10-26 before this
  // change (each in two sentences already). A run is allowed only inside one of these phrases.
  const OLDER = [
    'fee is credited back against your bulk order',
    'pressed on with heat it',
    'cotton polyester or a blend',
    'polyester or a blend with cotton',
    'polyester or recycled polyester often with spandex',
    'the shipping method terms and cost are stated in',
    'and the import duty and tax',
    'before a sample is cut',
    // The owner's two parallel sentences, `LEAD_TIME` and `SAMPLE_TIME` (2026-11-05: "Usually 7;
    // quote states it", chosen to read like the lead-time line), on a guide that states both.
    'your quote states the exact',
    // The shipping guide’s price terms (owner, 2026-11-06): each term says who pays the duty, and FCA
    // and CFR and CIF both end on the buyer paying it. The same parallel as the older phrase above.
    'you pay the import duty and tax',
  ]

  it('no guide says a run of five words twice, apart from the older words', () => {
    const repeated = GUIDES.flatMap((guide) =>
      repeatsIn(guide)
        .filter((gram) => !OLDER.some((phrase) => phrase.includes(gram)))
        .map((gram) => `${guide.path}: "${gram}"`),
    )
    expect(repeated).toEqual([])
  })

  it('the repeat check sees a sentence said twice', () => {
    const guide = guideAt('/guides/private-label-packaging')
    const twice = {
      ...guide,
      sections: [
        ...guide.sections,
        { heading: 'Again', blocks: [{ kind: 'text' as const, text: guide.lede }] },
      ],
    }
    expect(repeatsIn(twice).length).toBeGreaterThan(0)
    expect(repeatsIn(guide)).toEqual([])
  })
})

/*
 * Links inside a guide's words (the buyer library, owner approved 2026-11-06; `GuideLink`). Each
 * one's phrase must be in its own block's words, or the page draws it as plain words and the link
 * is silently lost; and each must point somewhere real: another guide, a glossary term or FAQ entry
 * that exists, a garment address, or one of the site's public pages.
 */
describe('links inside a guide’s words (buyer library, 2026-11-06)', () => {
  type Linked = { path: string; phrase: string; href: string; words: readonly string[] }
  const linkedIn = (guides: readonly (typeof GUIDES)[number][]): Linked[] =>
    guides.flatMap((guide) =>
      guide.sections.flatMap((section) =>
        section.blocks.flatMap((block) =>
          block.kind === 'text' || block.kind === 'list'
            ? (block.links ?? []).map((link) => ({
                path: guide.path,
                ...link,
                words: block.kind === 'text' ? [block.text] : block.items,
              }))
            : // A table's links are drawn in its cells after the row header (GuideTable).
              block.kind === 'table'
              ? (block.links ?? []).map((link) => ({
                  path: guide.path,
                  ...link,
                  words: block.rows.flatMap((row) => row.slice(1)),
                }))
              : [],
        ),
      ),
    )

  /** The FAQ topic page an entry is on, or null for an id no topic holds. */
  const faqTopicOf = (id: string): string | null => {
    try {
      return faqEntryById(id).topic.path
    } catch {
      return null
    }
  }

  /** Everything wrong with one link, as sentences. */
  function linkProblems({ path, phrase, href, words }: Linked): string[] {
    const problems: string[] = []
    if (!words.some((entry) => entry.includes(phrase))) {
      problems.push(`${path}: "${phrase}" is not in its block's words`)
    }
    const [page = '', anchor] = href.split('#')
    if (page === path) problems.push(`${path}: "${phrase}" links to its own page`)
    if (page === CSV_PATH) {
      // The buyer-questions file (C7): a download, not a page.
    } else if (page.startsWith('/guides/')) {
      if (!GUIDE_PATHS.includes(page)) problems.push(`${path}: "${phrase}" → no guide ${page}`)
    } else if (page.startsWith('/products/')) {
      if (!/^\/products\/[a-z0-9-]+$/.test(page)) problems.push(`${path}: "${phrase}" → ${href}`)
    } else if (page === '/glossary' && anchor) {
      if (!GLOSSARY_TERMS.some((term) => term.id === anchor)) {
        problems.push(`${path}: "${phrase}" → no glossary term ${anchor}`)
      }
    } else if (page.startsWith('/faq') && anchor) {
      if (faqTopicOf(anchor) !== page) problems.push(`${path}: "${phrase}" → no FAQ entry ${href}`)
    } else if (!PUBLIC_PAGE_SOURCES.includes(page)) {
      problems.push(`${path}: "${phrase}" → ${href} is not a public page`)
    }
    return problems
  }

  it('every link’s phrase is in its block, and every link points somewhere real', () => {
    const linked = linkedIn(GUIDES)
    // The library's new guides link to each other and to the site's pages (140 when built).
    expect(linked.length).toBeGreaterThan(100)
    expect(linked.flatMap(linkProblems)).toEqual([])
  })

  // NEGATIVE CONTROL, run both ways: each kind of wrong link is named; the real links name nothing (above).
  it('sees a phrase not in its words, a missing guide, term, entry or page', () => {
    const planted = (phrase: string, href: string): Linked => ({
      path: '/guides/clothing-labels',
      phrase,
      href,
      words: ['Care symbols are in our trims guide.'],
    })
    expect(linkProblems(planted('our fabrics guide', '/guides/apparel-trims'))).toHaveLength(1)
    expect(linkProblems(planted('our trims guide', '/guides/no-such-guide'))).toHaveLength(1)
    expect(linkProblems(planted('our trims guide', '/glossary#no-such-term'))).toHaveLength(1)
    expect(linkProblems(planted('our trims guide', '/faq/working-with-us#no-such'))).toHaveLength(1)
    expect(linkProblems(planted('our trims guide', '/no-such-page'))).toHaveLength(1)
    expect(linkProblems(planted('our trims guide', '/guides/apparel-trims'))).toEqual([])
  })
})
