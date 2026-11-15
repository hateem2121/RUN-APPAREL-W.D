// The Russian hub of app/(frontend)/journal/page.tsx (Russian section, 2026-11-15): Russian words, the
// English posts (database text stays English), each labelled «на английском». The posts
// themselves have no Russian twin and no hreflang pair.
import type { Metadata } from 'next'
import { JournalIndex } from '../../../../components/site/JournalIndex'
import { getJournalPosts } from '../../../../lib/content'
import { JOURNAL_HUB_RU as HUB } from '../../../../lib/journal.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(HUB),
  description: HUB.description,
  path: '/journal',
  locale: 'ru',
})

export default async function RussianJournalIndexPage() {
  return <JournalIndex posts={await getJournalPosts()} locale="ru" />
}
