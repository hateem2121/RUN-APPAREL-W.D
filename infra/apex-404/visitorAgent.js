/**
 * Who opened a document link: a person, a link preview or a robot — and, for a person,
 * what kind of device, system and browser. Read from the request's User-Agent.
 *
 * WHY (owner decisions D24 and D31, 2026-09-15). A link pasted into WhatsApp or Slack is
 * fetched by the app's preview robot before anyone taps it, and monitors and crawlers fetch
 * it too. Counting those as people would tell the owner a document was read when nobody
 * opened it, so each is kept on rows of its own kind.
 *
 * ⚠️ THE USER-AGENT IS READ HERE AND NEVER STORED. visits.js keeps only the four values this
 * returns; the raw string, with its exact versions, is close to a device fingerprint.
 *
 * ⚠️ THE ORDER OF EACH LIST IS THE RULE. The first match wins, and fetchers borrow each
 * other's names: Telegram's preview robot sends `TelegramBot (like TwitterBot)`, so Telegram
 * is tried before X, and the generic robot words come after every named robot.
 *
 * ⚠️ WHAT THIS CANNOT SEE:
 *   - WhatsApp opens a tapped link in the phone's own browser, so that visit is Safari or
 *     Chrome. Only WhatsApp's link PREVIEW names itself.
 *   - Safari on iPadOS 13 and later sends the Mac User-Agent by default on most models, so
 *     most iPads count as computers. Only the older iPad token is recognised as a tablet.
 *   - An email scanner such as Outlook Safe Links can send an ordinary browser's string.
 */

/** @typedef {'person' | 'link-preview' | 'robot'} AgentKind */
/**
 * @typedef {{
 *   kind: AgentKind,
 *   device: 'phone' | 'tablet' | 'computer' | 'unknown',
 *   system: string,
 *   browser: string,
 * }} AgentInfo
 */

/**
 * Messaging and social apps fetching a link to draw its preview card. Case-insensitive.
 *
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
export const LINK_PREVIEW_AGENTS = Object.freeze([
  [/WhatsApp\//i, 'WhatsApp'],
  [/facebookexternalhit|Facebot/i, 'Facebook'],
  // Before X: Telegram's robot sends `TelegramBot (like TwitterBot)`.
  [/TelegramBot/i, 'Telegram'],
  [/Twitterbot/i, 'X (Twitter)'],
  [/Slackbot/i, 'Slack'],
  [/LinkedInBot/i, 'LinkedIn'],
  [/Discordbot/i, 'Discord'],
  [/SkypeUriPreview/i, 'Microsoft Teams'],
  [/Pinterestbot/i, 'Pinterest'],
  [/redditbot/i, 'Reddit'],
  // Snap's preview crawler sends `Snap URL Preview Service; bot; snapchat; …`
  // (developers.snap.com/robots, read 2026-09-16). A bare `Snapchat` pattern would also match a
  // person reading in Snapchat's in-app browser, whose User-Agent carries `Snapchat/<version>`.
  [/Snap URL Preview Service/i, 'Snapchat'],
])

/**
 * Everything else automated, by the name it gives. Case-insensitive, because libraries do
 * not agree on case: Python's urllib sends `Python-urllib/3.12`.
 *
 * ⚠️ `bot` MUST STAND ALONE. The generic pattern wants a non-letter on both sides of `bot`,
 * or `bot/`, because CUBOT is a phone brand and its model name sits inside a person's
 * User-Agent. apps/cms/src/apexVisitorAgent.test.ts proves both directions.
 *
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
export const ROBOT_AGENTS = Object.freeze([
  [/HeadlessChrome/i, 'Headless Chrome'],
  [/UptimeRobot/i, 'UptimeRobot'],
  [/Lighthouse/i, 'Lighthouse'],
  [/curl\//i, 'curl'],
  [/Wget\//i, 'Wget'],
  [/python-requests|python-urllib|aiohttp/i, 'Python'],
  [/Go-http-client/i, 'Go'],
  [/node-fetch|undici|axios\//i, 'Node.js'],
  [/okhttp/i, 'OkHttp'],
  [/Java\//i, 'Java'],
  [/libwww-perl/i, 'Perl'],
  [/Scrapy/i, 'Scrapy'],
  [/(?:^|[^a-z])bot(?:[^a-z]|$)|bot\/|crawler|spider|slurp/i, 'robot'],
])

/**
 * Sec-CH-UA-Platform values, quotes included as Chromium sends them. A Map, not an object:
 * the header is visitor text, and an object would answer `constructor`.
 */
