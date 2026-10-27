/**
 * After each deploy, warm the shared store from the BUYERS' regions too (faster-taps plan, Task 8).
 *
 * WHY. warm-shared-store.mjs warms from the CI runner, in the United States, and the store keeps a
 * copy per region (apps/cms/CLAUDE.md: Marseille and Muscat each drew the sitemap the US already
 * held, 25 Oct). So the first buyer in Pakistan after a deploy still waited for a drawing: 2.85 to
 * 3.75 s for a first tap on 26 Oct. Here two home-network probes in each buyer country
 * (warm-regions.countries.json) ask, in this order, for the five pages the speed targets are judged
 * on, the tap into each, the first garments' data and then the other top-level pages, through
 * Globalping (jsDelivr's free probe network; anonymous use allows 250 tests an hour, this asks 60).
 *
 * MEASURED BEFORE BUILDING (the spike of 27 Oct): 21 pages, all cold when two Pakistan probes asked;
 * then 4 OTHER Pakistan probes found every one kept, 84 of 84 (Karachi 58, Islamabad 14, Lahore 12
 * data centres). Globalping returns only the first 10 KB of a body, and the store still kept them.
 *
 * Then a second pass asks the first 15 addresses again from the same probes and prints how many the
 * region now finds kept (review of 27 Oct; spec Part 6, Step 2).
 *
 * ⚠️ IT NEVER FAILS A DEPLOY, and prints only counts, store states and timings per country: the
 * Actions log is public. A Globalping error or limit is a GitHub warning and exit 0, and each pass
 * stops waiting at its budget and cancels what is still in flight (warmWithin). It sends no cookie
 * and no credential (regionWarmPlan drops them), and its probes say who they are ("globalping
 * probe"), which page-store-digest.mjs counts as one of our own robots, never as a visitor.
 *
 * `--measure` (perf-watch.yml, weekly) prints each state's timings and DOES fail, on Pakistan's own
 * pass mark (owner, 27 Oct; regionJudgement): the second pass must find pages kept, and the
 * store's answers must reach the first byte within 1 s at p75. No answers at all stays a warning.
 *
 * Usage: node scripts/warm-regions.mjs https://wear-run.com [--measure]
 */
import { readFileSync, realpathSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { DESTINATIONS } from '../apps/cms/scripts/measure-taps.mjs'
import { API_ORIGIN, SITE_ORIGIN, warmTapTargets, warmTargets } from './warm-shared-store.mjs'

/** At most this many addresses, so one deploy uses well under Globalping's free hour. */
export const REGION_TARGETS_MAX = 30
/**
 * At most this many garments' data: the first cards of the products page, the ones a buyer sees
 * and opens first (cardGarments). The rest of the 41 are warmed in the buyer's own browser when a
 * card is touched (GarmentWarm.tsx).
 */
export const REGION_GARMENTS_MAX = 10

const GARMENT_PAGE = /^\/products\/([^/]+)\/([^/]+)$/

/**
 * The garments' data addresses in the order the products page shows its cards: each card's showing
 * colour, its slide link in the tab order (CardGallery.tsx). Measured 27 Oct: the page leads with
 * r-asb, r-wzu, r-ect…, which the sitemap lists 20th to 30th, so the sitemap's order is not it.
 *
 * @param {string} productsHtml
 */
export function cardGarments(productsHtml) {
  const garments = []
  for (const [tag] of productsHtml.matchAll(/<a\b[^>]*>/g)) {
    if (!tag.includes('card-gallery__slide') || !tag.includes('tabindex="0"')) continue
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1]
    const garment = href ? GARMENT_PAGE.exec(new URL(href, SITE_ORIGIN).pathname) : null
    if (garment) garments.push(`${API_ORIGIN}/api/public/viewer/${garment[1]}/${garment[2]}`)
  }
  return garments
}
/** Home-network probes asked per country. */
export const PROBES_PER_COUNTRY = 2

const API = 'https://api.globalping.io/v1/measurements'
const NEVER_SENT = new Set(['cookie', 'authorization'])
const CONCURRENCY = 3
const POLL_MS = 1_000
const POLLS = 30
/**
 * The warm-up's and the second pass's budgets: together inside the CI step's limit (ci.yml, held
 * by warmRegions.test.ts), so a slow Globalping ends in a warning, never a killed step.
 */
