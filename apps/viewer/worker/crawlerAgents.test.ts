import { describe, expect, it } from 'vitest'
import { CRAWLER } from './crawlerAgents'

/**
 * Which user agents get the garment page's robot copy (`crawlerAgents.ts`).
 *
 * The full strings below are the vendors' own, copied on 2026-10-08 from
 * developers.openai.com/api/docs/bots and docs.perplexity.ai/guides/bots. Anthropic's
 * crawler page (dated 2026-04-07) names Claude-User but publishes no full string, so that
 * agent is tested by its token alone, in `apps/cms/src/viewerCrawlerAgents.test.ts` with
 * every other AI agent the website knows.
 */
const VENDOR_STRINGS = {
  'ChatGPT-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  'OAI-SearchBot':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
  'Perplexity-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  PerplexityBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
}

/**
 * The negative control. A browser that matched would be sent down the crawler branch,
 * which waits on the CMS payload before the first byte: ~2 s instead of ~0.1 s for every QR
 * scan (`index.ts`, measured 2026-08-08). Adding a word to the list that a browser's
 * string happens to contain is exactly how that would ship.
 */
const BROWSERS = {
  'Chrome on a Mac':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Safari on an iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'Chrome on Android':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  'Samsung Internet':
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  'Edge on Windows':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  'Firefox on Windows':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
}

describe('CRAWLER', () => {
  it.each(Object.entries(VENDOR_STRINGS))('matches %s by its published string', (_, ua) => {
    expect(CRAWLER.test(ua)).toBe(true)
  })

  it('matches ChatGPT-User by its NAME, not by the "/bot" at the end of its URL', () => {
    // Until 2026-10-08 this agent matched only because its string ends
    // `+https://openai.com/bot`; OpenAI changing that URL would have silently dropped it.
    const withoutUrl = VENDOR_STRINGS['ChatGPT-User'].replace('; +https://openai.com/bot', '')
    expect(withoutUrl).not.toContain('bot')
    expect(CRAWLER.test(withoutUrl)).toBe(true)
  })

  it.each(Object.entries(BROWSERS))('does NOT match %s', (_, ua) => {
    expect(CRAWLER.test(ua)).toBe(false)
  })
})
