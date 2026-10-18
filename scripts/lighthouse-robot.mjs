#!/usr/bin/env node
/**
 * The Lighthouse robot: the four public pages, phone and computer, five runs each, judged
 * on the median — against the LIVE sites.
 *
 * WHY THIS EXISTS BESIDE `lighthouserc.json`. That job runs Lighthouse 12.6.1 (bundled in
 * @lhci/cli 0.15.1) against a localhost fixture carrying a ~10 KB placeholder GLB, three
 * desktop runs, scores on `warn`. It guards the shell's byte weight and keeps doing so. It
 * says nothing about the live pages, and its scores do not compare with the 2026-09-15
 * baselines, which were Lighthouse 13.4.1 against the live sites. This robot is the
 * measurement those baselines came from, made repeatable.
 *
 * ⚠️ LIGHTHOUSE IS PINNED, AND A REPORT FROM ANY OTHER VERSION FAILS. Scores do not carry
 * across major versions, so judging 12.6.1 output against 13.4.1 floors would read a tool
 * change as a regression of the site.
 *
 * WHAT IS GATED, AND WHY — every rule comes from the 2026-09-15 baseline (40 runs), not
 * from a preference:
 *   - Accessibility, best practices, SEO and agentic browsing are judged by WHICH AUDITS
 *     fail. Accessibility and best practices were 1 on all eight page/profile pairs; agentic
 *     was 0.67 everywhere with `llms-txt` its only failing audit, and after PR #13 home,
 *     products and contact measured 1 (2026-09-16). A failing audit that is not expected
 *     is named and fails the robot.
 *   - One audit fails BY DESIGN: `is-crawlable` on the marketing site, while the launch
 *     switch keeps it out of search.
 *   - Performance is NOT gated at 100. Five runs of the same page spread by up to 0.41
 *     (products, phone). The floor is the WORST single run in the baseline, so only a
 *     median below anything seen before fails. Area 3 of the programme tightens it.
 *
 * ⚠️ AN AUDIT COUNTS AS FAILING ONLY IN A MAJORITY OF VALID RUNS. `robots-txt` failed in 2
 * of 5 viewer phone runs (a fetch timeout) and `inspector-issues` in 1 of 5 products phone
 * runs. A single-run rule reddens on both; the majority rule reports them as occasional
 * and still fails if either becomes persistent — which is when they need looking at.
 *
 * ⚠️ READ THE STATUS CODE FROM THE REPORT; LIGHTHOUSE DOES NOT RAISE IT. Measured
 * 2026-09-16 on 13.4.1: a page answering 404 produced NO `runtimeError` and was scored like
 * any page — SEO 0.45, best practices 0.96 — although `ignoreStatusCode` defaults to false
 * and `core/lib/navigation-error.js` returns ERRORED_DOCUMENT_REQUEST for any status of 400
 * or more. Why that path did not fire was not isolated. What matters here: a Cloudflare Bot
 * Fight Mode challenge is a 403 HTML page, and without this guard the robot grades
 * Cloudflare's challenge as the site and reports regressions that do not exist. So 403, 429
 * and 503 make a run inconclusive; any other status of 400 or more is a broken page.
 *
 * ⚠️ AN EXPECTED FAILURE THAT STARTS PASSING FAILS THE ROBOT. When the launch switch flips,
 * `is-crawlable` passes, and an exemption left in place would hide a `noindex` that came
 * back. The robot names the entry to delete.
 *
 * Egress: the viewer page downloads its model on every run — 3,839,824 bytes for rxps/wine
 * (HEAD, 2026-09-16) — so a full run costs about 38 MB. `--pages` narrows it.
 *
 * Usage:
 *   node scripts/lighthouse-robot.mjs                    # run all 40, judge, exit 1 on failure
 *   node scripts/lighthouse-robot.mjs --from=DIR         # judge reports already in DIR
 *   node scripts/lighthouse-robot.mjs --pages=home --form-factors=mobile --runs=1 --report
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { userAgents } from 'lighthouse/core/config/constants.js'
import { DEFAULT_PRODUCT } from './live-products.mjs'

export const LIGHTHOUSE_VERSION = '13.5.0'
export const RUNS = 5
/** Fewer valid runs than this and a page is reported as not judged, rather than judged. */
export const MIN_VALID_RUNS = 3
export const FORM_FACTORS = ['mobile', 'desktop']
export const CATEGORIES = [
  'performance',
  'accessibility',
  'best-practices',
  'seo',
  'agentic-browsing',
]

