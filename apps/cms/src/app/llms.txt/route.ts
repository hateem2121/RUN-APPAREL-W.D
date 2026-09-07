import { buildLlmsTxt } from '../../lib/llmsTxt'
import { SITE_ORIGIN, VIEWER_ORIGIN } from '../../lib/seo'

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
 */
export const dynamic = 'force-static'

export function GET(): Response {
  return new Response(buildLlmsTxt(SITE_ORIGIN, VIEWER_ORIGIN), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