export const WARM_BUDGET_MS = 240_000
export const READ_BACK_BUDGET_MS = 90_000
/**
 * The second pass (review of 27 Oct; spec Part 6, Step 2): the first addresses again, the five
 * judged pages and their taps and hovers, from the probes the warm-up used, to say whether the
 * region then finds them kept. 15 addresses × 2 probes: 90 tests with the warm-up's 60.
 */
export const READ_BACK_MAX = 15
/**
 * Pakistan's own pass mark (owner, 27 Oct): the store's answers there reach the first byte within
 * 1 s at p75. Set before a store-only baseline existed (that day's pooled p75 was 1,877 ms, with
 * 23 of 60 drawn), on the owner's call; the 23 Nov read of four weekly runs revisits it.
 */
export const STORE_FIRST_BYTE_P75_MS = 1_000

/**
 * What to warm, in order, at most `max` (`{ url, headers }`): the five pages the speed targets are
 * judged on (measure-taps.mjs DESTINATIONS), the tap into each, the first garments' data, then the
 * other top-level pages. The spec (Part 6, Step 2) names "the main pages, their tap data and the
 * most-opened garments' data". A nested page and the kept files are left to the US warm-up.
 * Review, 27 Oct: this followed the sitemap's order and dropped the tap into Home, so the taps
 * warmed were the buyer pages', /guides', /careers' and /press', never About, Contact, FAQ or Home.
 * A tap's key does not depend on its start page (stateTreeFor('/', from) is the same for every
 * start, checked that day), so the tap into Home from Home warms it from everywhere.
 *
 * @param {{ pages: string[], garments?: string[] }} sitemap warmTargets()' lists
 */
export async function regionTargets(
  { pages, garments = [] },
  origin = SITE_ORIGIN,
  max = REGION_TARGETS_MAX,
) {
  const pathOf = (url) => new URL(url).pathname
  const top = pages.filter((url) => {
    const pathname = pathOf(url)
    return !/\.[a-z]+$/i.test(pathname) && pathname.split('/').filter(Boolean).length <= 1
  })
  const measured = DESTINATIONS.flatMap((path) => top.filter((url) => pathOf(url) === path))
  const others = top.filter((url) => !DESTINATIONS.includes(pathOf(url)))
  const asked = (url) => ({ url, headers: {} })
  return [
    ...measured.map(asked),
    ...(await warmTapTargets(measured.map(pathOf), origin)),
    ...garments.slice(0, REGION_GARMENTS_MAX).map(asked),
    ...others.map(asked),
  ].slice(0, max)
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

/** One answer's store state from its `page-cache` or `api-cache` timing: hit, miss or other. */
function storeState(result) {
  const timing = [result?.headers?.['server-timing'] ?? ''].flat().join(', ')
  const state = /(?:page|api)-cache;desc="(hit|miss|skip)"/.exec(timing)?.[1]
  return state === 'hit' || state === 'miss' ? state : 'other'
}

/** Store states per probe country, from each answer's `page-cache` or `api-cache` timing. */
export function regionVerdict(measurements) {
  const verdict = {}
  for (const measurement of measurements) {
    for (const { probe, result } of measurement.results ?? []) {
      const country = probe?.country ?? '??'
      verdict[country] ??= { hit: 0, miss: 0, other: 0 }
      verdict[country][storeState(result)] += 1
    }
  }
  return verdict
}

/** Nearest-rank p75. */
const p75 = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(0.75 * sorted.length) - 1]
}

/**
 * The weekly watch's numbers (`--measure`, perf-watch.yml): per probe country and store state, the
 * p75 (nearest rank) of the time to the first byte and to the whole answer, from Globalping's own
 * timings. Review of 27 Oct: one pooled number per country hid a store that stopped answering
 * behind the drawings around it, so the store's answers and fresh drawings are never pooled.
 */
