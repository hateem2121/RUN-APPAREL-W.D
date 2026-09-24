import { AI_CRAWLER_UAS, TRAINING_ONLY_UAS } from '../../htmlLimitedBots.mjs'
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
 * the EU. The stronger move — `Disallow: /` for the training-only crawlers — was then
 * taken as its own decision: five on 2026-09-07, eight on both hosts since 2026-09-11
 * (see the refused group in buildRobotsTxt).
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

/**
 * The refused group: read nothing at all.
 *
 * ⚠️ NO `Allow:` LINE, AND THAT IS THE WHOLE DIFFERENCE. Adding one beside `Disallow: /`
 * makes the group ambiguous — most crawlers resolve a conflict by longest match, and
 * `Allow: /` ties with `Disallow: /` — so the obvious "keep it consistent with the other
 * groups" edit quietly re-opens the crawl.
 *
 * The Content-Signal stays: the refusal and the reason are not the same statement, and a
 * crawler that ignores the `Disallow` should still meet the objection.
 */
function refusedGroup(agents: readonly string[]): string {
  return [
    ...agents.map((agent) => `User-agent: ${agent}`),
    `Content-Signal: ${CONTENT_SIGNAL}`,
    'Disallow: /',
  ].join('\n')
}

/**
 * The crawlers that are welcome: every named AI crawler that is not on the training-only
 * list. Derived rather than typed, so an agent cannot end up in BOTH groups — which is
 * the state where what a crawler does is anybody's guess.
 */
export const ANSWERING_UAS = AI_CRAWLER_UAS.filter((agent) => !TRAINING_ONLY_UAS.includes(agent))

/**
 * Re-exported so a robots.txt parser is written once and read twice: `viewerRobots.test.ts`
 * (the repo's copy of the viewer's static file) and `scripts/public-security-probe.mjs`
 * (the LIVE file, so production is checked to actually serve what the repo says it should
 * — FI-07) both call the same functions rather than each keeping its own copy that could
 * drift. Defined in `robotsTxtParse.ts`, not here, because that file has no other imports
 * and this one does (`./seo`) — see that file's own docblock for why the split matters.
 */
export { agentsOf, lower, robotsTxtGroups } from './robotsTxtParse'

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
# These are the ones that read in order to ANSWER a question and cite you for it. They are
# welcome, and they are the same list that ${'`htmlLimitedBots.mjs`'} gives a blocking metadata
# render to: a crawler we invite is a crawler we owe a finished <head>.
${group(ANSWERING_UAS)}

# ⚠️ AND THESE READ ONLY TO TRAIN. Refused outright — owner decision 2026-09-07, widened to eight on both hosts 2026-09-11, taken
# after the objection above was already on the record and they asked what would make it
# effective. It costs nothing a buyer would notice, because every one of them has a
# sibling above that does the answering: OAI-SearchBot cites you in ChatGPT, Googlebot
# ranks you and feeds AI Overviews, Applebot serves Siri. Blocking GPTBot has no
# measurable effect on ChatGPT citations, and blocking Google-Extended affects neither
# Search ranking nor AI Overviews. htmlLimitedBots.mjs carries the sources.
#
# ⚠️ NEVER PUT A SEARCH CRAWLER IN THIS GROUP. OAI-SearchBot, Claude-SearchBot,
# PerplexityBot, ChatGPT-User or Claude-User here makes this site invisible to the answer
# engines a buyer actually asks — and it would read as tightening security.
${refusedGroup(TRAINING_ONLY_UAS)}

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
