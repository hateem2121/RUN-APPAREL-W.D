import { describe, expect, it } from 'vitest'
import {
  LINK_PREVIEW_AGENTS,
  ROBOT_AGENTS,
  classifyAgent,
  isBrowserNavigation,
} from '../../../infra/apex-404/visitorAgent.js'

/**
 * Who opened a document link, read from the User-Agent (infra/apex-404/visitorAgent.js).
 *
 * WHY REAL STRINGS. A classifier tested against strings its author typed is tested against
 * the author's idea of a browser. Real ones carry the traps: every iPhone string says "like
 * Mac OS X", every Android string says "Linux", Edge and Samsung Internet both claim Chrome,
 * Telegram's preview robot claims to be X's, and CUBOT is a phone brand. Each string names
 * where it is published; the three in-app browsers and the CUBOT phone have no vendor
 * reference, and their comments say so.
 */

type Agent = ReturnType<typeof classifyAgent>

const person = (device: Agent['device'], system: string, browser: string): Agent => ({
  kind: 'person',
  device,
  system,
  browser,
})
const preview = (browser: string): Agent => ({
  kind: 'link-preview',
  device: 'unknown',
  system: 'other',
  browser,
})
const robot = (browser: string): Agent => ({
  kind: 'robot',
  device: 'unknown',
  system: 'other',
  browser,
})

/** A phone whose brand contains the letters b-o-t. It must stay a person. */
const CUBOT_PHONE =
  'Mozilla/5.0 (Linux; Android 9; CUBOT_X19) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.93 Mobile Safari/537.36'

/**
 * Chromium, "User-Agent Reduction": the reduced string for unifiedPlatform "Fuchsia" — a
 * person whose system this classifier does not name, so only a Client Hint can place it.
 */
