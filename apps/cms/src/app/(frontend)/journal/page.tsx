import type { Metadata } from 'next'
import { JournalIndex } from '../../../components/site/JournalIndex'
import { getJournalPosts } from '../../../lib/content'
import { JOURNAL_HUB, JOURNAL_PATH, JOURNAL_RSS_PATH } from '../../../lib/journal'
import { buildMetadata, withFeed } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The Journal hub. The words are in `lib/journal.ts`, the layout in
 * `components/site/JournalIndex.tsx`, the posts in the CMS; this file is the address and its
 * metadata.
 *
 * ⚠️ `noindex` UNTIL A POST IS PUBLISHED (the empty-hub rule, as T5 is for case studies): an
 * empty hub is thin content. With one, the layout's own value applies (`robotsFor`), so a site
 * hidden as a whole stays hidden. The feed link joins with the first post too.
 */
export async function generateMetadata(): Promise<Metadata> {
  const base = buildMetadata({
    title: JOURNAL_HUB.title,
    description: JOURNAL_HUB.description,
    path: JOURNAL_PATH,
  })
  const posts = await getJournalPosts()
  if (posts.length === 0) return { ...base, robots: { index: false } }
  return withFeed(base, { title: 'RUN APPAREL Journal', path: JOURNAL_RSS_PATH })
}

export default async function JournalPage() {
  return <JournalIndex posts={await getJournalPosts()} />
}
