/**
 * Which crawlers must be given a COMPLETE `<head>` rather than a streamed one.
 *
 * Next 15.2+ streams metadata: it flushes the document shell first and emits `<title>`,
 * the canonical link and the Open Graph tags later, in the body, where React moves them
 * into the head on the client. For a browser that is invisible and faster. For a crawler
 * that does not run JavaScript it means the page has no title and no canonical at all.
 *
 * Next already knows this and blocks for a list of user agents it calls "HTML-limited"
 * (`next/dist/shared/lib/router/utils/html-bots.js`). That list is search engines and
 * link unfurlers, written before answer engines mattered, and it contains no AI crawler.
 *
 * ⚠️ MEASURED HERE, NOT ASSUMED — 2026-09-07, `next start` on the real build, one request
 * per user agent, reading the byte offset of `<title>` against the offset of `</head>`.
 * A 1500 ms delay was added to `generateMetadata` as the positive control, because
 * without one the metadata resolves before the shell flushes and EVERY agent passes,
 * which is a fact about how fast this page happens to be and not about the contract:
 *
 * ```
 *                bytes   </head>@   <title>@   in head?
 *   browser      43225        980      40506   no
 *   Googlebot    43225        980      40506   no    <- deliberate, see below
 *   Bingbot      41730       2589        907   YES   <- on Next's default list
 *   GPTBot       43225        980      40506   no    <- the finding
 *   ClaudeBot    43225        980      40506   no    <- the finding
 * ```
 *
 * Bingbot proves the mechanism works and that the probe can see it; GPTBot and ClaudeBot
 * are the defect. Audit FA-N-18 and FA-N-05 are this one line of configuration.
 *
 * ⚠️ GOOGLEBOT IS ABSENT ON PURPOSE, AND ADDING IT WOULD BE A REGRESSION. Next classes
 * it separately as a bot that spins up a real browser (`HEADLESS_BROWSER_BOT_UA_RE`
 * matches `Googlebot`; the HTML-limited pattern does not), so it executes the JavaScript
 * that moves the tags into the head and gets the faster streamed response. AI crawlers
 * are the opposite case: they read raw HTML and skip client-side rendering entirely
 * (https://www.cite.sh/blog/ai-crawler-guide/), which is exactly why they need this.
 *
 * ⚠️ THIS VALUE REPLACES NEXT'S DEFAULT — IT DOES NOT EXTEND IT.
 * `shouldServeStreamingMetadata` reads `htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING`
 * (`next/dist/server/lib/streaming-metadata.js`), so setting this to the AI crawlers
 * alone would silently drop Bingbot, Slackbot, Twitterbot, LinkedInBot,
 * facebookexternalhit and every other unfurler — trading one broken audience for a
 * larger one, with nothing to say so. Next's own source is therefore embedded below
 * VERBATIM, and `src/htmlLimitedBots.test.ts` asserts it is still byte-identical to the
 * installed Next's default. When a Next upgrade adds a bot, that test fails and names
 * the line to update. Same shape as the two copies of the CSP in
 * `apps/viewer/scripts/csp.test.ts`, and the same reason: a duplicated constant is only
 * safe when something fails the moment the copies disagree.
 */

/**
 * Next 16.3.0's own default, copied verbatim from
 * `next/dist/shared/lib/router/utils/html-bots.js`. Do not edit by hand — the test
 * compares it against the installed package.
 */
export const NEXT_DEFAULT_HTML_LIMITED_BOTS =
  '[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight'

/**
 * The AI crawlers this site wants to be legible to.
 *
 * Deliberately a short, named list rather than the ~200 tokens in the community
 * `ai.robots.txt` inventory. Every entry here is a crawler that (a) reads raw HTML with
 * no JavaScript and (b) feeds something a buyer might actually ask — an answer engine,
 * a search index, or an assistant fetching a page a person pasted. Adding a long tail of
 * scrapers would cost a regex alternative each and change nothing a buyer sees.
 *
 * `Google-Extended`, `GoogleOther` and `Applebot-Extended` are NOT here because Next's
 * default already matches them (`Google-[\w-]+` and `applebot` respectively).
 */
export const AI_CRAWLER_UAS = [
  // OpenAI — training, the ChatGPT search index, and the user-triggered fetcher.
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic.
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  // Perplexity.
  'PerplexityBot',
  'Perplexity-User',
  // Meta.
  'meta-externalagent',
  'meta-externalfetcher',
  'FacebookBot',
  // Amazon.
  'Amazonbot',
  'Amzn-SearchBot',
  // Mistral.
  'MistralAI-User',
  'MistralAI-Index',
  // Others with a real answer surface.
  'DuckAssistBot',
  'YouBot',
  'cohere-ai',
  'kagi-fetcher',
  'ExaBot',
  'PetalBot',
  'CCBot',
  'Bytespider',
  'Diffbot',
]

/**
 * Crawlers that read only to TRAIN, and are refused the crawl outright in robots.txt.
 *
 * Owner decision 2026-09-07. They had already refused training as a stated preference
 * (`Content-Signal: ai-train=no`, decision D20) and asked what best practice was for
 * making that refusal effective. It is this list, and the reason it costs nothing is that
 * every one of them has a SIBLING that does the answering:
 *
 *   GPTBot              trains OpenAI's models  ·  OAI-SearchBot cites you in ChatGPT
 *   Google-Extended     trains Gemini           ·  Googlebot ranks you and feeds AI Overviews
 *   Applebot-Extended   trains Apple's models   ·  Applebot serves Siri and Spotlight
 *   CCBot               fills a public dataset others train from
 *   Bytespider          ByteDance; mixed robots.txt compliance on the record
 *
 * ⚠️ MEASURED BY OTHERS, NOT ASSUMED BY ME. Blocking GPTBot has no measurable effect on
 * ChatGPT citations — the two crawlers are independent access decisions, and it is
 * blocking OAI-SearchBot that removes you from ChatGPT answers
 * (https://cloro.dev/research/ai-crawler-blocks/). Blocking Google-Extended affects
 * neither Search ranking nor AI Overviews eligibility, both of which run off Googlebot
 * (https://aicrawlercheck.com/blog/google-extended-vs-googlebot).
 *
 * ⚠️ SO THE DANGEROUS EDIT IS ADDING A SIBLING TO THIS LIST. `OAI-SearchBot`,
 * `Claude-SearchBot`, `PerplexityBot`, `ChatGPT-User` or `Claude-User` here would make
 * this site invisible to the answer engines a buyer actually asks — which is the opposite
 * of what the site is for, and would look like tightening security.
 * `src/lib/robotsTxt.test.ts` asserts each of those five is on the ALLOWED side.
 *
 * ⚠️ AND `ClaudeBot` IS DELIBERATELY NOT HERE. It is plausibly the training crawler by the
 * same pattern, and I could not establish that to the standard the five above meet. An
 * over-block costs a lead and is invisible; leave it allowed until someone measures it.
 */
export const TRAINING_ONLY_UAS = [
  'GPTBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
]

/**
 * The value for `next.config.mjs` -> `htmlLimitedBots`.
 *
 * A pattern SOURCE, not a RegExp: Next serialises it into the build output and
 * reconstructs it with `new RegExp(pattern, 'i')`, so it is matched case-insensitively
 * and must not carry flags or delimiters of its own.
 */
export const HTML_LIMITED_BOTS = `${NEXT_DEFAULT_HTML_LIMITED_BOTS}|${AI_CRAWLER_UAS.join('|')}`
