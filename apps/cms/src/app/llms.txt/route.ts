import { getCaseStudies, getJournalPosts } from '../../lib/content'
import { buildLlmsTxt } from '../../lib/llmsTxt'
import { SITE_ORIGIN } from '../../lib/seo'

/**
 * `/llms.txt`.
 *
 * ⚠️ THIS SITS AT `src/app/`, OUTSIDE BOTH ROUTE GROUPS, FOR THE REASON `robots.ts` DOES.
 * `(frontend)` and `(payload)` contribute nothing to the URL, so a route inside either
 * would still answer at `/llms.txt` — but it would also inherit that group's layout, and
 * `(frontend)/layout.tsx` is a full HTML document. A text file wrapped in `<html>` is not
 * a text file.
 *
 * A route handler rather than a file in `public/`, because the content is generated from
 * the same constants the pages render (`lib/llmsTxt.ts` carries the reasoning) and the
 * origins come from `lib/seo.ts` rather than being typed twice.
 *
 * Cached for an hour at the edge and a day as stale. It changes when the company's
 * confirmed numbers change, which is to say almost never, and a crawler re-reading it
 * every request costs a Worker invocation for an identical answer.
 *
 * ⚠️ READ PER REQUEST SINCE 2026-10-07 (it was `force-static`). The Journal and the case
 * studies join this file only once one is published (PLAN.md E9 and the empty-hub rule), and a
 * build has no database to ask. The readers keep 60 seconds in memory and never throw: a
 * database failure lists neither, and the rest of the file is unchanged.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const [posts, caseStudies] = await Promise.all([getJournalPosts(), getCaseStudies()])
  const published = { posts: posts.length, caseStudies: caseStudies.length }
  return new Response(buildLlmsTxt(SITE_ORIGIN, published), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
