import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAMILY_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { FACTS } from './companyFacts'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { FAMILIES } from './families'
import { FAMILY_PAGES, familyHref, familyOf, familyPageFor } from './familyPages'
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
const BRAND_SUFFIX = ' — RUN APPAREL'
/** A buyer-page title must LEAD with the term a buyer types. */
const LEADS_WITH_SEARCH_TERM = /^(?:custom|private label)/i

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
    ...page.steps.flatMap((step) => [step.title, step.body]),
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

    it(`${page.path}: the minimum and the sample time are the confirmed ones`, () => {
      expect(page.description).toContain(`from ${minimum} pieces per style`)
      expect(page.lede).toContain(`${sampleDays} working days`)
    })

    /*
     * Each of these was left out on purpose on 2026-09-30, and each is the owner's to add:
     * sublimation (the site pictures screen printing only), a bulk lead time (removed by
     * the owner, `companyFacts.ts`), a certificate the company does not itself hold, and
     * 1889 as a founding year.
     */
    it(`${page.path}: no printing method, lead time, certificate or founding year is claimed`, () => {
      expect(words).not.toMatch(/sublimat/i)
      expect(words).not.toMatch(/embroider/i)
      expect(words).not.toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*days/i)
      expect(words).not.toMatch(/certified|OEKO|GOTS|SMETA|SEDEX|ISO\s?9001/i)
      expect(words).not.toMatch(/1889|since \d{4}|founded|established/i)
    })

    it(`${page.path}: no invented proof and no pressure`, () => {
      expect(words).not.toMatch(/trusted by|\d+\+?\s*(?:brands|teams|clients|customers)/i)
      expect(words).not.toMatch(/limited time|only \d+ (?:slots|left)|hurry|act now/i)
    })

    it(`${page.path}: it shows a real family and real, wide factory pictures`, () => {
      expect(FAMILIES).toContain(familyOf(page))
      expect(page.photos.length).toBeGreaterThan(0)
      for (const slug of page.photos) {
        expect(FACTORY_PHOTOS.find((photo) => photo.slug === slug)?.shape, slug).toBe('wide')
      }
    })
  }

  it('a planted claim is caught (negative control)', () => {
    const planted = `${everyWord(FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number])}\nFull sublimation, 15-20 days.`
    expect(planted).toMatch(/sublimat/i)
    expect(planted).toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*days/i)
  })
})

describe('where a family card leads', () => {
  it('to its buyer page when it has one, else to the filtered gallery', () => {
    for (const family of FAMILIES) {
      const page = familyPageFor(family)
      expect(familyHref(family)).toBe(page ? page.path : `/products?family=${family.slug}`)
    }
    const teamwear = FAMILIES.find((family) => family.slug === 'teamwear-uniforms')
    expect(teamwear && familyHref(teamwear)).toBe('/custom-teamwear-manufacturer')
    // Sports Accessories has no garments, so no page (owner, 2026-09-30).
    const accessories = FAMILIES.find((family) => family.slug === 'sports-accessories')
    expect(accessories && familyHref(accessories)).toBe('/products?family=sports-accessories')
  })

  it('a page naming a family that does not exist throws rather than rendering empty', () => {
    const first = FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number]
    expect(() => familyOf({ ...first, familySlug: 'no-such-family' })).toThrow(/no-such-family/)
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
