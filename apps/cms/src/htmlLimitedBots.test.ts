import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/is-bot.js'
import { shouldServeStreamingMetadata } from 'next/dist/server/lib/streaming-metadata.js'
import { describe, expect, it } from 'vitest'
import {
  AI_CRAWLER_UAS,
  HTML_LIMITED_BOTS,
  NEXT_DEFAULT_HTML_LIMITED_BOTS,
} from '../htmlLimitedBots.mjs'

/**
 * The guard for audit FA-N-18 and FA-N-05 — an AI crawler receiving a page with no
 * `<title>` and no canonical, because Next streamed the metadata into the body.
 *
 * ⚠️ THIS TEST EXISTS BECAUSE THE BROWSER-LEVEL CHECK CANNOT FAIL TODAY. Measured on
 * 2026-09-07: with the metadata resolving as fast as it currently does, every user agent
 * receives a complete head whether this configuration is present or not. The defect only
 * appears once metadata takes longer than the shell — which a slow D1 read, an extra
 * `await`, or a Suspense boundary would each produce, in a change that has nothing to do
 * with crawlers and would pass every other gate. So the property being guarded is the
 * CONTRACT (these agents are never given streamed metadata), not one page's timing, and
 * it is asserted through Next's own decision function rather than through a page.
 *
 * The 1500 ms delay used as the positive control, and the byte offsets it produced, are
 * recorded in `apps/cms/htmlLimitedBots.mjs`.
 */

/** Real user-agent strings, not bare tokens — the regex is tested the way it is used. */
const AI_CRAWLERS: Record<string, string> = {
  GPTBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  'OAI-SearchBot':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  ClaudeBot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Claude-User': 'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  PerplexityBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'meta-externalagent':
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  Amazonbot:
    'Mozilla/5.0 (Linux; like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Amazonbot/0.1',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  Bytespider:
    'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
}

/** Agents Next's default already covers. Losing any of them is the cost of a careless edit. */
const UNFURLERS: Record<string, string> = {
  Bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  Slackbot: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  Twitterbot: 'Twitterbot/1.0',
  LinkedInBot:
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  facebookexternalhit: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  WhatsApp: 'WhatsApp/2.23.20.0 A',
}

const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const ours = new RegExp(HTML_LIMITED_BOTS, 'i')
const nextDefault = new RegExp(NEXT_DEFAULT_HTML_LIMITED_BOTS, 'i')

describe('the embedded copy of Next’s default', () => {
  /*
   * The whole safety of extending this option rests on the copy being current. Next
   * merges nothing: `htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING`. If a Next
   * upgrade adds a crawler to its list, this fails and names the line to update, which
   * is the only reason duplicating a vendor constant is acceptable here.
   */
  it('is byte-identical to the installed Next', () => {
    expect(NEXT_DEFAULT_HTML_LIMITED_BOTS).toBe(HTML_LIMITED_BOT_UA_RE.source)
  })
})

describe('AI crawlers are never served streamed metadata', () => {
  for (const [name, ua] of Object.entries(AI_CRAWLERS)) {
    it(`${name} is matched by the configured pattern`, () => {
      expect(ours.test(ua)).toBe(true)
    })

    /*
     * THE NEGATIVE CONTROL, and the reason the test above is worth anything. If Next's
     * default already covered these agents the configuration would be inert, every
     * assertion here would still pass, and nobody would know. This is the assertion that
     * fails if the option is ever deleted from next.config.mjs — because then the
     * default is what runs.
     */
    it(`${name} is NOT matched by Next’s default, so the configuration does real work`, () => {
      expect(nextDefault.test(ua)).toBe(false)
    })

    it(`Next’s own decision function blocks metadata for ${name}`, () => {
      expect(shouldServeStreamingMetadata(ua, HTML_LIMITED_BOTS)).toBe(false)
      // ...and would not, on the default.
      expect(shouldServeStreamingMetadata(ua, undefined)).toBe(true)
    })
  }
})

