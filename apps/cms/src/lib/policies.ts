import type { GuideBlock } from './guides'

/**
 * The policy pages (PLAN.md D1/D2).
 *
 * ⚠️ WORDS LAND HERE ONLY AFTER THE OWNER APPROVES THEM (G1/G20): each draft goes to
 * `~/Sites/Model-Viewer-main/.superpowers/page-creation-2026-10-06/drafts/` first, and a
 * policy without approval is simply absent — never a "coming soon". Every number is
 * imported from `companyFacts.ts`, never retyped; the certificate sentences are
 * `CERTIFICATION_LINES` word for word.
 */

export type PolicyGroup = 'workplace' | 'production'

export type PolicySection = {
  /** Anchor id inside the page, lowercase and hyphens. */
  readonly id: string
  readonly heading: string
  readonly blocks: readonly GuideBlock[]
}

export type Policy = {
  readonly path: string
  readonly title: string
  /** ≤ 160 characters: the meta description. */
  readonly description: string
  readonly heading: string
  readonly headingAccent: string
  readonly lede: string
  /** YYYY-MM-DD — the date the owner approved this page's words. Never "today". */
  readonly lastReviewed: string
  readonly group: PolicyGroup
  readonly sections: readonly PolicySection[]
}

export const POLICIES: readonly Policy[] = []

export const POLICY_PATHS: readonly string[] = POLICIES.map((policy) => policy.path)

export function policyAt(path: string): Policy {
  const policy = POLICIES.find((entry) => entry.path === path)
  if (!policy) throw new Error(`No policy at ${path}`)
  return policy
}
