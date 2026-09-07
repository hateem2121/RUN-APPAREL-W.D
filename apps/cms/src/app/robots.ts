import type { MetadataRoute } from 'next'
import { AI_CRAWLER_UAS } from '../../htmlLimitedBots.mjs'
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
 */
/**
 * ⚠️ NOT ACCESS CONTROL, AND SHARED BY EVERY GROUP. Both paths are guarded by
 * authentication; a `Disallow` is a request to well-behaved crawlers. It is worth stating
 * anyway — without it the login screen is a candidate for indexing and `/api/*` is
 * crawlable JSON that costs a D1 read to serve.
 */
const DISALLOW = ['/admin', '/api/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      /*
       * ⚠️ THE AI CRAWLERS ARE NAMED, AND THE DISALLOWS ARE REPEATED FROM THE SAME
       * CONSTANT. This is the one dangerous edit in this file. A robots.txt group for a
       * named user agent REPLACES the `*` group for that agent — it does not add to it —
       * so writing `User-agent: GPTBot` + `Allow: /` and nothing else would invite every
       * AI crawler into `/admin` and `/api/`, which is the opposite of what naming them
       * was for. Sharing `DISALLOW` means the two groups cannot drift; `robots.test.ts`
       * asserts every group carries it.
       *
       * WHY NAME THEM AT ALL, when the policy is identical to `*`. Audit FA-N-17: the
       * file said nothing about AI crawlers, so "are we open to them?" had no answer on
       * the site — and the answer here has a history. Cloudflare's managed robots.txt was
       * prepending nine `Disallow` lines and a `Content-Signal: ai-train=no` to this
       * host's file until the owner turned it off on 2026-09-04, so reading the file in
       * the repo told you nothing about what a crawler received. Stating it explicitly is
       * what makes the deliberate answer legible in the served file.
       *
       * The list is the same one `htmlLimitedBots.mjs` gives a blocking render to, from
       * the same constant — a crawler we invite is a crawler we owe a finished `<head>`.
       */
      {
        userAgent: [...AI_CRAWLER_UAS],
        allow: '/',
        disallow: DISALLOW,
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