const FUCHSIA_CHROME =
  'Mozilla/5.0 (Fuchsia) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const FIXTURES: [label: string, userAgent: string, expected: Agent][] = [
  // ── People on phones and tablets ───────────────────────────────────────────
  [
    'iPhone Safari',
    // MDN, "User-Agent" header reference: the Safari example.
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1',
    person('phone', 'iOS', 'Safari'),
  ],
  [
    'iPhone Chrome (CriOS)',
    // Chrome for Developers, "User-Agent strings": Chrome for iOS on an iPhone.
    'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/56.0.2924.75 Mobile/14E5239e Safari/602.1',
    person('phone', 'iOS', 'Chrome'),
  ],
  [
    'iPad with the legacy iPad token',
    // Apple, Safari Web Content Guide: the Safari on iPad string.
    'Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10',
    person('tablet', 'iPadOS', 'Safari'),
  ],
  [
    'Android Chrome phone',
    // Chromium, "User-Agent Reduction": the reduced Android string, deviceCompat "Mobile".
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    person('phone', 'Android', 'Chrome'),
  ],
  [
    'Android Chrome tablet, no Mobile token',
    // Chromium, "User-Agent Reduction": the same string with an empty deviceCompat.
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    person('tablet', 'Android', 'Chrome'),
  ],
  [
    'Samsung Internet',
    // Samsung Developers, "Samsung Internet for Android: User Agent String Format".
    'Mozilla/5.0 (Linux; Android 9; SAMSUNG SM-G960F Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/9.2 Chrome/67.0.3396.87 Mobile Safari/537.36',
    person('phone', 'Android', 'Samsung Internet'),
  ],
  // ── People on computers ────────────────────────────────────────────────────
  [
    'Windows Edge',
    // MDN, "User-Agent" header reference: the Edge example.
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
    person('computer', 'Windows', 'Edge'),
  ],
  [
    'Windows Chrome, reduced User-Agent',
    // Chromium, "User-Agent Reduction": unifiedPlatform "Windows NT 10.0; Win64; x64".
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    person('computer', 'Windows', 'Chrome'),
  ],
  [
    'macOS Safari',
    // WebKit freezes the macOS version at 10_15_7. This Safari 17 string is also the first
    // half of Apple's iMessage preview agent, measured in apps/cms/e2e/findability.spec.ts.
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    person('computer', 'macOS', 'Safari'),
  ],
  [
    'macOS Firefox',
    // MDN, "Firefox user agent string reference": the macOS form, with the 10.15 Firefox reports.
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
    person('computer', 'macOS', 'Firefox'),
  ],
  [
    'Linux Firefox',
    // MDN, "Firefox user agent string reference": Linux desktop on x86_64.
    'Mozilla/5.0 (X11; Linux x86_64; rv:10.0) Gecko/20100101 Firefox/10.0',
    person('computer', 'Linux', 'Firefox'),
  ],
  [
    'ChromeOS Chrome',
    // Chromium, "User-Agent Reduction": unifiedPlatform "X11; CrOS x86_64 14541.0.0".
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    person('computer', 'ChromeOS', 'Chrome'),
  ],
  // ── People inside an app's own browser ─────────────────────────────────────
  [
    'Instagram in-app browser on an iPhone',
    // Instagram publishes no reference string: iOS WebKit with the `Instagram <version>
    // (<device>; …)` suffix the app appends.
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 614826622; IABMV/1)',
    person('phone', 'iOS', 'Instagram'),
  ],
  [
    'Facebook in-app browser on Android',
    // Meta publishes no reference string: the Android WebView string from Chrome for
    // Developers, "User-Agent strings", with the `[FB_IAB/FB4A;FBAV/…;]` suffix the app appends.
    'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 5 Build/LMY48B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/43.0.2357.65 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/35.0.0.48.273;]',
    person('phone', 'Android', 'Facebook'),
  ],
  [
    'LinkedIn in-app browser on an iPhone',
    // LinkedIn publishes no reference string: iOS WebKit with the `[LinkedInApp]` suffix.
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.8962',
    person('phone', 'iOS', 'LinkedIn'),
  ],
  [
    'an Android phone whose model contains CUBOT',
    // CUBOT is a phone maker, and no public list pins one exact string. This is the full,
    // pre-reduction Chrome for Android format from Chrome for Developers, "User-Agent
    // strings" — the model sits in the platform, which is how a brand reaches the string.
    CUBOT_PHONE,
    person('phone', 'Android', 'Chrome'),
  ],
  // ── Link previews ──────────────────────────────────────────────────────────
  [
    'WhatsApp link preview',
    // darkvisitors.com, "WhatsApp".
    'WhatsApp/2.22.20.72 A',
    preview('WhatsApp'),
  ],
  [
    'Facebook link preview',
    // Meta for Developers, "The Facebook Crawler".
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    preview('Facebook'),
  ],
  [
    'Slack link preview',
    // Slack's own documentation, api.slack.com/robots.
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    preview('Slack'),
  ],
  [
    'Telegram link preview, which also says TwitterBot',
    // monperrus/crawler-user-agents, "TelegramBot".
    'TelegramBot (like TwitterBot)',
    preview('Telegram'),
  ],
  [
    'LinkedIn link preview',
    // monperrus/crawler-user-agents, "LinkedInBot".
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)',
    preview('LinkedIn'),
  ],
  [
    'Discord link preview',
    // monperrus/crawler-user-agents, "Discordbot".
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    preview('Discord'),
  ],
  [
    'Microsoft Teams link preview',
    // monperrus/crawler-user-agents, "SkypeUriPreview".
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
    preview('Microsoft Teams'),
  ],
  [
    'Snapchat link preview, which says "bot" but is matched as a preview first',
    // Snap's own documentation, developers.snap.com/robots (read 2026-09-16).
    'Snap URL Preview Service; bot; snapchat; https://developers.snap.com/robots',
    preview('Snapchat'),
  ],
  [
    "iMessage's link preview, which borrows Facebook's and X's tokens",
    // Measured 2026-09-06 in apps/cms/e2e/findability.spec.ts. Apple sends no name of its
    // own, so the preview is counted under the first token it borrows.
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    preview('Facebook'),
  ],
  // ── Robots ─────────────────────────────────────────────────────────────────
  [
    'Headless Chrome',
    // monperrus/crawler-user-agents, "HeadlessChrome".
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
    robot('Headless Chrome'),
  ],
  [
    'curl',
    // curl's own documentation: the default User-Agent is curl/<version>.
    'curl/8.7.1',
    robot('curl'),
  ],
  [
    'UptimeRobot',
    // UptimeRobot's own documentation of its monitoring agent.
    'Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
    robot('UptimeRobot'),
  ],
  [
    'Googlebot, caught by the generic words',
    // Google Search Central, "Google crawlers": Googlebot desktop.
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    robot('robot'),
  ],
]

describe('classifyAgent on real User-Agent strings', () => {
  it.each(FIXTURES)('%s', (_label, userAgent, expected) => {
    expect(classifyAgent(userAgent)).toEqual(expected)
  })

  it('the table covers every kind, device and system the admin can show', () => {
    const seen = (key: keyof Agent) =>
      [...new Set(FIXTURES.map(([, , expected]) => expected[key]))].sort()
    expect(seen('kind')).toEqual(['link-preview', 'person', 'robot'])
    expect(seen('device')).toEqual(['computer', 'phone', 'tablet', 'unknown'])
    expect(seen('system')).toEqual([
      'Android',
      'ChromeOS',
      'Linux',
      'Windows',
      'iOS',
      'iPadOS',
      'macOS',
      'other',
    ])
  })
})

