import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CASE_STUDY_PAGE_SOURCES,
  COMPANY_PAGE_SOURCES,
  FAQ_PAGE_SOURCES,
  GLOSSARY_PAGE_SOURCES,
  JOURNAL_PAGE_SOURCES,
  POLICY_PAGE_SOURCES,
  PUBLIC_PAGE_SOURCES,
  sourceMatches,
} from '../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../siteHostRules.mjs'
import { CASE_STUDIES_PATH } from './lib/caseStudies'
import { COMPANY_PATHS } from './lib/companyPages'
import { FAQ_PATHS } from './lib/faqs'
import { GLOSSARY_INDEX } from './lib/glossary'
import { JOURNAL_PATH, JOURNAL_RSS_PATH } from './lib/journal'
import { POLICY_PATHS } from './lib/policies'
import { buildLlmsTxt } from './lib/llmsTxt'
import { sitemapFor } from './lib/searchVisibility'

/**
 * The site-wide wiring test (PLAN.md Task 1.6): a new page missing from ONE registration
 * list is silent everywhere else — each area's own test (policies, companyPages, guides)
 * checks its list against its routes, and this one holds every NEW path across the
 * registrations that belong to no single area. Phase 3 adds FAQ_PATHS and `/glossary`,
 * Phase 5 adds press.
 */
const FRONTEND = join(import.meta.dirname, 'app', '(frontend)')
const ORIGIN = 'https://wear-run.com'
const EDGE_SCRIPT = readFileSync(
  join(import.meta.dirname, '..', 'e2e', 'csp-nonce-edge.mjs'),
  'utf8',
)

const NEW_PATHS = [...POLICY_PATHS, ...COMPANY_PATHS, ...FAQ_PATHS, GLOSSARY_INDEX.path]

describe('every new page is wired everywhere a public page must be', () => {
  it('the area lists and the header lists agree, so nothing is checked that does not exist', () => {
    // Control for the loop below: the paths come from the same lists the header file
    // spreads, or the test would be wiring nothing.
    expect(POLICY_PATHS).toEqual(POLICY_PAGE_SOURCES)
    expect(COMPANY_PATHS).toEqual(COMPANY_PAGE_SOURCES)
    expect(FAQ_PATHS).toEqual(FAQ_PAGE_SOURCES)
    expect([GLOSSARY_INDEX.path]).toEqual(GLOSSARY_PAGE_SOURCES)
    expect(NEW_PATHS.length).toBeGreaterThanOrEqual(10)
  })

  /**
   * The Journal and the case studies (2026-10-07) are CMS pages: their hubs and each post are
   * wired into the header and redirect lists, the sitemap and llms.txt from day one (owner,
   * 2026-10-07: "Show them right away"); each published page joins the sitemap too.
   */
  describe('the Journal and the case studies', () => {
    const CMS_PAGES = [
      { sources: JOURNAL_PAGE_SOURCES, hub: JOURNAL_PATH, folder: 'journal' },
      { sources: CASE_STUDY_PAGE_SOURCES, hub: CASE_STUDIES_PATH, folder: 'case-studies' },
    ]

    for (const { sources, hub, folder } of CMS_PAGES) {
      it(`${hub}: the hub and its pages carry the security policy and the admin-host redirect`, () => {
        expect(sources).toEqual([hub, `${hub}/:slug`])
        for (const source of sources) {
          expect(PUBLIC_PAGE_SOURCES, 'missing from the security-policy list').toContain(source)
          expect(CMS_PUBLIC_PATHS, 'missing from the admin-host redirects').toContain(source)
        }
        expect(existsSync(join(FRONTEND, folder, 'page.tsx')), 'no hub route').toBe(true)
        expect(existsSync(join(FRONTEND, folder, '[slug]', 'page.tsx')), 'no page route').toBe(true)
        expect(EDGE_SCRIPT, 'missing from the CSP nonce edge script').toContain(`'${hub}'`)
      })

      // Owner, 2026-10-07: "Show them right away". The hub is offered even while empty.
      it(`${hub}: in the sitemap and llms.txt while nothing is published`, () => {
        const urls = sitemapFor('visible', ORIGIN, [], { posts: [], caseStudies: [] }).map(
          (entry) => entry.url,
        )
        expect(urls).toContain(`${ORIGIN}${hub}`)
        expect(buildLlmsTxt(ORIGIN)).toContain(`(${ORIGIN}${hub})`)
      })

      it(`${hub}: each published page joins the sitemap`, () => {
        const one = [{ path: `${hub}/first`, updatedAt: null }]
        const urls = sitemapFor('visible', ORIGIN, [], { posts: one, caseStudies: one }).map(
          (entry) => entry.url,
        )
        expect(urls).toContain(`${ORIGIN}${hub}`)
        expect(urls).toContain(`${ORIGIN}${hub}/first`)
      })
    }

    it('the feed sits beside the posts, inside the Journal’s header list', () => {
      expect(existsSync(join(FRONTEND, 'journal', 'rss.xml', 'route.ts'))).toBe(true)
      expect(sourceMatches('/journal/:slug', JOURNAL_RSS_PATH)).toBe(true)
    })
  })

  for (const path of NEW_PATHS) {
    it(`${path}: security policy, admin-host redirect, sitemap, llms.txt, edge script, route folder`, () => {
      expect(PUBLIC_PAGE_SOURCES, 'missing from the security-policy list').toContain(path)
      expect(CMS_PUBLIC_PATHS, 'missing from the admin-host redirects').toContain(path)
      expect(
        sitemapFor('visible', ORIGIN).map((entry) => entry.url),
        'missing from the sitemap',
      ).toContain(`${ORIGIN}${path}`)
      expect(buildLlmsTxt(ORIGIN), 'missing from llms.txt').toContain(`(${ORIGIN}${path})`)
      expect(EDGE_SCRIPT, 'missing from the CSP nonce edge script').toContain(`'${path}'`)
      expect(existsSync(join(FRONTEND, path.slice(1), 'page.tsx')), 'no route folder').toBe(true)
    })
  }
})
