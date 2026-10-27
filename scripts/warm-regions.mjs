/**
 * After each deploy, warm the shared store from the BUYERS' regions too (faster-taps plan, Task 8).
 *
 * WHY. warm-shared-store.mjs warms from the CI runner, in the United States, and the store keeps a
 * copy per region (apps/cms/CLAUDE.md: Marseille and Muscat each drew the sitemap the US already
 * held, 25 Oct). So the first buyer in Pakistan after a deploy still waited for a drawing: 2.85 to
 * 3.75 s for a first tap on 26 Oct. Here two home-network probes in each buyer country
 * (warm-regions.countries.json) ask for the main pages and the tap into each, through Globalping
 * (jsDelivr's free probe network; anonymous use allows 250 tests an hour, this asks about 60).
 *
 * MEASURED BEFORE BUILDING (the spike of 27 Oct): 21 pages, all cold when two Pakistan probes asked;
 * then 4 OTHER Pakistan probes found every one kept, 84 of 84 (Karachi 58, Islamabad 14, Lahore 12
 * data centres). Globalping returns only the first 10 KB of a body, and the store still kept them.
 *
 * ⚠️ IT NEVER FAILS A DEPLOY, and prints only counts and store states per country: the Actions log
 * is public. A Globalping error or limit is a GitHub warning and exit 0. It sends no cookie and no
 * credential (regionWarmPlan drops them), and its probes say who they are ("globalping probe"),
 * which page-store-digest.mjs counts as one of our own robots, never as a visitor.
 *
 * Usage: node scripts/warm-regions.mjs https://wear-run.com
 */
import { readFileSync, realpathSync } from 'node:fs'
import { SITE_ORIGIN, warmTapTargets, warmTargets } from './warm-shared-store.mjs'

/** At most this many addresses, so one deploy uses well under Globalping's free hour. */
export const REGION_TARGETS_MAX = 30
/** Home-network probes asked per country. */
export const PROBES_PER_COUNTRY = 2

const API = 'https://api.globalping.io/v1/measurements'
const NEVER_SENT = new Set(['cookie', 'authorization'])
const CONCURRENCY = 3
const POLL_MS = 1_000
const POLLS = 30
/** Inside the CI step's 5 minutes, so a slow Globalping ends in a warning, never a killed step. */
const BUDGET_MS = 240_000

/**
 * The top-level website pages, then the tap into each from the home page (`{ url, headers }`),
 * at most `max`. The pages a buyer opens first; a nested page and the kept files are left to the
 * US warm-up.
 */
export async function regionTargets(pages, origin = SITE_ORIGIN, max = REGION_TARGETS_MAX) {
  const top = pages.filter((url) => {
    const { pathname } = new URL(url)
    return !/\.[a-z]+$/i.test(pathname) && pathname.split('/').filter(Boolean).length <= 1
  })
  const taps = (
    await warmTapTargets(
      top.map((url) => new URL(url).pathname),
      origin,
    )
  ).filter((tap) => new URL(tap.url).pathname !== '/')
  return [...top.map((url) => ({ url, headers: {} })), ...taps].slice(0, max)
}

/** One Globalping measurement body per address: home-network probes in each country, a plain GET. */
export function regionWarmPlan(targets, countries, probesPerCountry) {
  return targets.map(({ url, headers = {} }) => {
    const address = new URL(url)
    const sent = Object.fromEntries(
      Object.entries(headers).filter(([name]) => !NEVER_SENT.has(name.toLowerCase())),
    )
    const request = { method: 'GET', path: address.pathname }
    if (address.search) request.query = address.search.slice(1)
    if (Object.keys(sent).length > 0) request.headers = sent
    return {
      type: 'http',
      target: address.hostname,
      locations: countries.map((country) => ({
        country,
        tags: ['eyeball-network'],
        limit: probesPerCountry,
      })),
      measurementOptions: { protocol: 'HTTPS', request },
    }
  })
}

/** Store states per probe country, from each answer's `page-cache` or `api-cache` timing. */
export function regionVerdict(measurements) {
  const verdict = {}
  for (const measurement of measurements) {
    for (const { probe, result } of measurement.results ?? []) {
      const country = probe?.country ?? '??'
      const timing = [result?.headers?.['server-timing'] ?? ''].flat().join(', ')
      const state = /(?:page|api)-cache;desc="(hit|miss|skip)"/.exec(timing)?.[1]
      verdict[country] ??= { hit: 0, miss: 0, other: 0 }
      if (state === 'hit' || state === 'miss') verdict[country][state] += 1
      else verdict[country].other += 1
    }
  }
  return verdict
}

