import type { MetadataRoute } from 'next'
import { SITE_ORIGIN, VIEWER_ORIGIN } from '../lib/seo'

/**
 * `/robots.txt` for the public marketing site.
 *
 * ⚠️ THIS FILE SITS AT `src/app/`, OUTSIDE BOTH ROUTE GROUPS, AND MUST STAY THERE.
 * `(frontend)` and `(payload)` are groups, so they contribute nothing to the URL — but
 * Next only treats `robots.ts` as the robots convention at the app root. Inside a group
 * it would be a stray module serving nothing, with no error to say so.
 *
 * WHY THIS EXISTS AT ALL. Until now this Worker served no robots.txt, so `/robots.txt`
 * fell through to the app and answered with HTML — which a crawler parses line by line
 * as directives. `apps/viewer/public/robots.txt` carries the same warning after the
 * same thing happened there on 2026-08-31.
 *
 * ⚠️ THE ADMIN AND THE REST API ARE DISALLOWED HERE, AND THAT IS NOT THEIR PROTECTION.
 * Both are guarded by authentication; a `Disallow` is a request to well-behaved
 * crawlers, not access control, and nothing here should ever be relied on as such. It
 * is worth stating anyway: without it, the login screen is a candidate for indexing,
 * and `/api/*` responses are crawlable JSON that costs D1 reads to serve.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    /*
     * ⚠️ BOTH SITEMAPS, AND THAT IS THE OWNER'S DECISION D11 OF 2026-09-07 (FA-N-13).
     *
     * The garments live on a different host with its own sitemap, and a SITEMAP may only
     * list URLs on the host that serves it — which is why sitemap.ts lists no garments.
     * `robots.txt` is the exception: it is the one file that may point a crawler at a
     * sitemap on another host, and doing so is what tells a search engine these two
     * origins are one business rather than two unrelated sites.
     *
     * It is a hint, not a grant. A crawler will only trust a cross-host sitemap when both
     * hosts are verified in the same Search Console account, which is the other half of
     * D11 and is on the owner's checklist.
     */
    sitemap: [`${SITE_ORIGIN}/sitemap.xml`, `${VIEWER_ORIGIN}/sitemap.xml`],
  }
}
