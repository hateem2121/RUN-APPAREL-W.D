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
 * ⚠️ INDEXED FROM DAY ONE, EVEN EMPTY (owner, 2026-10-07: "Show them right away"). The first
 * plan kept an empty hub `noindex` as thin content (T5); the owner chose to show it at once, so
 * the layout's own value applies (`robotsFor`) and a site hidden as a whole stays hidden. The
 * feed link still joins with the first post: an empty feed gives a reader nothing to follow.
 */
export async function generateMetadata(): Promise<Metadata> {
  const base = buildMetadata({
    title: JOURNAL_HUB.title,
    description: JOURNAL_HUB.description,
    path: JOURNAL_PATH,
  })
  const posts = await getJournalPosts()
  if (posts.length === 0) return base
  return withFeed(base, { title: 'RUN APPAREL Journal', path: JOURNAL_RSS_PATH })
}

export default async function JournalPage() {
  return <JournalIndex posts={await getJournalPosts()} />
}
