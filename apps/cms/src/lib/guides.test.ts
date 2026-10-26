import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { WEIGHT_BANDS, weightNote } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { GUIDE_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { FACTORY_PAGE } from './aboutPages'
import { CERTIFICATION_LINES, FACTS, LEAD_TIME } from './companyFacts'
import { faqEntryById, OWNER_FIGURES } from './faqs'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { GUIDE_PATHS, GUIDES, GUIDES_INDEX, guideAt, READ_NEXT } from './guides'
import { MAX_FILES } from './inquiryFiles'
import { ACCEPTED_KINDS, LIMIT } from './inquiryForm'
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
      const words = without(everyWord(guide))
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
  // Owner, 2026-10-26: the guide also says the bulk lead time (`LEAD_TIME`) and the problem window (the
  // FAQ's answer), both word for word and neither a transit time; any other number of days or weeks fails.
  it('states no transit time and no duty rate', () => {
    expect(words).toContain(LEAD_TIME)
    expect(words).toContain(faqEntryById('order-problem').entry.answer)
    expect(without(words)).not.toMatch(/\d+\s*(?:working )?(?:days|weeks)/i)
    expect(`${without(words)}\nTransit takes 5 days.`).toMatch(/\d+\s*(?:working )?(?:days|weeks)/i)
    expect(words).not.toMatch(/\d+(?:\.\d+)?\s?%/)
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
  it('links garments from the 3D, printing and fabrics guides only, each after a real section', () => {
    const withGarments = GUIDES.filter((guide) => guide.garments).map((guide) => guide.path)
    expect(withGarments).toEqual([
      '/guides/3d-garment-reference',
      '/guides/garment-printing-methods',
      '/guides/sportswear-fabrics-and-weights',
    ])
    for (const guide of GUIDES) {
      if (!guide.garments) continue
      const headings = guide.sections.map((section) => section.heading)
      expect(headings, guide.path).toContain(guide.garments.after)
      const slugs = guide.garments.picks.map((pick) => pick.slug)
      expect(slugs.length, guide.path).toBe(3)
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
 */
describe('a guide’s sources (2026-10-08)', () => {
  const OFFICIAL = /^https:\/\/(?:[a-z0-9-]+\.)*(?:europa\.eu|gov\.uk)\//

  it('lists only official EU and UK government pages, each dated', () => {
    const quoting = GUIDES.filter((guide) => guide.sources)
    expect(quoting.map((guide) => guide.path)).toEqual(['/guides/pakistan-vs-china-vs-turkey'])
    for (const source of quoting.flatMap((guide) => guide.sources ?? [])) {
      expect(source.url, source.name).toMatch(OFFICIAL)
      expect(source.date, source.name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Date.parse(source.date), source.name).not.toBeGreaterThan(Date.now())
      expect(['read', 'published', 'updated']).toContain(source.kind)
    }
  })

  it('NEGATIVE CONTROL: a source on another host is refused', () => {
    expect('https://www.example.com/report').not.toMatch(OFFICIAL)
    expect('https://europa.eu.example.com/x').not.toMatch(OFFICIAL)
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

  // One sentence for the terms, in the two guides that speak of payment and nowhere else.
  it('the deposit and the balance are stated by the minimum-order and cost guides only', () => {
    const terms = 'Production starts on a 50% deposit; the balance is due before shipment.'
    const saying = GUIDES.filter((guide) => everyWord(guide).includes(terms)).map(
      (guide) => guide.path,
    )
    expect(saying).toEqual([
      '/guides/minimum-order-and-samples',
      '/guides/cost-to-start-an-activewear-brand',
    ])
  })

  it('the shipping guide gives the owner’s ports and the sample courier, and no tariff code', () => {
    const words = wordsOf('/guides/shipping-and-import-duties')
    expect(words).toContain(
      'Air shipments leave from Sialkot International Airport and sea freight from Karachi.',
    )
    expect(words).toContain('The buyer pays a sample’s courier.')
    expect(words).not.toMatch(/tariff code|HS code/i)
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

  it('the country guide says nothing of the United States, Canada, Australia or New Zealand', () => {
    expect(wordsOf('/guides/pakistan-vs-china-vs-turkey')).not.toMatch(
      /United States|\bUSA?\b|Canada|Australia|New Zealand/,
    )
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
    const table = guideAt('/guides/sportswear-fabrics-and-weights')
      .sections.flatMap((section) => section.blocks)
      .find((block) => block.kind === 'table')
    if (table?.kind !== 'table') throw new Error('the fabrics guide has no table')
    expect(table.columns).toEqual(['Garment', 'Composition', 'Weight'])
    expect(new Set(table.rows.map((row) => row[0])).size).toBe(table.rows.length)
    const total = (composition: string) =>
      [...composition.matchAll(/(\d+)%/g)].reduce((sum, match) => sum + Number(match[1]), 0)
    for (const [garment, composition, weight] of table.rows) {
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
              : block.kind === 'table' || block.kind === 'orderSteps'
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