/**
 * The viewer page comes from `DEFAULT_PRODUCT`, never a typed slug — `perf-probe.mjs`
 * records a typed `rxps` once leaving a live product unmeasured. The page NAME matches the
 * 2026-09-15 baseline's file names, so `--from` can judge those reports as they are.
 */
const VIEWER_NAME = `viewer-${DEFAULT_PRODUCT.slug}-${DEFAULT_PRODUCT.colourway}`
export const PAGES = [
  { name: 'home', url: 'https://wear-run.com/' },
  { name: 'products', url: 'https://wear-run.com/products' },
  { name: 'contact', url: 'https://wear-run.com/contact' },
  {
    name: VIEWER_NAME,
    url: `https://wear-run.com/products/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`,
  },
]

/** Statuses that mean "ask again later" — Bot Fight Mode, rate limiting, a busy origin. */
export const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/**
 * Audits that fail on purpose, by page. Empty since the launch switch flipped on
 * 2026-09-25: until then `is-crawlable` failed on home, products and contact while
 * `SITE_INDEXING` kept the site out of search. A `noindex` coming back now fails the robot.
 */
export const EXPECTED_BELOW_ONE = {}

/*
 * ⚠️ A CSP ISSUE FAILS LIKE ANY OTHER AUDIT, AND UNTIL 2026-09-16 ONE DID NOT. That day
 * Chrome logged "Content security policy" issues in 8 of 40 live runs, against URLs the
 * enforced policies permit; a probe keeping Chrome's full record caught 63 more, and every
 * one was REPORT-ONLY. The source was Cloudflare's
 * client-side security ("Continuous script monitoring", on by default): it adds
 * `Content-Security-Policy-Report-Only: script-src 'unsafe-inline' 'unsafe-eval';
 * connect-src 'none'` to a SAMPLE of responses, so every script load and every connection
 * is reported while nothing is blocked. Cloudflare Speed Brain was suspected first and ruled
 * out — the issues persisted with `/cdn-cgi/speculation` blocked.
 *
 * An exemption was tried and removed the same day: the report keeps only each issue's URL,
 * so "every issue is a CSP issue" also matches a REAL enforced block that breaks the page.
 * The monitoring was switched off instead (owner's decision). If these issues return, check
 * that Cloudflare setting before anything else.
 */

