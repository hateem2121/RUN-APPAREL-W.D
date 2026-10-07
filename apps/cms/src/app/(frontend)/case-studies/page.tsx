import type { Metadata } from 'next'
import { CaseStudyIndex } from '../../../components/site/CaseStudyPage'
import { CASE_STUDIES_HUB, CASE_STUDIES_PATH } from '../../../lib/caseStudies'
import { getCaseStudies } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The case-study hub (PLAN.md D9). ⚠️ `noindex` UNTIL ONE IS PUBLISHED (T5): with none it is a
 * page about case studies to come, which is thin content; the first published case study
 * switches it on, and the layout's own value applies from then.
 */
export async function generateMetadata(): Promise<Metadata> {
  const base = buildMetadata({
    title: CASE_STUDIES_HUB.title,
    description: CASE_STUDIES_HUB.description,
    path: CASE_STUDIES_PATH,
  })
  const studies = await getCaseStudies()
  return studies.length === 0 ? { ...base, robots: { index: false } } : base
}

export default async function CaseStudiesPage() {
  return <CaseStudyIndex studies={await getCaseStudies()} />
}
