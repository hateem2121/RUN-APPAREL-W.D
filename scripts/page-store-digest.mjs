/**
 * The weekly digest's page-store line (W5-1, owner yes on 24 Oct; the unused-media line was
 * dropped by owner choice on 25 Oct, because CI holds no CMS key and a second copy of the "is
 * this file used" rules would drift from the orphan finder).
 *
 * WHAT IT MEASURES. The shared page store (#247, live 25 Oct) keeps pages, the generated files and
 * the garment data in Workers Cache. Its targets, set in the plan before it shipped: home page
 * p75 under 300 ms and p90 under 600 ms, garment data p90 under 250 ms, sitemap processor time
 * under 20 ms. The baselines it replaced (Workers logs, 7 days to 24 Oct): home p75 799 ms and
 * p90 2,338 ms, garment data p90 677 ms, sitemap processor time p50 595 ms.
 *
 * WHERE FROM. The Workers Observability "run a query" endpoint (Cloudflare API, read 25 Oct),
 * with the job's own CLOUDFLARE_API_TOKEN: no new key. Wall time is the Worker's own time per
 * request, so a fetch the store answers is fast and a fresh draw is slow; a week after a deploy
 * mixes both, which is why the line names the request count.
 *
 * ⚠️ VISITORS ONLY, AND THE MISSES COUNTED APART (25 Oct). A miss shows in Workers logs twice: the
 * visitor's request, which waits, and the store's own draw into SitePages at the same address.
 * Counted together they made the store look slower than it is: garment data in the hour after
 * #255 was 462 requests, 333 visitors and 129 draws, p75 627 ms together and 112 ms for the
 * visitors. Only the store's requests carry an entrypoint name (`$workers.entrypoint` is
 * SitePages; a visitor's is empty), so the timings read the empty ones and the draws are counted
 * by name. Splitting on the user-agent instead loses the 26 visitors that send none.
 *
 * ⚠️ PEOPLE APART TOO (2026-10-25, owner's plan). Of 612 home-page opens on 25 Oct 08:00-18:40 UTC,
 * 279 were our own checks and 270 robots; 63 were people. The targets are about people, so their
 * line reads only requests with no robot label (`cf.verifiedBotCategory` empty) and none of our own
 * agents (OWN_AGENTS). Checked live that day: the filter counted the same 63, p90 3,032 ms, as a
 * request-by-request reading of the same window.
 *
 * ⚠️ NUMBERS AND FIXED WORDS ONLY. On a public repository every Actions log is public (root
 * CLAUDE.md, the 2026-09-11 incident), and the summary is also written into a GitHub issue. Nothing
 * from the API response is printed except the numbers this module picks out, and an error is a
 * fixed sentence: never the response body, never the token.
 */
import { realpathSync } from 'node:fs'

export const CMS_SERVICE = 'run-apparel-viewer-cms'

/** The store's entrypoint (worker.mjs): the only requests that carry an entrypoint name. */
export const STORE_ENTRYPOINT = 'SitePages'

/**
 * Our own checks and robots that carry no robot label: uptime, the probes, the README badge, the
 * scripts. A request carrying any of these in its user agent is never counted as a person.
 */
export const OWN_AGENTS = Object.freeze([
  'run-apparel',
  'RUN APPAREL',
  'UptimeRobot',
  'Shields.io',
  'curl/',
  'node',
  'Go-http-client',
  'HeadlessChrome',
  'Lighthouse',
])

/** The four targets, from the plan the owner approved on 24 Oct. */
export const TARGETS = Object.freeze({
  homeP75: 300,
  homeP90: 600,
  dataP90: 250,
  sitemapCpuP50: 20,
})

/** What each line reads: one request URL, or every URL under a prefix. */
export const ROUTES = Object.freeze({
  home: { match: 'eq', url: 'https://wear-run.com/' },
  sitemap: { match: 'eq', url: 'https://wear-run.com/sitemap.xml' },
  data: { match: 'starts_with', url: 'https://cms.wear-run.help/api/public/viewer/' },
})

/**
 * The request body for one route over one window. Pure, so the test can read exactly what is
 * asked of Cloudflare.
 *
 * @param {keyof typeof ROUTES} route
 * @param {number} from epoch ms
 * @param {number} to epoch ms
 * @param {'visitors' | 'draws' | 'people'} [who] the visitors' requests (timed), the store's own
 *   draws, or the visitors that are people
 */
export function queryBody(route, from, to, who = 'visitors') {
  const { match, url } = ROUTES[route]
  const entrypoint =
    who === 'draws'
      ? { key: '$workers.entrypoint', operation: 'eq', type: 'string', value: STORE_ENTRYPOINT }
      : { key: '$workers.entrypoint', operation: 'is_null', type: 'string' }
  const agent = '$workers.event.request.headers.user-agent'
  const people =
    who === 'people'
      ? [
          {
            key: '$workers.event.request.cf.verifiedBotCategory',
            operation: 'eq',
            type: 'string',
            value: '',
          },
          { key: agent, operation: 'exists', type: 'string' },
          ...OWN_AGENTS.map((value) => ({
            key: agent,
            operation: 'not_includes',
            type: 'string',
            value,
          })),
        ]
      : []
  return {
    queryId: `weekly-digest-page-store-${route}-${who}`,
    view: 'calculations',
    timeframe: { from, to },
    parameters: {
      datasets: ['cloudflare-workers'],
      filters: [
        { key: '$metadata.service', operation: 'eq', type: 'string', value: CMS_SERVICE },
        { key: '$workers.event.request.url', operation: match, type: 'string', value: url },
        entrypoint,
        ...people,
      ],
      calculations: [
        { operator: 'count', alias: 'requests' },
        { operator: 'p75', key: '$workers.wallTimeMs', keyType: 'number', alias: 'p75' },
        { operator: 'p90', key: '$workers.wallTimeMs', keyType: 'number', alias: 'p90' },
        { operator: 'median', key: '$workers.cpuTimeMs', keyType: 'number', alias: 'cpuP50' },
      ],
    },
  }
}

