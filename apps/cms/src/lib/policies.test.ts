import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POLICY_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CMS_PUBLIC_PATHS } from '../../siteHostRules.mjs'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { CERTIFICATION_LINES, CERTIFICATION_PROMISE } from './companyFacts'
import { buildLlmsTxt } from './llmsTxt'
import {
  POLICIES,
  POLICIES_INDEX,
  POLICY_ACTION,
  POLICY_CLOSING,
  POLICY_PATHS,
  policyAt,
} from './policies'
import { sitemapFor } from './searchVisibility'

/**
 * The policies' version of `guides.test.ts`: a policy missing from one of the lists a
 * public page must be on is silent everywhere else. Task 1.6's `newPagesWiring.test.ts`
 * holds the same paths across the remaining registrations.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const ORIGIN = 'https://wear-run.com'
const BRAND_SUFFIX = ' — RUN APPAREL'

describe('every approved policy is wired everywhere a public page must be', () => {
  it('the policy list and the header list name the same addresses, in the same order', () => {
    expect(POLICY_PATHS).toEqual(POLICY_PAGE_SOURCES)
  })

  for (const path of POLICY_PATHS) {
    it(`${path} has a route folder, a policy, a redirect and a sitemap entry`, () => {
      expect(existsSync(join(FRONTEND, path.slice(1), 'page.tsx'))).toBe(true)
      expect(PUBLIC_PAGE_SOURCES).toContain(path)
      expect(CMS_PUBLIC_PATHS).toContain(path)
      expect(sitemapFor('visible', ORIGIN).map((entry) => entry.url)).toContain(`${ORIGIN}${path}`)
    })
  }

  it('every policy is named in llms.txt, and an unknown address throws', () => {
    const text = buildLlmsTxt(ORIGIN)
    expect(text).toContain(`(${ORIGIN}${POLICIES_INDEX.path})`)
    for (const policy of POLICIES) expect(text).toContain(`(${ORIGIN}${policy.path})`)
    expect(() => policyAt('/policies/no-such-policy')).toThrow(/no-such-policy/)
  })
})

describe('what a search result shows', () => {
  for (const page of [POLICIES_INDEX, ...POLICIES]) {
    it(`${page.path}: the whole title fits and the description can be the snippet`, () => {
      expect(`${page.title}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(page.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    })
  }
})

describe('a policy page, as the owner approved it', () => {
  it('carries the four sections, in the plan’s order and words', () => {
    for (const policy of POLICIES) {
      expect(policy.sections.map((section) => section.id)).toEqual([
        'commit',
        'day-to-day',
        'concerns',
        'responsible',
      ])
      expect(policy.sections.map((section) => section.heading)).toEqual([
        'What we commit to',
        'How it works day to day',
        'How to raise a concern',
        'Who is responsible',
      ])
    }
  })

  it('carries a real review date, never one in the future', () => {
    for (const policy of POLICIES) {
      expect(policy.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Date.parse(policy.lastReviewed)).not.toBeGreaterThan(Date.now())
    }
  })

  it('ends on the owner’s closing line, and the hub carries the owner’s certificate lines', () => {
    // The page component renders these constants, so page and words cannot drift.
    expect(POLICY_CLOSING).toBe(
      'This page is a plain-English summary of our policy. A buyer or auditor who needs the full document can ask us for it.',
    )
    expect(POLICY_ACTION).toBe('Ask us about a policy')
    expect(POLICIES_INDEX.standards).toEqual(CERTIFICATION_LINES)
    expect(POLICIES_INDEX.standardsPromise).toBe(CERTIFICATION_PROMISE)
  })

  it('the anti-harassment policy is absent until its committee exists', () => {
    // The owner holds this page (2026-10-07) until a complaints committee exists; it must
    // not ship as a stub, and the hub must not list it.
    expect(POLICY_PATHS).not.toContain('/policies/anti-harassment')
    expect(() => policyAt('/policies/anti-harassment')).toThrow(/anti-harassment/)
  })
})
