import type { Metadata } from 'next'
import { PressPage as PressLayout } from '../../../components/site/PressPage'
import { PRESS_PAGE } from '../../../lib/companyPages'
import { getJournalPosts, getSiteSettings } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `careers/page.tsx` for the folder-name rule. */
const PATH = '/press'

export const metadata: Metadata = buildMetadata({
  title: PRESS_PAGE.title,
  description: PRESS_PAGE.description,
  path: PATH,
})

/** How many "Company news" posts the page lists, newest first (D8: "the latest"). */
const NEWS_LIMIT = 3

export default async function PressPage() {
  const [settings, posts] = await Promise.all([getSiteSettings(), getJournalPosts()])
  const news = posts.filter((post) => post.cluster?.value === 'company-news').slice(0, NEWS_LIMIT)
  return <PressLayout companyName={settings.companyName} news={news} />
}