/**
 * The worst single performance score in each MEASURING MACHINE's baseline (Lighthouse
 * 13.4.1, five runs each). A median of five below the worst run seen before is not noise.
 *
 * ⚠️ ONE SET PER MACHINE, BECAUSE THE NUMBERS DO NOT TRAVEL. `local` is the 2026-09-15
 * baseline, taken on the owner's Mac. The robot's first run on a GitHub runner (2026-09-16)
 * scored the marketing pages close to the Mac but the 3D viewer far lower on a computer
 * (median 0.58 against 0.73), with total blocking time failing beside the paint timings:
 * a GitHub-hosted runner has no GPU, so the model is drawn in software on the CPU, and a
 * visitor's device is not like that. The same Mac on a noisy network that day saw single
 * viewer runs of 0.55, which is why each page line now prints its runs and round-trip time.
 *
 * ⚠️ `github-runner` IS THE RUNNER'S OWN BASELINE: the worst single run of two dispatches of
 * this workflow on 2026-09-17 (runs 35188571511 and 35189406771; ten runs per page, nine for
 * products.mobile and contact.desktop, where Lighthouse once could not load the page). The
 * runner scores the marketing pages HIGHER than the Mac, its round trips to the edge were
 * 2–26 ms, and the viewer lower, so its floors are tighter on the site and looser on the
 * viewer. If a runner image change moves every page at once, re-take this baseline rather
 * than loosening one number.
 *
 * ⚠️ RE-TAKEN 2026-09-26, TIGHTER, AFTER THE SPEED WORK — the step this header promised "area
 * 3" would take and nothing took. The 2026-09-17 floors were the worst SINGLE run from before
 * the speed work, so a phone home page could fall from 0.94 to 0.80 and still pass. The nine
 * scheduled runs after RO-08 went live (2026-09-25, 12:04–17:24 UTC, 45 runs per page) gave
 * worst MEDIANS of: home 0.88 / 0.99, products 0.88 / 0.99, contact 0.94 / 0.99, viewer
 * 0.42 / 0.58 (phone / computer). Each floor is that worst median minus 0.03 on a phone and
 * 0.01 on a computer, and never below its 2026-09-17 value: nine medians is a small sample,
 * and the ten-percent chance that a tenth lands below the worst of nine is a false alarm, not
 * a regression. The owner chose this on 2026-09-26 ("keep the look, lock in today") over
 * trimming the site's motion to chase a phone 100. `lighthouseRobot.test.ts` pins both bounds.
 *
 * ⚠️ Keyed by page name. A different default product is a different page with a different
 * model, so its missing floor FAILS the robot rather than borrowing this one — measure it.
 */
const LOCAL_FLOORS = {
  'home.mobile': 0.69,
  'home.desktop': 0.89,
  'products.mobile': 0.55,
  'products.desktop': 0.7,
  'contact.mobile': 0.87,
  'contact.desktop': 0.69,
  'viewer-rxps-wine.mobile': 0.26,
  'viewer-rxps-wine.desktop': 0.73,
}

export const PERFORMANCE_FLOORS = {
  local: LOCAL_FLOORS,
  'github-runner': {
    'home.mobile': 0.85,
    'home.desktop': 0.98,
    'products.mobile': 0.85,
    'products.desktop': 0.98,
    'contact.mobile': 0.91,
    'contact.desktop': 0.98,
    'viewer-rxps-wine.mobile': 0.4,
    'viewer-rxps-wine.desktop': 0.57,
  },
}

/** The floor set that applies here. Every GitHub-hosted runner sets GITHUB_ACTIONS=true. */
export function measuringMachine(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' ? 'github-runner' : 'local'
}

