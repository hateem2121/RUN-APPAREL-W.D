import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { FACTS } from './companyFacts'
import { GUIDE_PATHS, GUIDES, GUIDES_INDEX, guideAt } from './guides'
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
            : [block.text],
      ),
    ]),
  ].join('\n')

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