describe('nothing already covered is lost', () => {
  for (const [name, ua] of Object.entries(UNFURLERS)) {
    it(`${name} still gets a complete head`, () => {
      expect(nextDefault.test(ua)).toBe(true)
      expect(ours.test(ua)).toBe(true)
      expect(shouldServeStreamingMetadata(ua, HTML_LIMITED_BOTS)).toBe(false)
    })
  }
})

describe('who is deliberately excluded', () => {
  /*
   * A pattern that matched a browser would turn streaming metadata off for every human
   * visitor — the option's failure mode is silent and site-wide, so it is asserted.
   */
  it('a plain browser keeps streamed metadata', () => {
    expect(ours.test(BROWSER)).toBe(false)
    expect(shouldServeStreamingMetadata(BROWSER, HTML_LIMITED_BOTS)).toBe(true)
  })

  /*
   * Googlebot runs a real browser and moves the tags into the head itself, so Next puts
   * it on the OTHER list on purpose. Adding it here would cost it a blocking render for
   * nothing. The assertion records that this is a decision rather than an oversight.
   */
  it('Googlebot is excluded, because it executes JavaScript', () => {
    expect(nextDefault.test(GOOGLEBOT)).toBe(false)
    expect(ours.test(GOOGLEBOT)).toBe(false)
  })
})

describe('the list itself', () => {
  it('has no duplicates and no regex metacharacters', () => {
    expect(new Set(AI_CRAWLER_UAS).size).toBe(AI_CRAWLER_UAS.length)
    for (const token of AI_CRAWLER_UAS) {
      expect(token, `${token} would change the meaning of the pattern`).toMatch(/^[\w-]+$/)
    }
  })

  /*
   * `Google-Extended` and `Applebot-Extended` are covered by the default's `Google-[\w-]+`
   * and `applebot`. Listing them again would read as thoroughness and be pure noise; this
   * asserts the claim in the module comment is still true of the installed Next.
   */
  it('omits the AI agents Next already covers', () => {
    expect(nextDefault.test('Google-Extended')).toBe(true)
    expect(nextDefault.test('Applebot-Extended/1.0')).toBe(true)
    expect(AI_CRAWLER_UAS).not.toContain('Google-Extended')
    expect(AI_CRAWLER_UAS).not.toContain('Applebot-Extended')
  })
})

/**
 * And the half that a passing unit test cannot tell you: whether the option is still
 * WIRED. Everything above exercises the pattern; delete `htmlLimitedBots` from
 * next.config.mjs and all of it still passes, because Next would quietly fall back to
 * its own default and nothing would say so.
 *
 * Next serialises the resolved config into `.next/required-server-files.json`, which is
 * what the running server reads. Same discipline as src/hostRulesManifest.test.ts, and
 * for the same reason publicViewerHeaders.mjs records: a value that did not reach the
 * build does not exist, however correct the config file reads.
 *
 * ⚠️ NEGATIVE CONTROL, OBSERVED 2026-09-07. This assertion was written and run against
 * the build made BEFORE the option was added, and failed with the default pattern on the
 * left-hand side. It is not a check that has only ever been seen to pass.
 */
describe('the build carries the configured pattern', () => {
  const REQUIRED = join(import.meta.dirname, '..', '.next', 'required-server-files.json')
  const requireBuild = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
  const hasBuild = existsSync(REQUIRED)

  it('a CI step that forgot to build cannot pass this file', () => {
    expect(
      requireBuild && !hasBuild,
      'REQUIRE_BUILD_ARTIFACTS=1 but .next has no required-server-files.json',
    ).toBe(false)
  })

  it.skipIf(!hasBuild && !requireBuild)('htmlLimitedBots reached next.config’s output', () => {
    const built = JSON.parse(readFileSync(REQUIRED, 'utf8')) as {
      config: { htmlLimitedBots?: string }
    }
    expect(
      built.config.htmlLimitedBots,
      'the build is running on Next’s default — htmlLimitedBots is missing from next.config.mjs',
    ).toBe(HTML_LIMITED_BOTS)
  })
})
