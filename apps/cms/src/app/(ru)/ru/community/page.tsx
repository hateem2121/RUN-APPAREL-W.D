// The Russian twin of app/(frontend)/community/page.tsx (Russian section, 2026-11-15): the same page in
// Russian, drawn by the same component with locale="ru".
import type { Metadata } from 'next'
import { CommunityPage as CommunityLayout } from '../../../../components/site/CommunityPage'
import { COMMUNITY_PAGE_RU } from '../../../../lib/companyPages.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(COMMUNITY_PAGE_RU),
  description: COMMUNITY_PAGE_RU.description,
  path: '/community',
  locale: 'ru',
})

export default function RussianCommunityPage() {
  return <CommunityLayout locale="ru" />
}
