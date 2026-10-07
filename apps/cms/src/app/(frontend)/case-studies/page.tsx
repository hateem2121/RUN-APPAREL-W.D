import type { Metadata } from 'next'
import { CaseStudyIndex } from '../../../components/site/CaseStudyPage'
import { CASE_STUDIES_HUB, CASE_STUDIES_PATH } from '../../../lib/caseStudies'
import { getCaseStudies } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The case-study hub (PLAN.md D9). ⚠️ INDEXED FROM DAY ONE, EVEN EMPTY (owner, 2026-10-07: "Show
 * them right away", replacing T5's `noindex` until the first case study). The layout's own value
 * applies, so a site hidden as a whole stays hidden.
 */
export const metadata: Metadata = buildMetadata({
  title: CASE_STUDIES_HUB.title,
  description: CASE_STUDIES_HUB.description,
  path: CASE_STUDIES_PATH,
})

export default async function CaseStudiesPage() {
  return <CaseStudyIndex studies={await getCaseStudies()} />
}
