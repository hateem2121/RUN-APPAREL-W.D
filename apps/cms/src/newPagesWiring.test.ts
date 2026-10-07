import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPANY_PAGE_SOURCES,
  POLICY_PAGE_SOURCES,
  PUBLIC_PAGE_SOURCES,
} from '../publicViewerHeaders.mjs'
import { COMPANY_PATHS } from './lib/companyPages'
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

const NEW_PATHS = [...POLICY_PATHS, ...COMPANY_PATHS]

describe('every new page is wired everywhere a public page must be', () => {
  it('the area lists and the header lists agree, so nothing is checked that does not exist', () => {
    // Control for the loop below: the paths come from the same lists the header file
    // spreads, or the test would be wiring nothing.
    expect(POLICY_PATHS).toEqual(POLICY_PAGE_SOURCES)
    expect(COMPANY_PATHS).toEqual(COMPANY_PAGE_SOURCES)
    expect(NEW_PATHS.length).toBeGreaterThanOrEqual(10)
  })

  for (const path of NEW_PATHS) {
    it(`${path}: security policy, admin-host redirect, sitemap, llms.txt, edge script, route folder`, () => {
      expect(PUBLIC_PAGE_SOURCES, 'missing from the security-policy list').toContain(path)
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
