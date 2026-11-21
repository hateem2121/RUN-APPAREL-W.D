#!/usr/bin/env node
/**
 * The first-visit guard: after a quiet spell, how long does the first byte take?
 *
 *   node scripts/first-visit-burst.mjs            # the three kinds below, from US probes
 *   node scripts/first-visit-burst.mjs --json     # one JSON line per answer as well
 *
 * WHY (21 Nov 2026, owner's yes). The site's Worker is 40.8 MiB and a fresh copy of it takes 1.2
 * to 2.0 s to start, so the FIRST requests after any quiet spell were slow in every region while
 * every warm check stayed green: three US bursts on the garment data measured p90 1,467, 1,389
 * and 1,791 ms on 20 Nov, with 43 of 120 answers over 800 ms. The front door (apps/cms/door.mjs)
 * answers what the store holds without that Worker starting; the same three bursts the next day
 * measured p90 145, 293 and 181 ms, 0 of 90 over 800 ms. Nothing else in the repo asks this
 * question: perf-probe.mjs times a warm path from the runner, and warm-regions.mjs asks pages it
 * has just asked. If the door is ever taken off its routes, switched off or broken, this is the
 * check that goes red.
 *
 * HOW. Globalping's free probes (no key, 250 tests an hour), the same service warm-regions.mjs
 * uses: for each kind, BURST requests from US probes, ten at a time, each to one of a few
 * addresses. It runs FIRST in perf-watch.yml's job, before any step that asks the site for
 * anything, because a burst fired after other traffic is fast for the wrong reason.
 *
 * THE PASS MARK is the task's own: the first byte within FIRST_BYTE_P90_MS at p90, for each kind.
 *
 * Exit codes: 0 every judged kind passed, or the run was inconclusive (a warning, never a pass
 * said out loud); 1 a judged kind missed the mark. ⚠️ A 403/429/503, a Globalping error or limit,
 * and a burst with too few answers are INCONCLUSIVE (.github/CLAUDE.md: anything CI fetches from
 * these hosts can be refused by Bot Fight Mode). It prints timings and counts only: the Actions
 * log is public.
 */
import { realpathSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { LIVE_PRODUCTS } from './live-products.mjs'

/** The first byte, at p90, for each kind (the owner's pass line of 20 Nov 2026). */
export const FIRST_BYTE_P90_MS = 800

/** Requests in one burst, and how many go out together (the shape of the 20 Nov baseline). */
export const BURST = 30
export const TOGETHER = 10

/** Fewer answers than this is not a measurement: the kind is inconclusive, never passed. */
export const MIN_ANSWERS = 20

const API = 'https://api.globalping.io/v1/measurements'
const SITE = 'wear-run.com'
const DATA = 'cms.wear-run.help'

/** The first five live garments, each at its first colourway: the addresses a QR tag opens. */
const garments = LIVE_PRODUCTS.slice(0, 5).map((p) => `${p.slug}/${p.colourway}`)

/**
 * What is asked. `judged: false` is measured and printed but cannot fail the run.
 * @type {ReadonlyArray<{ kind: string, host: string, paths: string[], headers?: Record<string, string>, judged: boolean }>}
 */
export const KINDS = [
  {
    kind: 'garment data',
    host: DATA,
    paths: garments.map((g) => `/api/public/viewer/${g}`),
    headers: { Origin: `https://${SITE}` },
    judged: true,
  },
  {
    kind: 'garment page',
    host: SITE,
    paths: garments.map((g) => `/products/${g}`),
    judged: true,
  },
  {
    kind: 'website page',
    host: SITE,
    paths: ['/guides', '/faq', '/contact', '/custom-teamwear-manufacturer', '/privacy'],
    judged: true,
  },
]

/** The value at quantile `p` of a list (nearest rank, as the baseline's summary used). */
export function quantile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null
}

/**
 * One burst, judged.
 * @param {Array<{ status?: number, firstByte?: number, error?: string }>} rows
 * @returns {{ verdict: 'pass' | 'fail' | 'inconclusive', answered: number, refused: number, p50: number | null, p90: number | null, max: number | null, slow: number, why: string }}
 */
