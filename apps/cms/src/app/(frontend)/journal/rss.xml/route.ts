import { getJournalPosts } from '../../../../lib/content'
import { buildJournalRss } from '../../../../lib/journalRss'
import { SITE_ORIGIN } from '../../../../lib/seo'

/**
 * `/journal/rss.xml`, the Journal's RSS 2.0 feed (PLAN.md T9): the published posts the hub
 * shows, newest first, built by the pure `lib/journalRss.ts`.
 *
 * Read per request, because the posts live in the database and a build has none (the reason
 * `sitemap.ts` reads per request too). A feed reader polls; five minutes at the edge spares the
 * database a read per poll and still shows a new post within minutes. With no post published
 * it is a valid, empty channel.
 *
 * Inside `(frontend)` without its layout: a route handler answers on its own and inherits no
 * HTML (Next.js route.js docs, 16.4.0, read 2026-10-07). `/journal/rss.xml` also matches
 * `/journal/:slug` in `JOURNAL_PAGE_SOURCES`, which only adds the public pages' headers.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return new Response(buildJournalRss(await getJournalPosts(), SITE_ORIGIN), {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}
