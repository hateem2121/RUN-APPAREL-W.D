import { buildRobotsTxt } from '../../lib/robotsTxt'

/**
 * `/robots.txt`.
 *
 * ⚠️ THIS REPLACED `app/robots.ts`, NEXT'S ROBOTS CONVENTION, AND THE OLD FILE IS GONE.
 * The convention can emit only `User-agent`, `Allow`, `Disallow`, `Sitemap` and `Host`;
 * `Content-Signal` is a field it has no representation for and no escape hatch to reach.
 * Both files answer the same URL, so leaving the old one in place would make which of
 * them wins a property of Next's internals rather than a decision. `lib/robotsTxt.ts`
 * carries the content and the reasoning.
 *
 * ⚠️ AND IT SITS AT `src/app/`, OUTSIDE BOTH ROUTE GROUPS, FOR THE REASON `/llms.txt`
 * does: `(frontend)/layout.tsx` is a full HTML document, and a text file wrapped in
 * `<html>` is not a text file.
 *
 * Cached far less aggressively than llms.txt. That one describes the business and changes
 * about never; this one carries a reuse policy the owner may change, and a crawler
 * holding a stale copy of a reservation of rights is the wrong way round.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  return new Response(buildRobotsTxt(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  })
}