export function judgeBurst(rows, maxP90 = FIRST_BYTE_P90_MS, minAnswers = MIN_ANSWERS) {
  const refused = rows.filter((r) => [403, 429, 503].includes(r.status ?? 0)).length
  const timed = rows
    .filter((r) => r.status === 200 && Number.isFinite(r.firstByte))
    .map((r) => /** @type {number} */ (r.firstByte))
  const p50 = quantile(timed, 0.5)
  const p90 = quantile(timed, 0.9)
  const max = timed.length ? Math.max(...timed) : null
  const slow = timed.filter((ms) => ms >= maxP90).length
  const numbers = { answered: timed.length, refused, p50, p90, max, slow }
  if (timed.length < minAnswers) {
    return {
      ...numbers,
      verdict: 'inconclusive',
      why: `only ${timed.length} of ${rows.length} answered 200 with a timing (${refused} refused)`,
    }
  }
  return p90 !== null && p90 < maxP90
    ? { ...numbers, verdict: 'pass', why: `p90 ${p90} ms is under ${maxP90} ms` }
    : { ...numbers, verdict: 'fail', why: `p90 ${p90} ms is not under ${maxP90} ms` }
}

/**
 * The run's result from each kind's verdict: a judged miss fails; anything inconclusive warns.
 * @param {Array<{ kind: string, judged: boolean, verdict: 'pass' | 'fail' | 'inconclusive' }>} kinds
 */
export function runVerdict(kinds) {
  if (kinds.some((k) => k.judged && k.verdict === 'fail')) return { exitCode: 1, state: 'fail' }
  if (kinds.some((k) => k.verdict === 'inconclusive')) return { exitCode: 0, state: 'inconclusive' }
  return { exitCode: 0, state: 'pass' }
}

/** One request through one US probe; a fixed sentence on failure, never a response body. */
async function ask(host, path, headers) {
  const body = {
    type: 'http',
    target: host,
    locations: [{ country: 'US' }],
    limit: 1,
    measurementOptions: {
      protocol: 'HTTPS',
      request: { method: 'GET', path, ...(headers ? { headers } : {}) },
    },
  }
  try {
    const created = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    if (created.status === 429) return { error: 'Globalping limit reached (429)' }
    if (!created.ok) return { error: `Globalping answered ${created.status}` }
    const { id } = await created.json()
    for (let poll = 0; poll < 20; poll++) {
      await sleep(1_500)
      const answer = await (
        await fetch(`${API}/${id}`, { signal: AbortSignal.timeout(20_000) })
      ).json()
      if (answer.status === 'in-progress') continue
      const result = answer.results?.[0]?.result
      return {
        status: result?.statusCode,
        firstByte: result?.timings?.firstByte,
        city: answer.results?.[0]?.probe?.city,
      }
    }
    return { error: 'a Globalping measurement did not finish' }
  } catch {
    return { error: 'Globalping could not be reached' }
  }
}

async function burst(kind) {
  const rows = []
  for (let sent = 0; sent < BURST; sent += TOGETHER) {
    const batch = Array.from({ length: Math.min(TOGETHER, BURST - sent) }, (_, i) =>
      ask(kind.host, kind.paths[(sent + i) % kind.paths.length], kind.headers),
    )
    rows.push(...(await Promise.all(batch)))
    if (sent + TOGETHER < BURST) await sleep(4_000)
  }
  return rows
}

async function main(args) {
  const json = args.includes('--json')
  const results = []
  for (const kind of KINDS) {
    const rows = await burst(kind)
    if (json) for (const row of rows) console.log(JSON.stringify({ kind: kind.kind, ...row }))
    const judged = judgeBurst(rows)
    results.push({ kind: kind.kind, judged: kind.judged, verdict: judged.verdict })
    const cities = new Set(rows.map((r) => r.city).filter(Boolean)).size
    const numbers = `answered ${judged.answered}/${rows.length}, p50 ${judged.p50} ms, p90 ${judged.p90} ms, max ${judged.max} ms, ${judged.slow} at or over ${FIRST_BYTE_P90_MS} ms, ${cities} probe cities`
    if (judged.verdict === 'pass') console.log(`✓ ${kind.kind}: ${numbers}`)
    else if (judged.verdict === 'inconclusive')
      console.log(`::warning::${kind.kind}: inconclusive, ${judged.why}`)
    else if (kind.judged) console.log(`::error::${kind.kind}: ${judged.why} (${numbers})`)
    else console.log(`::warning::${kind.kind} (measured, not judged): ${judged.why} (${numbers})`)
  }
  const { exitCode, state } = runVerdict(results)
  if (state === 'fail') {
    console.log(
      '::error::a first visit was slow. Is the front door on its routes and switched on? docs/RUNBOOK.md, "The front door".',
    )
  }
  return exitCode
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2))
}
