/**
 * Which user agents get the per-garment rewrite (`index.ts` explains why ONLY crawlers do).
 *
 * Split out of `index.ts` on 2026-10-08 for the reason `crawlerCacheHeaders.ts` was:
 * `index.ts` needs HTMLRewriter and a service binding, so vitest cannot load it, and this
 * list needs a test.
 *
 * ⚠️ "bot" IS NOT IN EVERY AI AGENT'S NAME, AND THE ONES WITHOUT IT ARE THE ONES ASKING FOR
 * A BUYER. Measured in the findability audit of 2026-10-08: a garment page fetched as
 * Claude-User returned the 16-word "Loading" shell, not the 153-word copy Googlebot gets,
 * because `Claude-User` matches none of "bot", "crawler" or "spider" — and Cloudflare's logs
 * for 5-8 Oct show Claude-User reading 22 pages of the site. Perplexity-User's published
 * string (`…compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user`, read on
 * docs.perplexity.ai/guides/bots that day) has no "bot" either, and ChatGPT-User matched only
 * by luck: its string ends `+https://openai.com/bot` (developers.openai.com/api/docs/bots,
 * same day). Those three fetch a page because a person asked about it, so a miss costs a
 * citation at the moment it matters most.
 *
 * So every AI agent without "bot" in its name is listed by name below.
 * `apps/cms/src/viewerCrawlerAgents.test.ts` fails if a name is added to the website's
 * `AI_CRAWLER_UAS` (apps/cms/htmlLimitedBots.mjs) and this list does not match it.
 *
 * Matching an agent here is not the same as welcoming it. robots.txt still refuses the eight
 * training-only crawlers on this host (`apps/viewer/public/robots.txt`); a crawler that
 * ignores that gets the same public sentence a person sees.
 */
export const CRAWLER = new RegExp(
  [
    // Almost every major crawler self-identifies with "bot": Googlebot, bingbot,
    // Twitterbot, LinkedInBot, Slackbot-LinkExpanding, Discordbot, TelegramBot,
    // Applebot (iMessage), redditbot, Pinterestbot, Applebot-Extended.
    'bot',
    'crawler',
    'spider',
    // The ones that do not.
    'facebookexternalhit',
    'facebookcatalog',
    'whatsapp',
    'skypeuripreview',
    'vkshare',
    'iframely',
    'embedly',
    'cardyb', // Bluesky
    'mastodon',
    'slack-imgproxy',
    'google-inspectiontool',
    'link preview',
    'linkpreview',
    // AI agents without "bot" in their name (2026-10-08, above). The fetchers a person
    // triggers by asking a question come first.
    'chatgpt-user',
    'claude-user',
    'perplexity-user',
    'amzn-user',
    'mistralai-user',
    'meta-externalfetcher',
    'kagi-fetcher',
    // Indexers and the rest.
    'mistralai-index',
    'meta-webindexer',
    'meta-externalagent',
    'cohere-ai',
    'anthropic-ai',
  ].join('|'),
  'i',
)
