import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPANY_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import {
  CAREER_PATH,
  CAREERS_HERO_PHOTO,
  CAREERS_LIFE_PHOTOS,
  CAREERS_PAGE,
  COMMUNITY_PAGE,
  COMPANY_PATHS,
  PRESS_PAGE,
  ROLE_GROUPS,
  WORK_HERE,
} from './companyPages'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { buildLlmsTxt } from './llmsTxt'
import { POLICY_PATHS } from './policies'
import { sitemapFor } from './searchVisibility'

/**
 * The company pages' version of `guides.test.ts`: a page missing from one of the lists a
 * public page must be on is silent everywhere else. The anchors, the shared benefits list
 * and the no-typed-email rule are LinkedIn's and the owner's requirements made testable.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const ORIGIN = 'https://wear-run.com'
const BRAND_SUFFIX = ' — RUN APPAREL'
const PAGES = [CAREERS_PAGE, COMMUNITY_PAGE, PRESS_PAGE]

describe('every company page is wired everywhere a public page must be', () => {
  it('the page list and the header list name the same addresses, in the same order', () => {
    expect(COMPANY_PATHS).toEqual(COMPANY_PAGE_SOURCES)
  })

  for (const path of COMPANY_PATHS) {
    it(`${path} has a route folder, a policy, a redirect and a sitemap entry`, () => {
      expect(existsSync(join(FRONTEND, path.slice(1), 'page.tsx'))).toBe(true)
      expect(PUBLIC_PAGE_SOURCES).toContain(path)
      expect(CMS_PUBLIC_PATHS).toContain(path)
      expect(sitemapFor('visible', ORIGIN).map((entry) => entry.url)).toContain(`${ORIGIN}${path}`)
    })
  }

  it('every page is named in llms.txt', () => {
    const text = buildLlmsTxt(ORIGIN)
    for (const page of PAGES) expect(text).toContain(`(${ORIGIN}${page.path})`)
  })
})

describe('what a search result shows', () => {
  for (const page of PAGES) {
    it(`${page.path}: the whole title fits and the description can be the snippet`, () => {
      expect(`${page.title}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    })
  }
})

describe('the company pages, as the owner approved them', () => {
  it('carry the LinkedIn anchors on careers, in the approved ids', () => {
    // Part G §G4 points LinkedIn's commitments at these three anchors; renaming one
    // silently breaks an external field.
    expect(CAREERS_PAGE.sections.map((section) => section.id)).toEqual([
      'what-we-offer',
      'training',
      'roles',
      'apply',
      'life',
    ])
  })

  it('draw the benefits from the ONE shared list, on both pages', () => {
    // Reference equality on purpose: a second, equal list would be the drift D4 forbids.
    const careersOffer = CAREERS_PAGE.sections.find((section) => section.id === 'what-we-offer')
    const communityWork = COMMUNITY_PAGE.sections.find((section) => section.id === 'work')
    for (const section of [careersOffer, communityWork]) {
      const list = section?.blocks.find((block) => block.kind === 'list')
      expect(list && list.kind === 'list' ? list.items : null).toBe(WORK_HERE)
    }
    expect(WORK_HERE.join(' ')).toContain('Paid emergency leave')
    expect(WORK_HERE.join(' ')).not.toMatch(/annual leave/i)
  })

  it('type no email address: the apply line reads SiteSettings at render time', () => {
    // An `@` here would be a second copy of an address the owner edits in the admin.
    const source = readFileSync(join(import.meta.dirname, 'companyPages.ts'), 'utf8')
    expect(source).not.toMatch(/[\w.]+@[\w.]+\.\w{2,}/)
  })

  it('use only the two photos that exist, and only where the words name them', () => {
    // C-8 (2026-10-07): only the factory floor and the building photos exist.
    // solar-roof is the same building from above (factoryPhotos.ts), added with community's layout.
    const allowed = new Set(['stitching', 'exterior', 'solar-roof'])
    for (const page of PAGES) {
      for (const section of page.sections) {
        if (!section.photo) continue
        expect(allowed.has(section.photo), section.photo).toBe(true)
        expect(
          FACTORY_PHOTOS.some((photo) => photo.slug === section.photo),
          section.photo,
        ).toBe(true)
        const words = section.blocks
          .flatMap((block) => (block.kind === 'text' ? [block.text] : []))
          .join(' ')
        expect(
          words + section.heading,
          `${page.path}#${section.id}: the words must name the photo`,
        ).toMatch(/floor|building/i)
      }
    }
  })

  it('link only to pages this site serves', () => {
    const known = new Set([
      '/',
      '/contact',
      '/privacy',
      '/terms',
      // The press page's links out (D8).
      '/journal',
      '/products',
      ...POLICY_PATHS,
      ...COMPANY_PATHS,
    ])
    for (const page of PAGES) {
      for (const link of page.links) expect(known.has(link.href), link.href).toBe(true)
    }
  })
})

/*
 * The careers page's own layout (2026-10-07) draws three lists beside the approved sentences. They
 * add no word: each must already be said in the approved section it draws, so a list cannot run
 * ahead of what the owner signed off.
 */
describe('the careers layout adds no word to the approved sections', () => {
  const words = (id: string) => {
    const section = CAREERS_PAGE.sections.find((entry) => entry.id === id)
    if (!section) throw new Error(`no careers section ${id}`)
    return section.blocks
      .flatMap((block) =>
        block.kind === 'text' ? [block.text] : block.kind === 'list' ? block.items : [],
      )
      .join(' ')
      .toLowerCase()
  }

  it('every step of the drawn path is in the training sentence, in its order', () => {
    const sentence = words('training')
    const at = CAREER_PATH.map((step) => sentence.indexOf(step.toLowerCase()))
    expect(
      at.every((index) => index >= 0),
      CAREER_PATH.join(', '),
    ).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('the role groups are the roles list, and their names are how "How to apply" splits them', () => {
    const roles = CAREERS_PAGE.sections.find((entry) => entry.id === 'roles')
    const list = roles?.blocks.find((block) => block.kind === 'list')
    expect(list?.kind === 'list' ? list.items : []).toEqual(
      ROLE_GROUPS.flatMap((group) => group.roles),
    )
    const apply = words('apply')
    expect(apply).toContain('floor roles')
    expect(apply).toContain('an office role')
  })

  it('every careers photo exists, and "Life" names what each one shows', () => {
    // The photo's own word in the section's sentence: sewing, checking, packing.
    const shows: Record<string, string> = {
      stitching: 'sewing',
      inspection: 'checking',
      packing: 'packing',
      'screen-printing': 'printing',
    }
    for (const slug of [CAREERS_HERO_PHOTO, ...CAREERS_LIFE_PHOTOS]) {
      expect(
        FACTORY_PHOTOS.some((photo) => photo.slug === slug),
        slug,
      ).toBe(true)
      expect(words('life'), `${slug} is not named in "Life"`).toContain(shows[slug] ?? `(${slug})`)
    }
  })
})