const PLATFORM_HINTS = new Map([
  ['"Android"', 'Android'],
  ['"Chrome OS"', 'ChromeOS'],
  ['"Windows"', 'Windows'],
  ['"macOS"', 'macOS'],
  ['"Linux"', 'Linux'],
  ['"iOS"', 'iOS'],
])

const COMPUTER_SYSTEMS = new Set(['Windows', 'macOS', 'Linux', 'ChromeOS'])

/**
 * @param {string} userAgent
 * @returns {string}
 */
function systemOf(userAgent) {
  // Every iPhone and iPad string says "like Mac OS X" and every Android string says
  // "Linux", so the specific systems are tried first.
  if (/iPhone|iPod/.test(userAgent)) return 'iOS'
  if (/iPad/.test(userAgent)) return 'iPadOS'
  if (/Android/.test(userAgent)) return 'Android'
  if (/CrOS/.test(userAgent)) return 'ChromeOS'
  if (/Windows NT/.test(userAgent)) return 'Windows'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'macOS'
  if (/Linux/.test(userAgent)) return 'Linux'
  return 'other'
}

/**
 * @param {string} system
 * @param {string} userAgent
 * @param {string | null | undefined} mobileHint
 * @returns {AgentInfo['device']}
 */
function deviceOf(system, userAgent, mobileHint) {
  const mobile = /Mobile/.test(userAgent)
  if (system === 'iOS' || (system === 'Android' && mobile)) return 'phone'
  if (system === 'iPadOS' || system === 'Android') return 'tablet'
  if (mobileHint === '?1') return 'phone'
  if (COMPUTER_SYSTEMS.has(system)) return 'computer'
  return 'unknown'
}

/**
 * Apps that open links in their own browser name themselves, so they come first; then the
 * browsers whose strings also claim Chrome or Safari, before Chrome and Safari.
 *
 * @param {string} userAgent
 * @returns {string}
 */
function browserOf(userAgent) {
  if (/Instagram/.test(userAgent)) return 'Instagram'
  if (/FBAN|FBAV|FB_IAB/.test(userAgent)) return 'Facebook'
  if (/LinkedInApp/.test(userAgent)) return 'LinkedIn'
  if (/SamsungBrowser/.test(userAgent)) return 'Samsung Internet'
  if (/Edg\/|EdgA\/|EdgiOS\//.test(userAgent)) return 'Edge'
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera'
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox'
  if (/CriOS\/|Chrome\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return 'Safari'
  return 'other'
}

/**
 * @param {string | null} userAgent
 * @param {{ mobileHint?: string | null, platformHint?: string | null }} [hints] raw
 *   Sec-CH-UA-Mobile / Sec-CH-UA-Platform header values
 * @returns {AgentInfo}
 */
export function classifyAgent(userAgent, hints = {}) {
  if (typeof userAgent !== 'string' || userAgent.trim() === '') {
    return { kind: 'robot', device: 'unknown', system: 'other', browser: 'no user agent' }
  }
  const preview = LINK_PREVIEW_AGENTS.find(([pattern]) => pattern.test(userAgent))
  if (preview) {
    return { kind: 'link-preview', device: 'unknown', system: 'other', browser: preview[1] }
  }
  const robot = ROBOT_AGENTS.find(([pattern]) => pattern.test(userAgent))
  if (robot) return { kind: 'robot', device: 'unknown', system: 'other', browser: robot[1] }
  const system = PLATFORM_HINTS.get(hints.platformHint ?? '') ?? systemOf(userAgent)
  return {
    kind: 'person',
    device: deviceOf(system, userAgent, hints.mobileHint),
    system,
    browser: browserOf(userAgent),
  }
}