describe('no User-Agent at all', () => {
  it.each([null, '', '   '])('%j is a robot named "no user agent"', (userAgent) => {
    expect(classifyAgent(userAgent)).toEqual(robot('no user agent'))
  })
})

describe('Client Hints, which only Chromium browsers send', () => {
  it('a mobile hint of ?1 turns a device the string cannot place into a phone', () => {
    expect(classifyAgent(FUCHSIA_CHROME)).toEqual(person('unknown', 'other', 'Chrome'))
    expect(classifyAgent(FUCHSIA_CHROME, { mobileHint: '?1' })).toEqual(
      person('phone', 'other', 'Chrome'),
    )
    expect(classifyAgent(FUCHSIA_CHROME, { mobileHint: '?0' })).toEqual(
      person('unknown', 'other', 'Chrome'),
    )
  })

  it('a platform hint, quotes included as sent, overrides the system the string names', () => {
    expect(classifyAgent(FUCHSIA_CHROME, { platformHint: '"Windows"' })).toEqual(
      person('computer', 'Windows', 'Chrome'),
    )
    // Without its quotes, or shaped like an object key, a hint overrides nothing.
    for (const platformHint of ['Windows', 'constructor']) {
      expect(classifyAgent(FUCHSIA_CHROME, { platformHint })).toEqual(
        person('unknown', 'other', 'Chrome'),
      )
    }
  })
})

describe('the two lists, whose order is the rule', () => {
  it('tries Telegram before X, because Telegram says "like TwitterBot"', () => {
    expect(LINK_PREVIEW_AGENTS.map(([, name]) => name)).toEqual([
      'WhatsApp',
      'Facebook',
      'Telegram',
      'X (Twitter)',
      'Slack',
      'LinkedIn',
      'Discord',
      'Microsoft Teams',
      'Pinterest',
      'Reddit',
      'Snapchat',
    ])
  })

  it('tries every named robot before the generic words', () => {
    expect(ROBOT_AGENTS.map(([, name]) => name)).toEqual([
      'Headless Chrome',
      'UptimeRobot',
      'Lighthouse',
      'curl',
      'Wget',
      'Python',
      'Go',
      'Node.js',
      'OkHttp',
      'Java',
      'Perl',
      'Scrapy',
      'robot',
    ])
  })
})

describe('NEGATIVE CONTROL: the generic robot words can fire', () => {
  it('the CUBOT phone with " bot/1.0" appended becomes a robot', () => {
    expect(classifyAgent(CUBOT_PHONE).kind).toBe('person')
    expect(classifyAgent(`${CUBOT_PHONE} bot/1.0`)).toEqual(robot('robot'))
  })
})

/**
 * A PERSON IS A BROWSER NAVIGATING (decided 2026-09-18, live from the merge that deploys it).
 *
 * Measured that day in the Worker's own logs: Cloudflare hands the FIRST HEAD for an address
 * to the Worker as a GET (Workers Caching keeps one entry for GET and HEAD, and a miss fills
 * it with a GET), and a script can send any User-Agent it likes. Both had put checkers into
 * the owner's people figures. A browser opening a page says so in its request headers; a
 * checker, a monitor or a script does not.
 */
describe('isBrowserNavigation', () => {
  const headers = (entries: Record<string, string>) => new Headers(entries)

  it.each<[string, Record<string, string>, boolean]>([
    ['a browser opening a page (Fetch Metadata)', { 'sec-fetch-mode': 'navigate' }, true],
    ['Node fetch with a borrowed Chrome name', { 'sec-fetch-mode': 'cors' }, false],
    ['an image request (a reading marker)', { 'sec-fetch-mode': 'no-cors' }, false],
    [
      'Safari before 16.4 — no Fetch Metadata, but the classic navigation headers',
      { 'upgrade-insecure-requests': '1', accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      true,
    ],
    ['curl, or a HEAD a cache turned into a GET', { accept: '*/*' }, false],
    ['nothing at all', {}, false],
    [
      'the upgrade header without asking for HTML',
      { 'upgrade-insecure-requests': '1', accept: '*/*' },
      false,
    ],
    [
      'Fetch Metadata wins over the classic headers when both are sent',
      { 'sec-fetch-mode': 'cors', 'upgrade-insecure-requests': '1', accept: 'text/html' },
      false,
    ],
  ])('%s → %s', (_label, entries, expected) => {
    expect(isBrowserNavigation(headers(entries))).toBe(expected)
  })
})
