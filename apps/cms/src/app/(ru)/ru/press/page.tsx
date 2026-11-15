// The Russian twin of app/(frontend)/press/page.tsx (Russian section, 2026-11-15): the same page in
// Russian, drawn by the same component with locale="ru".
import type { Metadata } from 'next'
import { PressPage as PressLayout } from '../../../../components/site/PressPage'
import { PRESS_PAGE_RU } from '../../../../lib/companyPages.ru'
import { getJournalPosts, getSiteSettings } from '../../../../lib/content'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(PRESS_PAGE_RU),
  description: PRESS_PAGE_RU.description,
  path: '/press',
  locale: 'ru',
})

/** As the English page: the three newest company-news posts (English, labelled so). */
const NEWS_LIMIT = 3

export default async function RussianPressPage() {
  const [settings, posts] = await Promise.all([getSiteSettings(), getJournalPosts()])
  const news = posts.filter((post) => post.cluster?.value === 'company-news').slice(0, NEWS_LIMIT)
  return <PressLayout companyName={settings.companyName} news={news} locale="ru" />
}