/** Median of the numeric values; null when there are none. */
export function median(values) {
  const sorted = values
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The HTTP status the main document answered, read from the report itself.
 *
 * The `network-requests` audit carries it directly; `http-status-code` carries it as its
 * display value when it fails, and passes only for a status under 400. Null means the report
 * does not say — which is inconclusive, never assumed to be a 200.
 */
export function documentStatus(lhr) {
  const items = lhr?.audits?.['network-requests']?.details?.items ?? []
  const documents = items.filter((item) => item.resourceType === 'Document')
  const main = documents.find((item) => item.url === lhr?.mainDocumentUrl) ?? documents[0]
  if (typeof main?.statusCode === 'number') return main.statusCode
  const audit = lhr?.audits?.['http-status-code']
  if (audit?.score === 0 && /^\d{3}$/.test(String(audit.displayValue ?? ''))) {
    return Number(audit.displayValue)
  }
  if (audit?.score === 1) return 200
  return null
}

/** The parts of one Lighthouse report the robot judges. `null` means no report was written. */
export function readRun(lhr) {
  if (!lhr || typeof lhr !== 'object') return { missing: true, reason: 'no report was written' }
  const scores = {}
  const belowOne = []
  const observed = lhr.audits?.metrics?.details?.items?.[0]
  for (const [id, category] of Object.entries(lhr.categories ?? {})) {
    scores[id] = typeof category.score === 'number' ? category.score : null
    for (const ref of category.auditRefs ?? []) {
      const score = lhr.audits?.[ref.id]?.score
      // Zero-weight and non-numeric (not applicable, informative) audits cannot move a score.
      if (ref.weight > 0 && typeof score === 'number' && score < 1) {
        belowOne.push(`${id}/${ref.id}`)
      }
    }
  }
  return {
    missing: false,
    version: lhr.lighthouseVersion ?? null,
    formFactor: lhr.configSettings?.formFactor ?? null,
    status: documentStatus(lhr),
    runtimeError: lhr.runtimeError?.code ?? null,
    scores,
    belowOne,
    // The SLOWEST round-trip Lighthouse estimated to any origin the page used: `network-rtt`
    // lists one per origin and reports their maximum as its numericValue. On 2026-09-16 the
    // Mac's viewer runs that scored below the floor were at 375-596 ms, and the two at or
    // above it were at 126-280 ms.
    rttMs: numberOrNull(lhr.audits?.['network-rtt']?.numericValue),
    // Why a run scored what it did (investigation of 2026-10-18, F-04). The machine's CPU index:
    // Lighthouse's throttling is relative to the host (docs/throttling.md), so two machines are
    // only comparable at a similar index. The document's server time: a cold page cache answered
    // /products in 1,213 ms on the Mac that day, against 32 ms for a warm home page. And the
    // browser's own paint and load times, which `paintStall` reads.
    benchmarkIndex: numberOrNull(lhr.environment?.benchmarkIndex),
    ttfbMs: numberOrNull(lhr.audits?.['server-response-time']?.numericValue),
    observedFcpMs: numberOrNull(observed?.observedFirstContentfulPaint),
    observedDclMs: numberOrNull(observed?.observedDomContentLoaded),
    observedLoadMs: numberOrNull(observed?.observedLoad),
  }
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** First paint this much after the DOM was ready, with the page already loaded, is a stall. */
export const PAINT_STALL_MS = 700

/**
 * GoogleChrome/lighthouse#17148 (open, read 2026-10-18): under PHONE emulation headless Chrome
 * sometimes withholds the first frame for about 1 or 2 seconds after the page is ready, so the
 * load event fires BEFORE the first paint — "which no normal load produces" — and Lighthouse's
 * simulation turns that into a slow score. Reported on Chrome 153–155; the runner moved from
 * Chrome 152 to 153 on 2026-09-29, the day the phone medians stepped down. 700 ms is under the
 * shortest withheld-frame wait the issue measured (717 ms), so a stall is counted and a quick page is
 * not. Counted and printed only: it judges nothing until it is proven on our pages.
 */
export function paintStall(run) {
  if (!run || run.missing) return false
  const { observedFcpMs: fcp, observedDclMs: dcl, observedLoadMs: load } = run
  if (fcp === null || dcl === null || load === null) return false
  return load < fcp && fcp - dcl >= PAINT_STALL_MS
}

/** One run, sorted into: valid, inconclusive, broken (a 4xx/5xx page), or wrong-version. */
export function classifyRun(run) {
  if (run.missing) return { kind: 'inconclusive', why: run.reason }
  if (run.version !== LIGHTHOUSE_VERSION) {
    return { kind: 'wrong-version', why: `Lighthouse ${run.version ?? 'of unknown version'}` }
  }
  if (run.runtimeError) {
    return { kind: 'inconclusive', why: `Lighthouse could not load the page (${run.runtimeError})` }
  }
  if (run.status === null) {
    return { kind: 'inconclusive', why: 'the report does not say what status the page answered' }
  }
  if (INCONCLUSIVE_STATUSES.has(run.status)) {
    return { kind: 'inconclusive', why: `HTTP ${run.status}, which a datacenter IP can be handed` }
  }
  if (run.status >= 400) return { kind: 'broken', why: `HTTP ${run.status}` }
  return { kind: 'valid' }
}

const short = (score) => (score === null ? '—' : String(Math.round(score * 100) / 100))
const LABELS = {
  performance: 'perf',
  accessibility: 'a11y',
  'best-practices': 'bp',
  seo: 'seo',
  'agentic-browsing': 'agentic',
}

/** Judge one page on one form factor. Pure. */
export function judgePage({
  page,
  formFactor,
  runs,
  machine = measuringMachine(),
  floors = PERFORMANCE_FLOORS[machine],
  expectedBelowOne = EXPECTED_BELOW_ONE[page] ?? [],
}) {
  const key = `${page}.${formFactor}`
  const failures = []
  const inconclusive = []
  const advisories = []
  const sorted = runs.map((run) => ({ run, ...classifyRun(run) }))
  const of = (kind) => sorted.filter((entry) => entry.kind === kind)

  const wrong = of('wrong-version')
  if (wrong.length) {
    failures.push(
      `${key}: ${wrong.length} of ${runs.length} runs were measured with ${wrong[0].why}. ` +
        `This robot pins ${LIGHTHOUSE_VERSION}; scores do not compare across versions.`,
    )
  }
  const broken = of('broken')
  if (broken.length) {
    const statuses = [...new Set(broken.map((entry) => entry.run.status))].join(', ')
    failures.push(
      `${key}: the page answered HTTP ${statuses} in ${broken.length} of ${runs.length} runs.`,
    )
  }
  const skipped = of('inconclusive')
  if (skipped.length) {
    const reasons = [...new Set(skipped.map((entry) => entry.why))].join('; ')
    advisories.push(`${key}: ${skipped.length} of ${runs.length} runs set aside — ${reasons}.`)
  }

  const valid = of('valid').map((entry) => entry.run)
  const scores = Object.fromEntries(
    CATEGORIES.map((category) => [category, median(valid.map((run) => run.scores[category]))]),
  )
  const rtt = median(valid.map((run) => run.rttMs))
  const ttfb = median(valid.map((run) => run.ttfbMs))
  const cpu = median(valid.map((run) => run.benchmarkIndex))
  const stalls = valid.filter(paintStall).length
  const line = (note) =>
    `  ${key.padEnd(26)} ${String(valid.length).padStart(1)}/${runs.length} runs  ` +
    CATEGORIES.map((category) => `${LABELS[category]} ${short(scores[category])}`).join('  ') +
    `  perf runs ${valid.map((run) => short(run.scores.performance)).join('/')}` +
    `  rtt ${rtt === null ? '—' : `${Math.round(rtt)}ms`}` +
    `  ttfb ${ttfb === null ? '—' : `${Math.round(ttfb)}ms`}` +
    `  cpu ${cpu === null ? '—' : Math.round(cpu)}` +
    `  stalls ${stalls}/${valid.length}` +
    (note ? `  ${note}` : '')

  if (valid.length < MIN_VALID_RUNS) {
    inconclusive.push(
      `${key}: ${valid.length} valid run(s), ${MIN_VALID_RUNS} needed — not judged this time.`,
    )
    return { key, failures, inconclusive, advisories, line: line('(not judged)') }
  }

  const counts = new Map()
  for (const run of valid) {
    for (const id of new Set(run.belowOne)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const majority = Math.floor(valid.length / 2) + 1
  const failing = new Set([...counts].filter(([, count]) => count >= majority).map(([id]) => id))
  const expected = expectedBelowOne

  // Performance is judged by its floor, below; every other category by its failing audits.
  const judged = (id) => !id.startsWith('performance/')
  const unexpected = [...failing].filter((id) => judged(id) && !expected.includes(id))
  for (const id of unexpected) {
    failures.push(`${key}: ${id} fails in ${counts.get(id)} of ${valid.length} valid runs.`)
  }
  for (const id of expected) {
    if (!failing.has(id)) {
      failures.push(
        `${key}: ${id} was expected to fail and now passes — delete it from EXPECTED_BELOW_ONE, ` +
          'or a return of the old failure would go unnoticed.',
      )
    }
  }
  for (const [id, count] of counts) {
    if (count < majority && judged(id)) {
      advisories.push(`${key}: ${id} failed in ${count} of ${valid.length} runs (occasional).`)
    }
  }

  const floor = floors?.[key]
  if (floor === undefined) {
    failures.push(`${key}: no performance floor is recorded — measure this page and add one.`)
  } else if (scores.performance === null || scores.performance < floor) {
    const causes = [...failing].filter((id) => id.startsWith('performance/')).join(', ')
    failures.push(
      `${key}: performance median ${exact(scores.performance)} is below the ${machine} floor of ${floor}` +
        (causes ? ` (failing: ${causes}).` : '.'),
    )
  }

  return {
    key,
    failures,
    inconclusive,
    advisories,
    line: line(floor === undefined ? '' : `(${machine} perf floor ${floor})`),
  }
}

/**
 * A failing median, to three places. Lighthouse rounds each score to two, and with four valid
 * runs the median is the mean of the middle two: run 36983128382 printed "performance median
 * 0.85 is below the github-runner floor of 0.85" for a median of 0.845.
 */
export function exact(score) {
  return score === null ? '—' : score.toFixed(3)
}

/**
 * How many page/device pairs may go unjudged before the robot itself fails. One or two pairs
 * left with fewer than three valid runs is ordinary (a NO_NAVSTART or a 403 twice on the same
 * pair); more means the robot measured too little to vouch for the site. Until 2026-10-18 no
 * number of unjudged pairs could fail it, so a run that measured nothing passed (F-05).
 */
export const MAX_NOT_JUDGED = 2

/** Judge every page. `ok` is false for any failure, or when too many pairs went unjudged. */
export function evaluate(pages, { maxNotJudged = MAX_NOT_JUDGED } = {}) {
  const judged = pages.map(judgePage)
  const failures = judged.flatMap((page) => page.failures)
  const notJudged = judged.filter((page) => page.inconclusive.length > 0).length
  if (notJudged > maxNotJudged) {
    failures.push(
      `${notJudged} of ${judged.length} page/device pairs were not judged — too few valid runs ` +
        `to say anything (most allowed: ${maxNotJudged}).`,
    )
  }
  return {
    ok: failures.length === 0,
    failures,
    inconclusive: judged.flatMap((page) => page.inconclusive),
    advisories: judged.flatMap((page) => page.advisories),
    lines: judged.map((page) => page.line),
  }
}

/**
 * Runs made and thrown away before any is measured. The first Lighthouse run of a job is cold
 * (a fresh machine, a first Chrome start, and an edge cache the deploy just emptied):
 * home.mobile, always first, averaged 0.747 on run 1 against 0.89–0.91 on runs 2–5, and run 1
 * was the lowest of the five in 61 of 71 jobs (2026-09-29 → 2026-10-18).
 */
export const WARM_UP_RUNS = 1

/**
 * Every Lighthouse run in order. Warm-ups come first, on the first page and form factor, as
 * `run: 0, measured: false`; their reports are written and never read.
 */
export function plannedRuns({ pages, formFactors, runs, warmUp }) {
  const plan = []
  for (let i = 0; i < warmUp && pages.length && formFactors.length; i++) {
    plan.push({ page: pages[0], formFactor: formFactors[0], run: 0, measured: false })
  }
  for (const page of pages) {
    for (const formFactor of formFactors) {
      for (let run = 1; run <= runs; run++) plan.push({ page, formFactor, run, measured: true })
    }
  }
  return plan
}

export function parseArgs(argv) {
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const list = (name) => value(name)?.split(',').filter(Boolean)
  const runs = Number(value('runs') ?? RUNS)
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error(`--runs must be a whole number, got ${value('runs')}`)
  const from = value('from')
  // Judging reports already written measures nothing, so there is nothing to warm up.
  const warmUp = from ? 0 : Number(value('warm-up') ?? WARM_UP_RUNS)
  if (!Number.isInteger(warmUp) || warmUp < 0)
    throw new Error(`--warm-up must be a whole number of runs, got ${value('warm-up')}`)
  return {
    pages: list('pages'),
    formFactors: list('form-factors'),
    runs,
    warmUp,
    out: value('out'),
    from,
    report: argv.includes('--report'),
  }
}

/**
 * The INSTALLED binary, never `npx lighthouse@x`. npx fetches at run time, past the lockfile,
 * the 24-hour release cooldown and Socket — every supply-chain control this repo keeps. A
 * missing binary is an error, not a fallback: a silent fallback would reopen that gap unseen.
 */
const LIGHTHOUSE_BIN = fileURLToPath(new URL('../node_modules/.bin/lighthouse', import.meta.url))

/**
 * The tag every tool of ours carries when it touches production (apps/cms/src/endpoints/
 * events.ts drops `run-apparel-` rows; the weekly digest leaves them out too).
 *
 * ⚠️ THIS ROBOT WROTE MOST OF A WEEKLY DIGEST WITHOUT IT. Lighthouse 13 sends a plain phone or
 * Mac label (`core/config/constants.js`: "moto g power (2022)" and "Intel Mac OS X 10_15_7"),
 * which real browsers send too, so its visits to rxps/wine were stored as a buyer's: 317 of
 * the "render-scale-degraded R-XPS" rows in issue #5's digest of 2026-10-12, reported as
 * "2 browsers", and both rxps/wine "viewer-load-failed" rows of 6 Oct (read from D1,
 * 2026-10-15, `rows_written: 0`). The tag is APPENDED to Lighthouse's own label, so the page
 * still sees the device it always measured (Lighthouse swaps the real Chrome version into
 * it either way, `matchHostUAVersion` in `core/lib/emulation.js`).
 */
export const ROBOT_UA_MARK = 'run-apparel-lighthouse/1.0'

/** Lighthouse's own label for this form factor, with our tag on the end. */
export function robotUserAgent(formFactor) {
  return `${formFactor === 'desktop' ? userAgents.desktop : userAgents.mobile} ${ROBOT_UA_MARK}`
}

/** The command line for one run. Separate from `runLighthouse` so a test can read it. */
export function lighthouseArgs(url, formFactor, file, ci = Boolean(process.env.CI)) {
  const args = [url]
  if (formFactor === 'desktop') args.push('--preset=desktop')
  args.push(`--emulatedUserAgent=${robotUserAgent(formFactor)}`)
  // `--no-sandbox` only on CI, where the existing lighthouse job already needs it.
  const chrome = `--headless=new --no-first-run${ci ? ' --no-sandbox' : ''}`
  args.push('--output=json', `--output-path=${file}`, '--quiet', `--chrome-flags=${chrome}`)
  return args
}

function runLighthouse(url, formFactor, file) {
  if (!existsSync(LIGHTHOUSE_BIN)) {
    throw new Error(
      `Lighthouse is not installed at ${LIGHTHOUSE_BIN}; run \`npx --yes pnpm@12.6.0 install\`. ` +
        'It is a pinned devDependency on purpose, and this robot will not fetch it with npx.',
    )
  }
  const args = lighthouseArgs(url, formFactor, file)
  const result = spawnSync(LIGHTHOUSE_BIN, args, LIGHTHOUSE_SPAWN_OPTIONS)
  for (const line of describeExit(result, url, formFactor)) console.log(line)
}

/**
 * One run's ceiling. 40 runs took about 13 minutes on the runner (about 20 s each), and nothing
 * else bounded a single run: a Chrome that hung would have held the job until its 60 minutes ran
 * out and taken every page's result with it. A run stopped here leaves no report, so it is set
 * aside as inconclusive like any run that wrote none.
 */
export const LIGHTHOUSE_TIMEOUT_MS = 180_000

export const LIGHTHOUSE_SPAWN_OPTIONS = {
  stdio: ['ignore', 'ignore', 'pipe'],
  encoding: 'utf8',
  timeout: LIGHTHOUSE_TIMEOUT_MS,
  killSignal: 'SIGKILL',
}

/** How many of Lighthouse's own last lines a failed run prints. */
export const STDERR_TAIL_LINES = 20

/**
 * The end of Lighthouse's error output, without its progress chatter. Until 2026-10-18 the robot
 * kept stderr and printed none of it, so 147 failed runs said only "exited 1".
 */
export function stderrTail(text, lines = STDERR_TAIL_LINES) {
  const kept = String(text ?? '')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.includes(' LH:status '))
  return kept.slice(-lines).join('\n')
}

/** The lines to print about one finished `spawnSync` of Lighthouse; none for a clean run. */
export function describeExit(result, url, formFactor) {
  if (result.error?.code === 'ETIMEDOUT') {
    return [
      `::warning::lighthouse timed out after ${LIGHTHOUSE_TIMEOUT_MS / 1000} s for ${url} (${formFactor}) — stopped, set aside`,
    ]
  }
  if (result.status === 0) return []
  const tail = stderrTail(result.stderr)
  return [
    `::warning::lighthouse exited ${result.status} for ${url} (${formFactor}):`,
    ...(tail ? tail.split('\n').map((line) => `    ${line}`) : []),
  ]
}

export function readReport(file) {
  // One read, not "does it exist? then read it": the file can change between the two
  // (GitHub code scan, js/file-system-race, 2026-10-01). Missing or empty = no report.
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return readRun(null)
    throw error
  }
  if (text === '') return readRun(null)
  try {
    return readRun(JSON.parse(text))
  } catch {
    return { missing: true, reason: 'the report was not valid JSON' }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pages = PAGES.filter((page) => !args.pages || args.pages.includes(page.name))
  const factors = FORM_FACTORS.filter((f) => !args.formFactors || args.formFactors.includes(f))
  const dir = args.from ?? args.out ?? mkdtempSync(join(tmpdir(), 'lighthouse-robot-'))
  if (!args.from) mkdirSync(dir, { recursive: true })

  console.log(
    `[lighthouse-robot] Lighthouse ${LIGHTHOUSE_VERSION}, ${args.runs} run(s) each, floors: ${measuringMachine()}, ` +
      `${args.from ? `judging reports in ${dir}` : `writing reports to ${dir}`}`,
  )
  const results = []
  const byKey = new Map()
  let warmUps = 0
  for (const { page, formFactor, run, measured } of plannedRuns({
    pages,
    formFactors: factors,
    runs: args.runs,
    warmUp: args.warmUp,
  })) {
    if (!measured) {
      warmUps += 1
      runLighthouse(page.url, formFactor, join(dir, `warmup.${warmUps}.json`))
      continue
    }
    const key = `${page.name}.${formFactor}`
    if (!byKey.has(key)) {
      byKey.set(key, { page: page.name, formFactor, runs: [] })
      results.push(byKey.get(key))
    }
    const file = join(dir, `${key}.run${run}.json`)
    if (!args.from) runLighthouse(page.url, formFactor, file)
    byKey.get(key).runs.push(readReport(file))
  }

  const { ok, failures, inconclusive, advisories, lines } = evaluate(results)
  for (const line of lines) console.log(line)
  for (const note of advisories) console.log(`[lighthouse-robot] ${note}`)
  // An annotation, not a log line: an unjudged page must show on the run's page, not only in the log.
  for (const note of inconclusive) console.log(`::warning::lighthouse-robot inconclusive: ${note}`)
  for (const failure of failures) console.error(`::error::${failure}`)
  console.log(
    ok
      ? '[lighthouse-robot] every judged page meets its rules'
      : `[lighthouse-robot] ${failures.length} failure(s)`,
  )
  if (!ok && !args.report) process.exit(1)
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
