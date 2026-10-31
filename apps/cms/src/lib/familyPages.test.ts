import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_PAGE_PATHS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { FAMILY_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { FACTS } from './companyFacts'
import { FAMILIES } from './families'
import { faqEntryById } from './faqs'
import { FAMILY_PAGES, familyHref, familyOf, familyPageFor, rangeGuidePaths } from './familyPages'
import { guideAt } from './guides'
import { buildLlmsTxt } from './llmsTxt'
import { sitemapFor } from './searchVisibility'
import { breadcrumbJsonLd, faqJsonLd } from './structuredData'

/**
 * A buyer page has to be wired in six places, and missing any one of them is silent: the
 * page renders, every other test passes, and it simply has no security policy, or is never
 * offered to a search engine, or 404s on the admin host. These tests are the only thing
 * that fails when a page is added to one list and not the others.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const ORIGIN = 'https://wear-run.com'
const BRAND_SUFFIX = ' | RUN APPAREL'
/** A buyer-page title must LEAD with the term a buyer types. */
const LEADS_WITH_SEARCH_TERM = /^(?:custom|private label)/i

/** The questions allowed to name a printing method (owner, 2026-10-26, site check). */
const PRINTING_QUESTIONS = new Set([
  'Which printing methods suit team kit?',
  'Which decoration suits the polo?',
])

/** The FAQ's recycled-and-organic sentence (F10, 2026-10-07), as the pages use it. */
const RECYCLED_ORGANIC = faqEntryById('recycled-organic').entry.answer.replace(/^Yes\. /, '')

/** The clothing families' pages, whose minimum and sample time `FACTS` states. */
const CLOTHING_PAGES = FAMILY_PAGES.filter((page) => page.familySlug !== 'sports-accessories')
/** A family's own page: a product line's page is not the family's link. */
const OWN_PAGES = FAMILY_PAGES.filter((page) => !page.productLine)

const everyWord = (page: (typeof FAMILY_PAGES)[number]): string =>
  [
    page.title,
    page.description,
    page.eyebrow,
    page.heading,
    page.headingAccent,
    page.lede,
    page.makesHeading,
    ...page.makes.flatMap((entry) => [entry.group, entry.garments]),
    page.stepsHeading,
    page.closingHeading,
    ...page.questions.flatMap((entry) => [entry.question, entry.answer]),
  ].join('\n')

describe('every buyer page is wired everywhere a public page must be', () => {
  it('the page list and the header list name the same addresses, in the same order', () => {
    expect(FAMILY_PAGES.map((page) => page.path)).toEqual(FAMILY_PAGE_SOURCES)
  })

  for (const page of FAMILY_PAGES) {
    it(`${page.path} has a route folder, a policy, a redirect, a sitemap entry and an llms.txt line`, () => {
      expect(existsSync(join(FRONTEND, page.path.slice(1), 'page.tsx'))).toBe(true)
      expect(PUBLIC_PAGE_SOURCES).toContain(page.path)
      expect(CMS_PUBLIC_PATHS).toContain(page.path)
      expect(sitemapFor('visible', ORIGIN).map((entry) => entry.url)).toContain(
        `${ORIGIN}${page.path}`,
      )
      expect(buildLlmsTxt(ORIGIN)).toContain(`(${ORIGIN}${page.path})`)
    })

    it(`${page.path} is not under /products/, which the viewer Worker answers`, () => {
      expect(page.path.startsWith('/products')).toBe(false)
      expect(page.path).toMatch(/^\/[a-z0-9-]+$/)
    })
  }

  it('a hidden site offers no buyer page to a crawler', () => {
    expect(sitemapFor('hidden', ORIGIN)).toEqual([])
  })

  it('the garment pages send each category to its page here, and to no other (polish S5)', () => {
    // packages/shared repeats the addresses, because the garment pages cannot import this file.
    const fromPages = Object.fromEntries(OWN_PAGES.map((page) => [familyOf(page).name, page.path]))
    expect(CATEGORY_PAGE_PATHS).toEqual(fromPages)
    // NEGATIVE CONTROL: the comparison sees a page missing from either side.
    expect({ ...CATEGORY_PAGE_PATHS, Outerwear: undefined }).not.toEqual(fromPages)
  })
})

describe('what a search result shows', () => {
  for (const page of FAMILY_PAGES) {
    it(`${page.path}: the whole title fits, brand included`, () => {
      expect(`${page.title}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(TITLE_MAX)
    })

    it(`${page.path}: the description is long enough to be the snippet and short enough to show whole`, () => {
      expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    })

    it(`${page.path}: the title and the heading both say what a buyer searches for`, () => {
      expect(page.title).toMatch(/manufacturer/i)
      expect(page.title).toMatch(LEADS_WITH_SEARCH_TERM)
      expect(`${page.heading} ${page.headingAccent}`).toMatch(/custom|private label/i)
    })
  }

  it('negative control: a title with the search term NOT first is refused', () => {
    // GitHub's code scan (CodeQL js/regex/missing-regexp-anchor, 2026-10-01): written as
    // /^custom|private label/i, the `^` bound to "custom" alone, so "private label"
    // passed anywhere in the title. Every live title leads with the term; this pins it.
    expect('Casual Wear Private Label Manufacturer').not.toMatch(LEADS_WITH_SEARCH_TERM)
    expect('Private Label Casual Wear Manufacturer').toMatch(LEADS_WITH_SEARCH_TERM)
  })

  it('no two buyer pages share a title or a description', () => {
    expect(new Set(FAMILY_PAGES.map((page) => page.title)).size).toBe(FAMILY_PAGES.length)
    expect(new Set(FAMILY_PAGES.map((page) => page.description)).size).toBe(FAMILY_PAGES.length)
  })
})

describe('the words state only what the site already states', () => {
  const minimum = FACTS.find((fact) => fact.label.startsWith('Minimum'))?.value ?? 'missing'
  const sampleDays = FACTS.find((fact) => fact.label.startsWith('Working days'))?.value ?? 'missing'

  for (const page of FAMILY_PAGES) {
    const words = everyWord(page)

    // The sample time is the clothing's; the owner left the ball's time off the page (2026-10-31).
    it(`${page.path}: the minimum and the sample time are the confirmed ones`, () => {
      expect(page.description).toContain(`from ${minimum} pieces`)
      if (CLOTHING_PAGES.includes(page)) {
        expect(page.description).toContain(`from ${minimum} pieces per style`)
        expect(page.lede).toContain(`${sampleDays} working days`)
      } else {
        expect(page.lede).not.toMatch(/working days/i)
      }
    })

    /*
     * Each of these was left out on purpose on 2026-09-30, and each is the owner's to add:
     * sublimation (the site pictures screen printing only), a bulk lead time (removed by
     * the owner, `companyFacts.ts`), a certificate the company does not itself hold, and
     * 1889 as a founding year.
     */
    /*
     * Owner, 2026-10-26 (site check): two questions may name sublimation and embroidery (the printing
     * guide's own words, and the polo's own page), and the recycled-fabric sentence may say
     * "certified suppliers" (the FAQ's answer F10, word for word). Anywhere else on a page each still
     * fails.
     */
    it(`${page.path}: no printing method, lead time, certificate or founding year is claimed`, () => {
      const elsewhere = everyWord({
        ...page,
        questions: page.questions.filter((entry) => !PRINTING_QUESTIONS.has(entry.question)),
      })
      expect(elsewhere).not.toMatch(/sublimat/i)
      expect(elsewhere).not.toMatch(/embroider/i)
      expect(words).not.toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*days/i)
      expect(words.split(RECYCLED_ORGANIC).join('')).not.toMatch(
        /certified|OEKO|GOTS|SMETA|SEDEX|ISO\s?9001/i,
      )
      expect(words).not.toMatch(/1889|since \d{4}|founded|established/i)
    })

    it(`${page.path}: no invented proof and no pressure`, () => {
      expect(words).not.toMatch(/trusted by|\d+\+?\s*(?:brands|teams|clients|customers)/i)
      expect(words).not.toMatch(/limited time|only \d+ (?:slots|left)|hurry|act now/i)
    })

    // It shows no factory pictures since polish S4: the home page has them, once.
    it(`${page.path}: it shows a real family`, () => {
      expect(FAMILIES).toContain(familyOf(page))
    })
  }

  it('a planted claim is caught (negative control)', () => {
    const planted = `${everyWord(FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number])}\nFull sublimation, 15-20 days.`
    expect(planted).toMatch(/sublimat/i)
    expect(planted).toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*days/i)
  })
})

describe('where a family card leads', () => {
  it('to its buyer page when it has one, else to its group on the products page (polish S1)', () => {
    for (const family of FAMILIES) {
      const page = familyPageFor(family)
      expect(familyHref(family)).toBe(page ? page.path : `/products#${family.slug}`)
    }
    const teamwear = FAMILIES.find((family) => family.slug === 'teamwear-uniforms')
    expect(teamwear && familyHref(teamwear)).toBe('/custom-teamwear-manufacturer')
    // The family's own page, never its product line's (owner, 2026-10-31).
    const accessories = FAMILIES.find((family) => family.slug === 'sports-accessories')
    expect(accessories && familyHref(accessories)).toBe('/custom-sports-accessories-manufacturer')
  })

  it('a page naming a family that does not exist throws rather than rendering empty', () => {
    const first = FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number]
    expect(() => familyOf({ ...first, familySlug: 'no-such-family' })).toThrow(/no-such-family/)
  })
})

