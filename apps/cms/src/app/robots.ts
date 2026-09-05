import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '../lib/seo'

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
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
