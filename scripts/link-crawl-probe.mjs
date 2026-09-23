/**
 * Crawl every link reachable from the site's and viewer's entry points, and check the
 * SAME fetched bytes for mixed content (FI-12, broken links; SE-18, mixed content).
 *
 * WHY THIS EXISTS. No crawler of any kind existed for this site. A broken link — a
 * renamed PDF, a stale social URL, a footer fact that changed — was invisible until a
 * visitor happened to click it. FI-12's own finding names "PDFs, media" explicitly.
 *
 * NEVER A HARDCODED URL LIST. Modelled on `scripts/smoke-live-previews.mjs`'s "read the
 * live thing, derive what to check" style: a hardcoded list rots the moment a product,
 * a footer link or a social handle changes. Instead this starts from five entry points a
 * real visitor or crawler actually reaches, and follows every link ONE level out — it
 * does not recurse past that, which keeps the request count and the run time bounded.
 *
 * NEVER RUNS JAVASCRIPT. A plain regex over the fetched HTML/XML/text, per the hard
 * limit every probe in this repo follows — so a client-rendered link is invisible to
 * this script by construction. Say that plainly rather than implying more coverage than
 * exists.
 *
 * NEVER FOLLOWS A LINK OFF THE FOUR CUSTOMER-FACING HOSTS. `mailto:` and `wa.me` (and any
 * other third-party host, e.g. Instagram) are validated for SHAPE only — a probe cannot
 * "test" an email address or a phone number without contacting a third party, and
 * fetching another site's own pages is not this repo's business and risks looking like
 * abuse from Cloudflare's perspective.
 *
 * POLITE: one request at a time, with a pause between each — see `CRAWL_DELAY_MS`.
 *
 * SE-18, FOLDED IN RATHER THAN BUILT SEPARATELY. This script already downloads every
 * page's full body to find links; re-using those SAME bytes to look for a mixed-content
 * resource costs nothing extra over the network, and keeps one script responsible for
 * "what does the page actually contain" rather than a second crawler re-fetching the
 * same URLs.
 */

// Relative path, not the `@run-apparel/shared` package name: this script runs under
// plain Node (it is a CLI, not bundled), and the package name is resolvable only from
// inside a workspace member's own node_modules, not from scripts/ at the repo root.
import { DEFAULT_SITE_SETTINGS } from '../packages/shared/src/defaults.ts'

/** Statuses that mean "ask again later", not "the link is broken" — same set every probe here uses. */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/** Politeness: at least one second between live requests (repo convention). */
const CRAWL_DELAY_MS = 1200

/** The only hosts this script will ever fetch. Anything else is shape-checked, never followed. */
const CRAWLABLE_HOSTS = new Set([
  'wear-run.help',
  'viewer.wear-run.help',
  'cms.wear-run.help',
  'media.wear-run.help',
])

/** The WhatsApp number pinned in packages/shared/src/defaults.ts, so this cannot drift from it. */
const PINNED_WHATSAPP_NUMBER = DEFAULT_SITE_SETTINGS.whatsappNumber.replace(/[^\d]/g, '')

/** Where the crawl starts. Every one of these is itself an entry point a visitor or crawler reaches. */
export const SEEDS = [
  'https://wear-run.help/',
  'https://viewer.wear-run.help/sitemap.xml',
  'https://wear-run.help/sitemap.xml',
  'https://wear-run.help/llms.txt',
  'https://viewer.wear-run.help/llms.txt',
]

/**
 * Every href/src attribute, sitemap `<loc>`, and Markdown `[text](url)` reference in a
 * fetched body, resolved to an absolute URL. One function covers all three because this
 * probe reads HTML, XML and plain text with the same regex-based approach the rest of
 * this repo's live probes use — never a real parser, and never JavaScript.
 *
 * @param {string} text
 * @param {string} baseUrl
 * @returns {string[]} de-duplicated absolute URLs (http(s):, mailto:, or any other scheme)
 */
export function extractLinks(text, baseUrl) {
  const found = new Set()
  const patterns = [
    /(?:href|src)\s*=\s*["']([^"']+)["']/gi,
    /<loc>\s*([^<\s]+)\s*<\/loc>/gi,
    /\]\(([^)\s]+)\)/g, // Markdown [text](url)
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('data:')) {
        continue
      }
      try {
        found.add(new URL(raw, baseUrl).href)
      } catch {
        // Not a URL at all (a malformed relative reference) — skip rather than throw;
        // this is a regex, not a validator, and a genuinely broken href is FI-12's job
        // to catch by trying to fetch it, not this function's job to reject.
      }
    }
  }
  return [...found]
}

