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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_PRODUCT } from './live-products.mjs'

export const LIGHTHOUSE_VERSION = '13.4.1'
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
  { name: 'home', url: 'https://wear-run.help/' },
  { name: 'products', url: 'https://wear-run.help/products' },
  { name: 'contact', url: 'https://wear-run.help/contact' },
  {
    name: VIEWER_NAME,
    url: `https://viewer.wear-run.help/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`,
  },
]

/** Statuses that mean "ask again later" — Bot Fight Mode, rate limiting, a busy origin. */
export const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/**
 * Audits that fail on purpose. `is-crawlable` fails while `SITE_INDEXING` keeps the site
 * out of search; delete these three entries when the launch switch flips (the robot will
 * say so).
 */
export const EXPECTED_BELOW_ONE = {
  home: ['seo/is-crawlable'],
  products: ['seo/is-crawlable'],
  contact: ['seo/is-crawlable'],
}

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
 * The worst single performance score in the 2026-09-15 baseline (Lighthouse 13.4.1, five
 * runs each). A median of five that falls below the worst run seen before is not noise.
 *
 * ⚠️ Keyed by page name. A different default product is a different page with a different
 * model, so its missing floor FAILS the robot rather than borrowing this one — measure it.
 */
export const PERFORMANCE_FLOORS = {
  'home.mobile': 0.69,
  'home.desktop': 0.89,
  'products.mobile': 0.55,
  'products.desktop': 0.7,
  'contact.mobile': 0.87,
  'contact.desktop': 0.69,
  'viewer-rxps-wine.mobile': 0.26,
  'viewer-rxps-wine.desktop': 0.73,
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
  }
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
export function judgePage({ page, formFactor, runs }) {
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
  const line = (note) =>
    `  ${key.padEnd(26)} ${String(valid.length).padStart(1)}/${runs.length} runs  ` +
    CATEGORIES.map((category) => `${LABELS[category]} ${short(scores[category])}`).join('  ') +
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
  const expected = EXPECTED_BELOW_ONE[page] ?? []

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

  const floor = PERFORMANCE_FLOORS[key]
  if (floor === undefined) {
    failures.push(`${key}: no performance floor is recorded — measure this page and add one.`)
  } else if (scores.performance === null || scores.performance < floor) {
    const causes = [...failing].filter((id) => id.startsWith('performance/')).join(', ')
    failures.push(
      `${key}: performance median ${short(scores.performance)} is below the floor of ${floor}` +
        (causes ? ` (failing: ${causes}).` : '.'),
    )
  }

  return {
    key,
    failures,
    inconclusive,
    advisories,
    line: line(floor === undefined ? '' : `(perf floor ${floor})`),
  }
}

/** Judge every page. `ok` is false only for a failure; not-judged pages never fail it. */
export function evaluate(pages) {
  const judged = pages.map(judgePage)
  const failures = judged.flatMap((page) => page.failures)
  return {
    ok: failures.length === 0,
    failures,
    inconclusive: judged.flatMap((page) => page.inconclusive),
    advisories: judged.flatMap((page) => page.advisories),
    lines: judged.map((page) => page.line),
  }
}

function parseArgs(argv) {
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const list = (name) => value(name)?.split(',').filter(Boolean)
  const runs = Number(value('runs') ?? RUNS)
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error(`--runs must be a whole number, got ${value('runs')}`)
  return {
    pages: list('pages'),
    formFactors: list('form-factors'),
    runs,
    out: value('out'),
    from: value('from'),
    report: argv.includes('--report'),
  }
}

/**
 * The INSTALLED binary, never `npx lighthouse@x`. npx fetches at run time, past the lockfile,
 * the 24-hour release cooldown and Socket — every supply-chain control this repo keeps. A
 * missing binary is an error, not a fallback: a silent fallback would reopen that gap unseen.
 */
const LIGHTHOUSE_BIN = fileURLToPath(new URL('../node_modules/.bin/lighthouse', import.meta.url))

function runLighthouse(url, formFactor, file) {
  if (!existsSync(LIGHTHOUSE_BIN)) {
    throw new Error(
      `Lighthouse is not installed at ${LIGHTHOUSE_BIN}; run \`npx --yes pnpm@10.34.5 install\`. ` +
        'It is a pinned devDependency on purpose, and this robot will not fetch it with npx.',
    )
  }
  const args = [url]
  if (formFactor === 'desktop') args.push('--preset=desktop')
  // `--no-sandbox` only on CI, where the existing lighthouse job already needs it.
  const chrome = `--headless=new --no-first-run${process.env.CI ? ' --no-sandbox' : ''}`
  args.push('--output=json', `--output-path=${file}`, '--quiet', `--chrome-flags=${chrome}`)
  const result = spawnSync(LIGHTHOUSE_BIN, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    console.log(`[lighthouse-robot] lighthouse exited ${result.status} for ${url} (${formFactor})`)
  }
}

function readReport(file) {
  if (!existsSync(file) || statSync(file).size === 0) return readRun(null)
  try {
    return readRun(JSON.parse(readFileSync(file, 'utf8')))
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
    `[lighthouse-robot] Lighthouse ${LIGHTHOUSE_VERSION}, ${args.runs} run(s) each, ` +
      `${args.from ? `judging reports in ${dir}` : `writing reports to ${dir}`}`,
  )
  const results = []
  for (const page of pages) {
    for (const formFactor of factors) {
      const runs = []
      for (let i = 1; i <= args.runs; i++) {
        const file = join(dir, `${page.name}.${formFactor}.run${i}.json`)
        if (!args.from) runLighthouse(page.url, formFactor, file)
        runs.push(readReport(file))
      }
      results.push({ page: page.name, formFactor, runs })
    }
  }

  const { ok, failures, inconclusive, advisories, lines } = evaluate(results)
  for (const line of lines) console.log(line)
  for (const note of advisories) console.log(`[lighthouse-robot] ${note}`)
  for (const note of inconclusive) console.log(`[lighthouse-robot] inconclusive: ${note}`)
  for (const failure of failures) console.error(`::error::${failure}`)
  console.log(
    ok
      ? '[lighthouse-robot] every judged page meets its rules'
      : `[lighthouse-robot] ${failures.length} failure(s)`,
  )
  if (!ok && !args.report) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