/**
 * The four numbers out of one API answer, by alias. Anything that is not a finite number becomes
 * null, so nothing else from the response can reach the printed line.
 *
 * @param {unknown} answer
 * @returns {{ requests: number, p75: number | null, p90: number | null, cpuP50: number | null }}
 */
export function readCalculations(answer) {
  const calculations = /** @type {any} */ (answer)?.result?.calculations
  const pick = (alias) => {
    const found = Array.isArray(calculations)
      ? calculations.find((c) => c?.alias === alias)
      : undefined
    const value = Number(found?.aggregates?.[0]?.value)
    return Number.isFinite(value) ? Math.round(value) : null
  }
  return {
    requests: pick('requests') ?? 0,
    p75: pick('p75'),
    p90: pick('p90'),
    cpuP50: pick('cpuP50'),
  }
}

const verdict = (value, target) =>
  value === null ? 'no reading' : value < target ? 'within target' : 'OVER target'

/**
 * Pure: the three routes' numbers to the digest's prose. Fixed words around numbers only.
 *
 * @param {{ home: ReturnType<typeof readCalculations>, sitemap: ReturnType<typeof readCalculations>, data: ReturnType<typeof readCalculations> }} r
 * @param {{ home?: number, sitemap?: number, data?: number }} [draws] how many the store drew fresh
 * @param {{ home?: ReturnType<typeof readCalculations>, data?: ReturnType<typeof readCalculations> }} [people]
 *   the same readings for people only
 * @returns {{ requests: number, summary: string }}
 */
export function summarizePageStore(r, draws = {}, people = {}) {
  const requests = r.home.requests + r.sitemap.requests + r.data.requests
  if (requests === 0) {
    return {
      requests,
      summary:
        'Page store: no requests to the home page, the sitemap or the garment data in Workers logs this week.',
    }
  }
  const ms = (v) => (v === null ? '-' : `${v} ms`)
  const over = (route) => {
    const fresh = draws[route]
    const count = `over ${r[route].requests} requests`
    return Number.isFinite(fresh) ? `${count}, ${Math.round(fresh)} drawn fresh` : count
  }
  const lines = [
    'Page store (Workers logs, 7 days, visitors only; targets from the 24 Oct plan):',
    `- Home page: p75 ${ms(r.home.p75)} (${verdict(r.home.p75, TARGETS.homeP75)}, target under ${TARGETS.homeP75} ms), p90 ${ms(r.home.p90)} (${verdict(r.home.p90, TARGETS.homeP90)}, under ${TARGETS.homeP90} ms), ${over('home')}. Before the store: 799 / 2,338 ms.`,
    `- Garment data: p90 ${ms(r.data.p90)} (${verdict(r.data.p90, TARGETS.dataP90)}, target under ${TARGETS.dataP90} ms), ${over('data')}. Before: 677 ms.`,
    `- Sitemap processor time: median ${ms(r.sitemap.cpuP50)} (${verdict(r.sitemap.cpuP50, TARGETS.sitemapCpuP50)}, target under ${TARGETS.sitemapCpuP50} ms), ${over('sitemap')}. Before: 595 ms.`,
  ]
  if (people.home && people.data) {
    const { home, data } = people
    lines.push(
      `- People only (no robot label, none of our own checks): home page p90 ${ms(home.p90)} (${verdict(home.p90, TARGETS.homeP90)}, under ${TARGETS.homeP90} ms) over ${home.requests} requests; garment data p90 ${ms(data.p90)} (${verdict(data.p90, TARGETS.dataP90)}, under ${TARGETS.dataP90} ms) over ${data.requests} requests.`,
    )
  }
  return { requests, summary: lines.join('\n') }
}

/** The fixed sentence for a failed read: the digest must never pass it off as a quiet week. */
export const UNREADABLE =
  'Page store speed could not be read this week. See this run in the Actions tab.'

/**
 * Asks Cloudflare for the last 7 days of each route. Prints `requests=<n>` on the first line, then
 * the summary. Exits 1 on any failure with only the fixed sentence, so the workflow's
 * `continue-on-error` step reports it as unreadable.
 */
async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !account) {
    console.error(UNREADABLE)
    process.exit(1)
  }
  const to = Date.now()
  const from = to - 7 * 24 * 3600 * 1000
  const read = async (route, who) => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(queryBody(route, from, to, who)),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return readCalculations(await response.json())
  }
  try {
    const { requests, summary } = summarizePageStore(
      {
        home: await read('home', 'visitors'),
        sitemap: await read('sitemap', 'visitors'),
        data: await read('data', 'visitors'),
      },
      {
        home: (await read('home', 'draws')).requests,
        sitemap: (await read('sitemap', 'draws')).requests,
        data: (await read('data', 'draws')).requests,
      },
      { home: await read('home', 'people'), data: await read('data', 'people') },
    )
    console.log(`requests=${requests}`)
    console.log(summary)
  } catch (error) {
    // The status code only (`HTTP 403`): never the body, which could echo the request.
    const status = error instanceof Error && /^HTTP \d+$/.test(error.message) ? error.message : ''
    console.error(status ? `${UNREADABLE} (${status})` : UNREADABLE)
    process.exit(1)
  }
}

// Run only when called directly, never when a test imports it (as model-load-digest.mjs does).
const isMain = process.argv[1] && import.meta.filename === realpathSync(process.argv[1])
if (isMain) await main()
