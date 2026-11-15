// The Russian hub of app/(frontend)/case-studies/page.tsx (Russian section, 2026-11-15): Russian words, the
// English case studies (database text stays English), each labelled «на английском». The studies
// themselves have no Russian twin and no hreflang pair.
import type { Metadata } from 'next'
import { CaseStudyIndex } from '../../../../components/site/CaseStudyPage'
import { getCaseStudies } from '../../../../lib/content'
import { CASE_STUDIES_HUB_RU as HUB } from '../../../../lib/caseStudies.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(HUB),
  description: HUB.description,
  path: '/case-studies',
  locale: 'ru',
})

export default async function RussianCaseStudyIndexPage() {
  return <CaseStudyIndex studies={await getCaseStudies()} locale="ru" />
}