/**
 * Every `http://` resource an HTML page loads — a real mixed-content risk — excluding
 * the two shapes measured live to be identifier strings, never fetched resources: the
 * sitemap/RSS XML namespace and a JSON-LD `@context` URI. A hand-built allowlist of
 * exactly these two, not a blanket "ignore anything that looks like a URI" rule, which
 * would silently hide a real one.
 *
 * @param {string} html
 * @param {string} pageUrl for the message only
 * @returns {string[]} one line per hit, naming the page and the offending URL
 */
export function mixedContentIn(html, pageUrl) {
  const hits = []
  const resourceRe = /(?:href|src)\s*=\s*["'](http:\/\/[^"']+)["']/gi
  const styleUrlRe = /url\(\s*(http:\/\/[^)'"]+)\s*\)/gi
  for (const pattern of [resourceRe, styleUrlRe]) {
    for (const match of html.matchAll(pattern)) {
      const url = match[1]
      if (url.startsWith('http://www.sitemaps.org/')) continue // XML namespace, never fetched
      if (isJsonLdContextValue(html, url)) continue // vocabulary identifier, never fetched
      hits.push(`${pageUrl}: <${match[0]}>`)
    }
  }
  return hits
}

/** True when `url` appears as a JSON-LD `"@context"` value rather than a real resource. */
function isJsonLdContextValue(html, url) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`"@context"\\s*:\\s*"${escaped}"`).test(html)
}

/** Shape-only check for a `mailto:` address — never contacted. */
function mailtoIsWellFormed(url) {
  return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(url)
}

/** Shape-only check for a `wa.me` link — must be the one number the site actually uses. */
function waNumberMatches(url) {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname !== 'wa.me') return false
    return pathname.replace(/^\//, '') === PINNED_WHATSAPP_NUMBER
  } catch {
    return false
  }
}

/**
 * Turn a link's kind and target into which check applies: an HTTP GET, or a shape-only
 * validation. Pure — used by both the CLI (to decide what to fetch) and tests.
 *
 * `crawlableHosts` defaults to the four real customer-facing hosts and is a parameter,
 * not baked in, for exactly one reason: `evaluate()`'s planted-fault proof runs this
 * probe's full `crawl()` against a LOCAL fixture server, never production (the plan's
 * own instruction), and a fixture on 127.0.0.1 must be classified 'http' too or the
 * fixture's own broken link is silently treated as 'external' and never followed —
 * which is exactly the bug a first version of this file had, caught by that proof.
 *
 * @param {string} url
 * @param {Set<string>} [crawlableHosts]
 * @returns {'http' | 'mailto' | 'wa' | 'external'}
 */
export function classifyLink(url, crawlableHosts = CRAWLABLE_HOSTS) {
  if (url.startsWith('mailto:')) return 'mailto'
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'external'
  }
  if (parsed.hostname === 'wa.me') return 'wa'
  if (crawlableHosts.has(parsed.hostname)) return 'http'
  return 'external'
}