export function regionTimings(measurements) {
  const seen = {}
  for (const measurement of measurements) {
    for (const { probe, result } of measurement.results ?? []) {
      const { firstByte, total } = result?.timings ?? {}
      if (!Number.isFinite(firstByte) || !Number.isFinite(total)) continue
      const country = probe?.country ?? '??'
      const state = storeState(result)
      seen[country] ??= {}
      seen[country][state] ??= { firstByte: [], total: [] }
      seen[country][state].firstByte.push(firstByte)
      seen[country][state].total.push(total)
    }
  }
  return Object.fromEntries(
    Object.entries(seen).map(([country, states]) => [
      country,
      Object.fromEntries(
        Object.entries(states).map(([state, { firstByte, total }]) => [
          state,
          { n: firstByte.length, firstByteP75: p75(firstByte), totalP75: p75(total) },
        ]),
      ),
    ]),
  )
}

/** The second pass's bodies: the first READ_BACK_MAX addresses, from the warm-up's probes. */
export function readBackPlan(plan, probes) {
  return plan.slice(0, READ_BACK_MAX).map((body) => ({ ...body, locations: probes }))
}

/**
 * Each country's pass mark: the second pass found pages kept, and the store's answers (from both
 * passes) reach the first byte within STORE_FIRST_BYTE_P75_MS at p75. A country the second pass got
 * no answer from is left out: a probe network that did not answer is not a slow site.
 *
 * @returns {Record<string, { verdict: 'pass' | 'fail', hits: number, asked: number, firstByteP75: number | null }>}
 */
export function regionJudgement(readBack, all) {
  const timings = regionTimings(all)
  const judged = {}
  for (const [country, { hit, miss, other }] of Object.entries(regionVerdict(readBack))) {
    const asked = hit + miss + other
    if (asked === 0) continue
    const firstByteP75 = timings[country]?.hit?.firstByteP75 ?? null
    const pass = hit > 0 && firstByteP75 !== null && firstByteP75 <= STORE_FIRST_BYTE_P75_MS
    judged[country] = { verdict: pass ? 'pass' : 'fail', hits: hit, asked, firstByteP75 }
  }
  return judged
}

const STATE_LABELS = [
  ['hit', 'kept answers'],
  ['miss', 'fresh drawings'],
  ['other', 'other answers'],
]

/**
 * What the run prints, and its exit code. Counts and timings only: the Actions log is public. The
 * weekly watch (`measuring`) fails on a missed pass mark; after a deploy it only warns, because the
 * warm-up must never fail a deploy.
 */
export function regionReport({ warmed, readBack, measuring }) {
  const lines = []
  let exitCode = 0
  for (const [country, { hit, miss, other }] of Object.entries(regionVerdict(warmed))) {
    lines.push(
      `[warm-regions] ${country}: ${hit + miss + other} asked — ${miss} drawn now (miss), ${hit} already kept (hit), ${other} other`,
    )
  }
  for (const [country, { hit, miss, other }] of Object.entries(regionVerdict(readBack))) {
    lines.push(
      `[warm-regions] ${country}: read back ${hit + miss + other} — ${hit} kept (hit), ${miss} drawn (miss), ${other} other`,
    )
  }
  const all = [...warmed, ...readBack]
  if (measuring) {
    for (const [country, states] of Object.entries(regionTimings(all))) {
      for (const [state, label] of STATE_LABELS) {
        const timed = states[state]
        if (!timed) continue
        lines.push(
          `[warm-regions] ${country}: ${label} p75 ${timed.firstByteP75} ms to the first byte, ${timed.totalP75} ms to the whole answer (${timed.n} answers)`,
        )
      }
    }
  }
  for (const [country, judged] of Object.entries(regionJudgement(readBack, all))) {
    if (judged.verdict === 'pass') continue
    const why =
      judged.hits === 0
        ? `the second pass found ${judged.hits} of ${judged.asked} kept`
        : `kept answers took ${judged.firstByteP75} ms to the first byte at p75, over ${STORE_FIRST_BYTE_P75_MS} ms`
    if (measuring) {
      lines.push(`::error::${country}: ${why}`)
      exitCode = 1
    } else {
      lines.push(`::warning::${country}: ${why}; the deploy stands`)
    }
  }
  return { lines, exitCode }
}

/**
 * Create one measurement and wait for it; throws a fixed sentence, never the response body. Every
 * request and every wait ends when `budget` does.
 */