describe('what the ball page must never say', () => {
  const ball = FAMILY_PAGES.find((page) => page.productLine)
  const words = ball ? everyWord(ball) : ''

  // FIFA's marks are licensed; the ball holds none, so a buyer has to read that here.
  it('says the ball holds no FIFA licence wherever it names FIFA', () => {
    expect(words).toMatch(/Is the Kaizen FIFA licensed\?/)
    expect(words).toMatch(/does not carry a FIFA mark/)
    expect(words).not.toMatch(/FIFA[- ](?:approved|certified|inspected)/i)
    // NEGATIVE CONTROL: the pattern sees the claim it forbids.
    expect('A FIFA-approved ball').toMatch(/FIFA[- ](?:approved|certified|inspected)/i)
  })
})

describe('the data a search engine reads', () => {
  const page = FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number]

  it('the trail is Home, then this page, on absolute addresses', () => {
    const trail = breadcrumbJsonLd(page)
    expect(trail['@type']).toBe('BreadcrumbList')
    expect(trail.itemListElement.map((item) => item.item)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}${page.path}`,
    ])
  })

  it('carries every question the page shows, word for word, and nothing else', () => {
    const data = faqJsonLd(page.questions)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity.map((entry) => [entry.name, entry.acceptedAnswer.text])).toEqual(
      page.questions.map((entry) => [entry.question, entry.answer]),
    )
  })
})

/*
 * The guides each buyer page links to (owner, 2026-10-23). A crawl that day counted 2 internal links
 * to the country comparison and to the start-up cost guide, against 8–9 for every other guide.
 */
describe('the guides a buyer page links to', () => {
  it.each(OWN_PAGES)('$path links the printing, fabrics and country guides', (page) => {
    expect(rangeGuidePaths(page)).toEqual(
      expect.arrayContaining([
        '/guides/garment-printing-methods',
        '/guides/sportswear-fabrics-and-weights',
        '/guides/pakistan-vs-china-vs-turkey',
      ]),
    )
  })

  it('keeps the guides about cloth off the soccer ball page', () => {
    const ball = FAMILY_PAGES.find((page) => page.productLine)
    expect(ball && rangeGuidePaths(ball)).toEqual(['/guides/pakistan-vs-china-vs-turkey'])
  })

  it('links the start-up cost guide from the activewear page, and only there', () => {
    const withCost = FAMILY_PAGES.filter((page) =>
      rangeGuidePaths(page).includes('/guides/cost-to-start-an-activewear-brand'),
    ).map((page) => page.path)
    expect(withCost).toEqual(['/custom-activewear-manufacturer'])
  })

  it.each(FAMILY_PAGES)('$path names only guides that exist, each once', (page) => {
    const paths = rangeGuidePaths(page)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(() => guideAt(path)).not.toThrow()
  })
})

/*
 * The questions each buyer page asks (owner, 2026-10-26, site check: "nothing said twice on one
 * page"). Four of the six every page shared repeated the page's own opening paragraph and closing
 * band, so a page now asks its own questions and keeps only the two that say something new.
 */
describe('the questions on a buyer page (owner, 2026-10-26)', () => {
  const SHARED = ['Do you keep stock designs we can pick from?', 'Where do you ship?']
  // The four the owner dropped: what the page already says in its label, opening and closing.
  const DROPPED =
    /^What is the minimum order for\b|^How long does a sample take\?|^Can the (?:kit|jackets|garments) carry our own brand\?|^What do you need from us to quote\?/

  const own = (page: (typeof FAMILY_PAGES)[number]) =>
    page.questions.filter((entry) => !SHARED.includes(entry.question))

  it('each page ends with the two shared questions and asks its own before them', () => {
    for (const page of FAMILY_PAGES) {
      expect(
        page.questions.slice(-2).map((entry) => entry.question),
        page.path,
      ).toEqual(SHARED)
      expect(own(page).length, page.path).toBe(page.questions.length - 2)
    }
  })

  it('no page asks the four questions that repeated the page', () => {
    for (const page of FAMILY_PAGES) {
      for (const entry of page.questions) expect(entry.question, page.path).not.toMatch(DROPPED)
    }
    // NEGATIVE CONTROL, run both ways: the dropped questions are caught, and a kept one is not.
    for (const old of [
      'What is the minimum order for custom teamwear?',
      'How long does a sample take?',
      'Can the kit carry our own brand?',
      'Can the garments carry our own brand?',
      'What do you need from us to quote?',
    ]) {
      expect(old).toMatch(DROPPED)
    }
    expect('Do you keep stock designs we can pick from?').not.toMatch(DROPPED)
  })

  it('no page repeats a question or an answer', () => {
    for (const page of FAMILY_PAGES) {
      const questions = page.questions.map((entry) => entry.question)
      const answers = page.questions.map((entry) => entry.answer)
      expect(new Set(questions).size, page.path).toBe(questions.length)
      expect(new Set(answers).size, page.path).toBe(answers.length)
    }
  })

  it('the teamwear page carries the owner’s name-and-number answer, word for word', () => {
    const teamwear = FAMILY_PAGES.find((page) => page.path === '/custom-teamwear-manufacturer')
    expect(teamwear?.questions).toContainEqual({
      question: 'Can each piece carry its own name and number?',
      answer:
        'Yes. Each piece can carry its own name and number, and they count toward the same minimum.',
    })
  })

  // Fact 8b stays out until the owner gives the water temperatures a wetsuit is made for.
  it('no page says what water temperature a wetsuit suits', () => {
    for (const page of FAMILY_PAGES) expect(everyWord(page), page.path).not.toMatch(/temperature/i)
  })

  // A guide is static and a page's counts are database figures: a typed "nine of the ten" or "four
  // use DTF" is wrong the day a garment is added. An answer names its garments instead.
  it('no answer counts the catalogue', () => {
    const counted =
      /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:reference |live )?(?:garments|colou?rways|families)\b|\b(?:nine|seven|six|three) of (?:them|the ten)\b|\b(?:four|two|one|three|five) uses?\b/i
    for (const page of FAMILY_PAGES) {
      for (const entry of page.questions) expect(entry.answer, page.path).not.toMatch(counted)
    }
    for (const planted of [
      'Nine of the ten blend in 5 to 25% spandex.',
      'Four use DTF: the pullover.',
      'One uses digital printing.',
      'The 41 reference garments come in five colorways.',
    ]) {
      expect(planted, planted).toMatch(counted)
    }
  })
})
