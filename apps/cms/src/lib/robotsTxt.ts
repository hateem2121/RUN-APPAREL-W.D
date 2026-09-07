import { AI_CRAWLER_UAS } from '../../htmlLimitedBots.mjs'
import { SITE_ORIGIN, VIEWER_ORIGIN } from './seo'

/**
 * `/robots.txt` for the public marketing site.
 *
 * ⚠️ THIS IS A HAND-BUILT FILE AND IT USED TO BE `app/robots.ts`, NEXT'S CONVENTION.
 * The convention returns a `MetadataRoute.Robots` object and can emit only `User-agent`,
 * `Allow`, `Disallow`, `Sitemap` and `Host`. `Content-Signal` — see below — is a field it
 * has no representation for, and there is no escape hatch. So the file is written out
 * here and served by `app/robots.txt/route.ts`, exactly as `/llms.txt` already is.
 *
 * ⚠️ ONLY ONE OF THE TWO MAY EXIST. `app/robots.ts` and `app/robots.txt/route.ts` both
 * answer `/robots.txt`; leaving the old one in place would make which of them wins a
 * property of Next's internals rather than a decision. It is deleted.
 */

/**
 * ⚠️ NOT ACCESS CONTROL, AND SHARED BY EVERY GROUP. Both paths are guarded by
 * authentication; a `Disallow` is a request to well-behaved crawlers. It is worth stating
 * anyway — without it the login screen is a candidate for indexing and `/api/*` is
 * crawlable JSON that costs a D1 read to serve.
 */
export const DISALLOW = ['/admin', '/api/']

/**
 * The owner's answer to "what may be done with this content once it has been read".
 *
 * Cloudflare's Content Signals Policy splits reuse into three, and a value of `yes`
 * permits, `no` refuses, and ABSENCE expresses no preference at all
 * (https://contentsignals.org). Owner decision 2026-09-07, asked as one question with the
 * consequence of each answer stated:
 *
 *   search=yes     be findable. The whole point of the site.
 *   ai-input=yes   let an answer engine quote the real capacity figures to a buyer who
 *                  asks, with a link back. This is what "make the site readable to AI"
 *                  was for.
 *   ai-train=no    do NOT keep this company's photography and copy as material for
 *                  training a model. The owner's objection, on the record.
 *
 * ⚠️ IT IS A STATED PREFERENCE, NOT A BLOCK, AND THE OWNER CHOSE IT KNOWING THAT. Google
 * and Bing ignore the field outright; a badly-behaved scraper ignores everything. What it
 * does is put a reservation of rights in machine-readable form, which carries weight in
 * the EU. The stronger move — `Disallow: /` for the training-only crawlers (GPTBot,
 * Google-Extended, Applebot-Extended, CCBot, Bytespider) while leaving the SEARCH
 * crawlers allowed — was deliberately not taken here: it is a different decision, with a
 * discoverability cost, and it is the owner's to make separately.
 *
 * ⚠️ AND CLOUDFLARE USED TO INJECT THE OPPOSITE OF THIS. Its managed robots.txt prepended
 * `Content-Signal: ai-train=no` plus nine `Disallow` lines to this host's file until the
 * owner switched that feature off on 2026-09-04 — so for a period, reading this file in
 * the repository told you nothing about what a crawler received. If the managed feature
 * is ever turned back on, it wins and this line becomes decoration.
 */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no'

/**
 * One group's worth of lines.
 *
 * ⚠️ EVERY GROUP CARRIES THE SIGNAL AND THE DISALLOWS, AND THAT IS THE WHOLE REASON THIS
 * IS A FUNCTION. Per RFC 9309 a group for a named user agent REPLACES the `*` group for
 * that agent rather than adding to it. Put `Content-Signal` only in `*` and the AI
 * crawlers it is written for — the ones with a group of their own — never see it; put the
 * `Disallow` lines only in `*` and those same crawlers are invited into `/admin`. Both
 * mistakes read as tidier files.
 */
function group(agents: readonly string[]): string {
  return [
    ...agents.map((agent) => `User-agent: ${agent}`),
    `Content-Signal: ${CONTENT_SIGNAL}`,
    'Allow: /',
    ...DISALLOW.map((path) => `Disallow: ${path}`),
  ].join('\n')
}

export function buildRobotsTxt(): string {
  return `# What may be done with this content: ${CONTENT_SIGNAL}
# https://contentsignals.org — a stated preference, not a technical block.

${group(['*'])}

# ⚠️ THE AI CRAWLERS ARE NAMED, AND THE POLICY IS REPEATED RATHER THAN INHERITED.
# A named group replaces the wildcard group for that agent, so every line above has to
# appear again here or it does not apply to them. Audit FA-N-17: this file said nothing
# about AI crawlers at all, so "are we open to them?" had no answer on the site. The
# answer is yes for reading and answering, no for training.
#
# Same list that ${'`htmlLimitedBots.mjs`'} gives a blocking metadata render to: a crawler we
# invite is a crawler we owe a finished <head>.
${group(AI_CRAWLER_UAS)}

# ⚠️ BOTH HOSTS, AND THAT IS OWNER DECISION D11 OF 2026-09-07 (FA-N-13).
# The garments live on a different host with its own sitemap, and a SITEMAP may only list
# URLs on the host that serves it — which is why sitemap.ts lists no garments. robots.txt
# is the one file that may point a crawler at a sitemap on another host, and doing so is
# what tells a search engine these two origins are one business rather than two unrelated
# sites. It is a hint, not a grant: a crawler trusts a cross-host sitemap only when both
# hosts are verified in the same Search Console account, which is the other half of D11.
Sitemap: ${SITE_ORIGIN}/sitemap.xml
Sitemap: ${VIEWER_ORIGIN}/sitemap.xml
`
}
