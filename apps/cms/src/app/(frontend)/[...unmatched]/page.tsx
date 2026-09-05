import { notFound } from 'next/navigation'

/**
 * Every URL the site does not otherwise serve.
 *
 * ⚠️ WHY A CATCH-ALL IS NEEDED AT ALL, rather than just `not-found.tsx`. A
 * `not-found.tsx` inside a route group only answers `notFound()` calls raised WITHIN
 * that group's segments. A URL that matches no route at all is a different case, and
 * with two route groups at the root Next cannot know whose layout to wrap it in — so it
 * falls back to its own bare "404: This page could not be found", with no navigation and
 * no way back. Measured before this existed.
 *
 * This route exists so an unmatched URL enters the (frontend) group, where `notFound()`
 * renders the branded page inside the site's own layout, still with a 404 status.
 *
 * ⚠️ IT DOES NOT SHADOW THE ADMIN OR THE API. Next resolves more specific segments
 * first, so `/admin/[[...segments]]` and `/api/[...slug]` in the (payload) group win, and
 * files in `public/` plus the `robots`/`sitemap` conventions are served before app
 * routing is consulted. That is the reasoning; `e2e/notfound.spec.ts` is the proof,
 * because getting this wrong would take down the admin and the public API together.
 */
export default function UnmatchedRoute(): never {
  notFound()
}