/**
 * The weekly watch's numbers (`--measure`, perf-watch.yml): per probe country, the p75 (nearest
 * rank) of the time to the first byte and to the whole answer, from Globalping's own timings.
 */
export function regionTimings(measurements) {
  const seen = {}
  for (const measurement of measurements) {
    for (const { probe, result } of measurement.results ?? []) {
      const { firstByte, total } = result?.timings ?? {}
      if (!Number.isFinite(firstByte) || !Number.isFinite(total)) continue
      const country = probe?.country ?? '??'
      seen[country] ??= { firstByte: [], total: [] }
      seen[country].firstByte.push(firstByte)
      seen[country].total.push(total)
    }
  }
  const p75 = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.ceil(0.75 * sorted.length) - 1]
  }
  return Object.fromEntries(
    Object.entries(seen).map(([country, { firstByte, total }]) => [
      country,
      { n: firstByte.length, firstByteP75: p75(firstByte), totalP75: p75(total) },
    ]),
  )
}

/** Create one measurement and wait for it; throws a fixed sentence, never the response body. */
async function measure(body) {
  const created = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  if (created.status === 429) throw new Error('Globalping limit reached (429)')
  if (!created.ok) throw new Error(`Globalping answered ${created.status}`)
  const { id } = await created.json()
  for (let i = 0; i < POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const answer = await (
      await fetch(`${API}/${id}`, { signal: AbortSignal.timeout(20_000) })
    ).json()
    if (answer.status !== 'in-progress') return { id, results: answer.results ?? [] }
  }
  throw new Error('a Globalping measurement did not finish')
}

async function main() {
  const args = process.argv.slice(2)
  // `--measure` (perf-watch.yml, weekly): the same asks, reported as each country's timings.
  const measuring = args.includes('--measure')
  const origin = args.find((arg) => !arg.startsWith('--')) ?? SITE_ORIGIN
  let xml
  try {
    const sitemap = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) })
    if (!sitemap.ok) throw new Error(`the sitemap answered ${sitemap.status}`)
    xml = await sitemap.text()
  } catch (error) {
    console.log(`::warning::${error.message}; the buyer regions were not warmed`)
    return
  }
  const countries = JSON.parse(
    readFileSync(new URL('./warm-regions.countries.json', import.meta.url), 'utf8'),
  )
  const targets = await regionTargets(warmTargets(xml, origin).pages, origin)
  const plan = regionWarmPlan(targets, countries, PROBES_PER_COUNTRY)
  if (plan.length === 0) {
    console.log('::warning::the sitemap listed no website pages; the buyer regions were not warmed')
    return
  }
  const done = []
  const deadline = Date.now() + BUDGET_MS
  try {
    // The first measurement picks the probes; every later one asks the same probes again.
    const first = await measure(plan[0])
    done.push(first)
    const queue = plan.slice(1).map((body) => ({ ...body, locations: first.id }))
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0 && Date.now() < deadline) done.push(await measure(queue.shift()))
      }),
    )
    if (queue.length > 0) {
      console.log(
        `::warning::the 4-minute budget ran out; ${done.length} of ${plan.length} addresses were warmed`,
      )
    }
  } catch (error) {
    console.log(
      `::warning::${error.message}; ${done.length} of ${plan.length} addresses were warmed`,
    )
  }
  const timings = regionTimings(done)
  for (const [country, { hit, miss, other }] of Object.entries(regionVerdict(done))) {
    console.log(
      `[warm-regions] ${country}: ${hit + miss + other} asked — ${miss} drawn now (miss), ${hit} already kept (hit), ${other} other`,
    )
    const timed = timings[country]
    if (measuring && timed) {
      console.log(
        `[warm-regions] ${country}: p75 ${timed.firstByteP75} ms to the first byte, ${timed.totalP75} ms to the whole answer (${timed.n} answers)`,
      )
    }
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.log(`::warning::the buyer regions' warm-up stopped: ${error.message}`)
  })
}
