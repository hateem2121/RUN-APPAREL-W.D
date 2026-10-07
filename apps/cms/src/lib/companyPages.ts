import type { GuideBlock } from './guides'

/**
 * The company pages (PLAN.md D3/D4): careers and community.
 *
 * ⚠️ WORDS LAND HERE ONLY AFTER THE OWNER APPROVES THEM (G1/G20): each draft goes to
 * `~/Sites/Model-Viewer-main/.superpowers/page-creation-2026-10-06/drafts/` first. The
 * benefits list is ONE constant shared by both pages, so they cannot disagree; the
 * "How to apply" email is read from `getSiteSettings()` at render time, never typed.
 */

/** One section of a company page, drawn like a guide's. */
export type CompanySection = {
  /** Anchor id inside the page, lowercase and hyphens (e.g. `what-we-offer`, `training`, `apply`). */
  readonly id: string
  readonly heading: string
  readonly blocks: readonly GuideBlock[]
}

/** The benefits everyone who works here gets — shared by Careers and Community (owner C-2, 2026-10-07). */
export const WORK_HERE: readonly string[] = []