/**
 * Turn observations into a verdict. Pure — no network.
 *
 * @param {{
 *   links: {
 *     kind: 'http' | 'mailto' | 'wa' | 'external',
 *     url: string,
 *     foundOn?: string,
 *     status?: number,
 *     contentType?: string,
 *     error?: string,
 *   }[],
 *   mixedContent: string[],
 * }} observed
 * @returns {{ ok: boolean, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate({ links, mixedContent }) {
  const failures = []
  const inconclusive = []
  const lines = []

  for (const link of links) {
    const label = link.url.padEnd(60)

    if (link.kind === 'mailto') {
      if (!mailtoIsWellFormed(link.url)) {
        failures.push(
          `${link.url}: not a well-formed email address (found on ${link.foundOn ?? '?'}).`,
        )
        lines.push(`  ${label} malformed  FAIL`)
      } else {
        lines.push(`  ${label} well-formed ok`)
      }
      continue
    }
    if (link.kind === 'wa') {
      if (!waNumberMatches(link.url)) {
        failures.push(
          `${link.url}: does not match the pinned WhatsApp number ${PINNED_WHATSAPP_NUMBER} ` +
            `(found on ${link.foundOn ?? '?'}).`,
        )
        lines.push(`  ${label} wrong number  FAIL`)
      } else {
        lines.push(`  ${label} pinned number ok`)
      }
      continue
    }
    if (link.kind === 'external') {
      lines.push(`  ${label} external — not followed`)
      continue
    }

    // kind === 'http'
    if (link.error) {
      inconclusive.push(`${link.url}: request failed (${link.error}). NOT a pass.`)
      lines.push(`  ${label} ERROR  ${link.error}`)
      continue
    }
    if (link.status !== undefined && INCONCLUSIVE_STATUSES.has(link.status)) {
      inconclusive.push(`${link.url}: HTTP ${link.status} — Bot Fight Mode, inconclusive.`)
      lines.push(`  ${label} ${link.status}    (inconclusive)`)
      continue
    }
    const ok = link.status !== undefined && link.status >= 200 && link.status < 300
    const type = link.contentType ? ` (${link.contentType})` : ''
    if (!ok) {
      failures.push(
        `${link.url}: answered HTTP ${link.status ?? '(none)'}, found on ${link.foundOn ?? '?'}.`,
      )
      lines.push(`  ${label} ${link.status ?? '(none)'}${type}  FAIL`)
    } else {
      lines.push(`  ${label} ${link.status}${type} ok`)
    }
  }

  for (const hit of mixedContent) {
    failures.push(`mixed content: ${hit}`)
    lines.push(`  MIXED CONTENT  ${hit}`)
  }

  return { ok: failures.length === 0, failures, inconclusive, lines }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** One GET, tolerating every way it can fail. Body kept only for HTML pages (for link/mixed-content extraction). */
async function fetchOne(url, { keepBody } = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'run-apparel-link-crawl-probe/1.0' },
      signal: AbortSignal.timeout(20_000),
    })
    const contentType = response.headers.get('content-type') ?? undefined
    const body = keepBody ? await response.text().catch(() => '') : undefined
    if (!keepBody) await response.body?.cancel()
    return { status: response.status, contentType, body }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** All network lives here: crawl the seeds, collect links one level out, check each. */
export async function crawl(seeds = SEEDS, { crawlableHosts = CRAWLABLE_HOSTS } = {}) {
  const linkSources = new Map() // url -> foundOn (first seed it was seen on)
  const mixedContent = []

  for (const seed of seeds) {
    const { body, contentType, error } = await fetchOne(seed, { keepBody: true })
    await sleep(CRAWL_DELAY_MS)
    if (error || body === undefined) continue
    for (const url of extractLinks(body, seed)) {
      if (!linkSources.has(url)) linkSources.set(url, seed)
    }
    // Mixed content only makes sense for HTML — sitemap.xml/llms.txt carry no rendered
    // resources (per the module docblock).
    if ((contentType ?? '').includes('html')) {
      mixedContent.push(...mixedContentIn(body, seed))
    }
  }

  const links = []
  for (const [url, foundOn] of linkSources) {
    const kind = classifyLink(url, crawlableHosts)
    if (kind === 'mailto' || kind === 'wa' || kind === 'external') {
      links.push({ kind, url, foundOn })
      continue
    }
    const result = await fetchOne(url, { keepBody: false })
    await sleep(CRAWL_DELAY_MS)
    links.push({ kind, url, foundOn, ...result })
  }

  return { links, mixedContent }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const started = Date.now()
  const observed = await crawl()
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1)
  const { ok, failures, inconclusive, lines } = evaluate(observed)

  const httpCount = observed.links.filter((l) => l.kind === 'http').length
  console.log(
    `link crawl probe — every link from ${SEEDS.length} entry points, ${observed.links.length} ` +
      `found (${httpCount} fetched), ${elapsedS}s\n`,
  )
  for (const line of lines) console.log(line)

  if (inconclusive.length) {
    console.log('\ninconclusive (NOT a pass, NOT a failure):')
    for (const note of inconclusive) console.log(`  - ${note}`)
  }

  if (!ok) {
    console.log('\nFAILURES:')
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }

  console.log(`\n✓ 0 broken links, 0 mixed-content hits, across ${httpCount} live requests.`)
}
