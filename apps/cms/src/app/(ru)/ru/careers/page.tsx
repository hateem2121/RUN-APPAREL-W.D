// The Russian twin of app/(frontend)/careers/page.tsx (Russian section, 2026-11-15): the same page in
// Russian, drawn by the same component with locale="ru".
import type { Metadata } from 'next'
import { CareersForm } from '../../../../components/site/CareersForm'
import { CareersPage as CareersLayout } from '../../../../components/site/CareersPage'
import { CAREERS_PAGE_RU } from '../../../../lib/companyPages.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(CAREERS_PAGE_RU),
  description: CAREERS_PAGE_RU.description,
  path: '/careers',
  locale: 'ru',
})

export default async function RussianCareersPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; reason?: string }>
}) {
  const { sent, error, reason } = await searchParams
  return (
    <CareersLayout
      locale="ru"
      applyForm={<CareersForm query={{ sent, error, reason }} locale="ru" />}
    />
  )
}
