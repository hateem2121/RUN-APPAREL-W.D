// The Russian twin of app/(frontend)/policies/quality/page.tsx (Russian section, 2026-11-15): the same page in
// Russian, drawn by the same component with locale="ru".
import type { Metadata } from 'next'
import { PolicyPage } from '../../../../../components/site/PolicyPage'
import { policyAtRu } from '../../../../../lib/i18n/ruNames'
import { buildMetadata, metaTitleOf } from '../../../../../lib/seo'

export const dynamic = 'force-dynamic'

const PATH = '/policies/quality'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(policyAtRu(PATH)),
  description: policyAtRu(PATH).description,
  path: PATH,
  locale: 'ru',
})

export default function RussianQualityPolicyPage() {
  return <PolicyPage policy={policyAtRu(PATH)} locale="ru" />
}
