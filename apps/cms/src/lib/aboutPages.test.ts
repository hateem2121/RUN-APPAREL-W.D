import { describe, expect, it } from 'vitest'
import { FACTS, PRECISION_MACHINES, CUTTING_LINES } from './companyFacts'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { ENVIRONMENTAL_LINES, ABOUT_FACTORY_PATHS, ABOUT_PAGE, FACTORY_PAGE } from './aboutPages'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'

/**
 * The about and factory pages' words (the about-factory build, 2026-10-09), held as
 * `companyPages.test.ts` holds the other company pages: the owner approved every word on
 * 2026-10-09, so a change to a sentence here is a change the owner has not seen. The site-wide
 * claims (no founding date, no year count, no "certified") are `siteFacts.test.ts`'s, which walks
 * this module like the other copy modules.
 */
const BRAND_SUFFIX = ' — RUN APPAREL'
const factValue = (prefix: string) =>
  FACTS.find((fact) => fact.label.startsWith(prefix))?.value ?? ''

describe('what a search result shows', () => {
  for (const page of [ABOUT_PAGE, FACTORY_PAGE]) {
    it(`${page.path}: the whole title fits and the description can be the snippet`, () => {
      expect(`${page.title}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    })
  }
})

describe("the owner's approved words stay word for word", () => {
  it('timeline card 3 keeps the owner’s words of 2026-10-09 exactly', () => {
    expect(ABOUT_PAGE.timeline.entries[2].body).toBe(
      "Allah Ditta Ghafuree helps scale Pakistan's daily football output to 200,000. His sons extend the reach: Sandal Trading Corporation in 1942, Loyal Sports in 1952 — exporting to Europe by 1958.",
    )
  })

  it('the mission is the owner’s sentence, untouched by the plain-English edits', () => {
    expect(ABOUT_PAGE.mission).toBe(
      'To empower global partners with sustainable, high-performance apparel that drives unity, endurance, and excellence — combining ethical craftsmanship with technological precision.',
    )
  })

  it('the factory label is built from the shared address, uppercased', () => {
    expect(FACTORY_PAGE.label).toBe('[ 13 KM DASKA ROAD · SIALKOT · PAKISTAN ]')
    expect(FACTORY_PAGE.label).toMatch(/SIALKOT/)
  })
})

describe('the numbers come from the constants', () => {
  it('the facts band repeats no typed figure: each value is its constant’s', () => {
    const band = ABOUT_PAGE.factsBand.map((fact) => fact.value)
    expect(band).toContain(factValue('Pieces per month'))
    expect(band).toContain(factValue('People'))
    expect(band).toContain(factValue('Sq m'))
    expect(band).toContain(PRECISION_MACHINES.value)
    expect(band).toContain(CUTTING_LINES.value)
    expect(band[0]).toBe('1889')
    expect(ABOUT_PAGE.factsBand[0].labelFirst).toBe(true)
  })

  it('the factory description’s floor area is the FACTS value', () => {
    expect(FACTORY_PAGE.description).toContain(`${factValue('Sq m')} sq m`)
    expect(FACTORY_PAGE.description).not.toMatch(/sq\.?\s*ft/i)
  })

  it('the environmental lines are the policy’s own, not a second copy typed here', () => {
    expect(ENVIRONMENTAL_LINES.length).toBe(4)
    expect(ENVIRONMENTAL_LINES[0]).toContain('Solar panels on the roof')
  })
})

describe('every photo and link the pages name exists', () => {
  const slugs = new Set(FACTORY_PHOTOS.map((photo) => photo.slug))

  it('stage and gallery photos are factory photos', () => {
    for (const stage of FACTORY_PAGE.walkthrough.stages) {
      for (const slug of stage.photos) expect(slugs.has(slug), slug).toBe(true)
    }
    for (const set of FACTORY_PAGE.gallery.sets) {
      expect(set.photos.length, `${set.label} has no photos`).toBeGreaterThan(0)
      for (const slug of set.photos) expect(slugs.has(slug), slug).toBe(true)
    }
  })

  it('links only to pages this site serves', () => {
    const known = new Set([
      '/',
      '/contact',
      '/guides/how-a-private-label-order-works',
      '/policies/environmental',
      // The four buyer pages `whatWeMake` links (the copy guard's own known list).
      '/custom-teamwear-manufacturer',
      '/custom-activewear-manufacturer',
      '/private-label-casual-wear-manufacturer',
      '/custom-outerwear-manufacturer',
      ...ABOUT_FACTORY_PATHS,
    ])
    const links = [
      ...ABOUT_PAGE.whatWeMake.links.map((link) => link.href),
      ABOUT_PAGE.crossLink.href,
      FACTORY_PAGE.walkthrough.close.href,
      FACTORY_PAGE.howWeRunIt.link.href,
      FACTORY_PAGE.crossLink.href,
    ]
    for (const href of links) expect(known.has(href), href).toBe(true)
  })
})
