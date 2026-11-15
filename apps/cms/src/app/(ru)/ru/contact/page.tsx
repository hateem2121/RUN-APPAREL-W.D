// The Russian twin of app/(frontend)/contact/page.tsx (Russian section, 2026-11-15): the same page
// (`ContactPageView`), in Russian. The form posts to the same /contact/submit with `lang=ru`, which
// sends the buyer back here; the stored inquiry and the team's email are the English page's.
import type { Metadata } from 'next'
import { ContactPageView } from '../../../../components/site/ContactPage'
import { CONTACT_DESCRIPTION_RU } from '../../../../lib/pageDescriptions.ru'
import { buildMetadata } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Контакты: пошив одежды под брендом в Сиалкоте',
  description: CONTACT_DESCRIPTION_RU,
  path: '/contact',
  locale: 'ru',
})

export default async function RussianContactPage({
  searchParams,
}: {
  searchParams: Promise<{
    sent?: string
    error?: string
    reason?: string
    garment?: string | string[]
    colour?: string | string[]
  }>
}) {
  return <ContactPageView searchParams={searchParams} locale="ru" />
}