async function measure(body, budget) {
  const within = (ms) => AbortSignal.any([budget, AbortSignal.timeout(ms)])
  const created = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: within(20_000),
  })
  if (created.status === 429) throw new Error('Globalping limit reached (429)')
  if (!created.ok) throw new Error(`Globalping answered ${created.status}`)
  const { id } = await created.json()
  for (let i = 0; i < POLLS; i++) {
    await sleep(POLL_MS, undefined, { signal: budget })
    const answer = await (await fetch(`${API}/${id}`, { signal: within(20_000) })).json()
    if (answer.status !== 'in-progress') return { id, results: answer.results ?? [] }
  }
  throw new Error('a Globalping measurement did not finish')
}

/**
 * Runs the plan: the first measurement picks the probes and every later one asks the same probes
 * again, at most `concurrency` at once. At `budgetMs` it stops waiting, even for a measurement that
 * never ends, and every measurement holds the budget's signal so its requests are cancelled.
 * Review, 27 Oct: the budget was checked only before a NEW measurement started, so slow ones could
 * carry the CI step past its 5 minutes; Actions would kill it and turn a good deploy red.
 *
 * @param {object[]} plan regionWarmPlan()'s bodies
 * @param {(body: object, budget: AbortSignal) => Promise<{ id: string, results: unknown[] }>} measureOne
 * @param {number} budgetMs
 * @returns {Promise<{ done: Array<{ id: string, results: unknown[] }>, stopped: null | string }>}
 *   `stopped`: null when every address was asked, 'budget', or the error's fixed sentence.
 */
export async function warmWithin(plan, measureOne, budgetMs, concurrency = CONCURRENCY) {
  const done = []
  const budget = AbortSignal.timeout(budgetMs)
  const outOfTime = new Promise((resolve) =>
    budget.addEventListener('abort', () => resolve('budget'), { once: true }),
  )
  const work = (async () => {
    const first = await measureOne(plan[0], budget)
    done.push(first)
    const queue = plan.slice(1).map((body) => ({ ...body, locations: first.id }))
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length > 0 && !budget.aborted) {
          done.push(await measureOne(queue.shift(), budget))
        }
      }),
    )
    return budget.aborted && queue.length > 0 ? 'budget' : null
  })().catch((error) => (budget.aborted ? 'budget' : error.message))
  const stopped = await Promise.race([work, outOfTime])
  return { done: [...done], stopped }
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
  const listed = warmTargets(xml, origin)
  // The garments in the order a buyer sees their cards; the sitemap's order when that page fails.
  const shown = await fetch(`${origin}/products`, { signal: AbortSignal.timeout(20_000) })
    .then((answer) => (answer.ok ? answer.text() : ''))
    .then(cardGarments)
    .catch(() => [])
  const garments = shown.length > 0 ? shown : listed.garments
  const targets = await regionTargets({ pages: listed.pages, garments }, origin)
  const plan = regionWarmPlan(targets, countries, PROBES_PER_COUNTRY)
  if (plan.length === 0) {
    console.log('::warning::the sitemap listed no website pages; the buyer regions were not warmed')
    return
  }
  const { done, stopped } = await warmWithin(plan, measure, WARM_BUDGET_MS)
  if (stopped !== null) {
    const why = stopped === 'budget' ? 'the 4-minute budget ran out' : stopped
    console.log(`::warning::${why}; ${done.length} of ${plan.length} addresses were warmed`)
  }
  // The second pass, from the probes the warm-up used (its first measurement picked them).
  let readBack = []
  if (done.length > 0) {
    const again = readBackPlan(plan, done[0].id)
    const second = await warmWithin(again, measure, READ_BACK_BUDGET_MS)
    readBack = second.done
    if (second.stopped !== null) {
      const why = second.stopped === 'budget' ? 'its budget ran out' : second.stopped
      console.log(
        `::warning::the second pass stopped (${why}); ${readBack.length} of ${again.length} read back`,
      )
    }
  }
  const report = regionReport({ warmed: done, readBack, measuring })
  for (const line of report.lines) console.log(line)
  process.exitCode = report.exitCode
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.log(`::warning::the buyer regions' warm-up stopped: ${error.message}`)
  })
}
