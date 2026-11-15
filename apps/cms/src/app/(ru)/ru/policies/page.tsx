// The Russian twin of app/(frontend)/policies/page.tsx (Russian section, 2026-11-15): the same page in
// Russian, drawn by the same component with locale="ru".
import type { Metadata } from 'next'
import { PolicyIndex } from '../../../../components/site/PolicyIndex'
import { POLICIES_INDEX_RU } from '../../../../lib/policies.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(POLICIES_INDEX_RU),
  description: POLICIES_INDEX_RU.description,
  path: '/policies',
  locale: 'ru',
})

export default function RussianPoliciesPage() {
  return <PolicyIndex locale="ru" />
}
