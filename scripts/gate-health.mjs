#!/usr/bin/env node
/**
 * One week of the gates, in numbers, for the weekly issue gate-health.yml opens.
 *
 * Why (owner, 27 Nov 2026). That day three things were found only because someone went looking:
 *   - a pull request waited a median 21.3 min and a merge took 33.9 min more to go live, over 60
 *     runs nobody had timed;
 *   - one browser test needed its retry on main days after failing a Dependabot run twice;
 *   - Cloudflare's Encrypted Client Hello, on by default for a Free zone, made Chrome on one
 *     network lose every model and picture (docs/RUNBOOK.md has the account). It is off on both
 *     zones now, and that setting lives only in Cloudflare.
 * This reads the same raw records again every week, so the next drift is named in an issue.
 *
 * What it reads, and nothing else:
 *   - GitHub's own records of ci.yml's runs in the last 7 days, and the jobs of each run on main
 *     and of each failed pull-request run (GH_TOKEN, `actions: read`);
 *   - the files ci.yml's `e2e` job keeps for each run (scripts/e2e-outcomes.mjs), already
 *     downloaded into a folder by the workflow;
 *   - the public HTTPS DNS record of the four hostnames, asked of two resolvers over HTTPS.
 *
 * It decides nothing and changes nothing. Three findings are marked "look at this": ECH offered
 * again, a merge that passed its tests and did not deploy although an earlier or later one that
 * week did (the fault of 27 Nov, run 45959048828), and a test that needed its retry in two or
 * more runs. The two time lines are compared with the medians measured before 27 Nov, as numbers.
 *
 * Usage: node scripts/gate-health.mjs <outcomes-folder> > issue-body.md
 * The issue body goes to stdout and nothing else does. Exit 1 = GitHub's records could not be
 * read whole, which must never look like a quiet week.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WINDOW_DAYS = 7
/** Medians of the 60 runs of 24–27 Nov 2026, before the browser tests were re-split. */
export const BEFORE = { pullRequestMin: 21.3, mergeToLiveMin: 33.9 }
export const HOSTS = ['wear-run.com', 'media.wear-run.com', 'cms.wear-run.help', 'wear-run.help']
export const RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']
/** `cloudflare-ech.com` as it appears, in hex, inside a record a resolver returns unparsed. */
const ECH_NAME_HEX = '636c6f7564666c6172652d6563682e636f6d'

const minutes = (from, to) => (Date.parse(to) - Date.parse(from)) / 60000
/** When this attempt began: a re-run keeps the first attempt's `created_at` (one read 820 min). */
const began = (run) => run.run_started_at ?? run.created_at
const median = (values) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const one = (value) => (value === null ? 'none' : `${value.toFixed(1)} min`)

/**
 * Does this resolver's answer still offer ECH for the host?
 *
 * @param {unknown} answer a DNS-over-HTTPS JSON answer for the host's HTTPS (type 65) record
 * @returns {boolean | null} null when the answer could not be read (never "no")
 */
export function offersEch(answer) {
  const status = /** @type {{ Status?: unknown }} */ (answer)?.Status
  if (status !== 0) return null
  const records = /** @type {{ Answer?: unknown }} */ (answer).Answer
  // A host with no HTTPS record at all offers nothing: that is an answer, not a failure.
  if (records === undefined) return false
  if (!Array.isArray(records)) return null
  return records.some((record) => {
    const data = String(record?.data ?? '').toLowerCase()
    return data.includes('ech=') || data.replace(/\s+/g, '').includes(ECH_NAME_HEX)
  })
}

/**
 * @param {{ run: { id: number, event: string, conclusion: string | null, created_at: string, run_started_at?: string, updated_at: string }, jobs?: { name: string, conclusion: string | null, started_at?: string | null, completed_at?: string | null }[] }[]} entries
 */
export function summariseRuns(entries) {
  const pulls = entries.filter((e) => e.run.event === 'pull_request')
  const mains = entries.filter((e) => e.run.event === 'push')
  const green = pulls.filter((e) => e.run.conclusion === 'success')
  const failedBy = {}
  for (const entry of pulls.filter((e) => e.run.conclusion === 'failure')) {
    const names = (entry.jobs ?? [])
      .filter((job) => job.conclusion === 'failure')
      // Sixteen machines are one gate; the verdict job `e2e` fails with them and says nothing new.
      .map((job) => (job.name.startsWith('e2e (') ? 'browser tests' : job.name))
      .filter((name) => name !== 'e2e')
    for (const name of new Set(names.length ? names : ['(jobs not read)'])) {
      failedBy[name] = (failedBy[name] ?? 0) + 1
    }
  }
  const toLive = []
  const notDeployed = []
  let proven = 0
  for (const entry of mains) {
    const job = (name) => (entry.jobs ?? []).find((j) => j.name === name)
    const shards = (entry.jobs ?? []).filter((j) => j.name.startsWith('e2e ('))
    const skippedOnProof =
      shards.length > 0 &&
      shards.every((j) => j.conclusion === 'skipped') &&
      job('e2e')?.conclusion === 'success'
    if (skippedOnProof) proven += 1
    const deploy = job('deploy')
    if (deploy?.conclusion === 'success' && deploy.completed_at) {
      toLive.push(minutes(began(entry.run), deploy.completed_at))
    } else if (entry.run.conclusion === 'success' && deploy?.conclusion === 'skipped') {
      notDeployed.push({ id: entry.run.id, skippedOnProof })
    }
  }
  return {
    pulls: {
      total: pulls.length,
      green: green.length,
      failed: pulls.filter((e) => e.run.conclusion === 'failure').length,
      cancelled: pulls.filter((e) => e.run.conclusion === 'cancelled').length,
      medianMin: median(green.map((e) => minutes(began(e.run), e.run.updated_at))),
      slowestMin: green.length
        ? Math.max(...green.map((e) => minutes(began(e.run), e.run.updated_at)))
        : null,
      failedBy,
    },
    main: {
      total: mains.length,
      deployed: toLive.length,
      medianToLiveMin: median(toLive),
      slowestToLiveMin: toLive.length ? Math.max(...toLive) : null,
      skippedOnProof: proven,
      // A green run on main with no deploy is normal for a docs-only merge. It is worth a look
      // only when the tests were skipped on proof AND nothing deployed all week: that is what
      // every merge looked like while the 27 Nov fault was live.
      suspectNoDeploy: toLive.length === 0 ? notDeployed.filter((r) => r.skippedOnProof) : [],
    },
  }
}

/**
 * @param {{ suite: string, tests: { status: string, project: string, file: string, title: string }[] }[]} files one per run and suite
 */
export function summariseOutcomes(files) {
  const byTest = new Map()
  for (const file of files) {
    for (const test of file.tests ?? []) {
      const key = `${file.suite} · ${test.project} · ${test.file} › ${test.title}`
      const entry = byTest.get(key) ?? { flaky: 0, failed: 0 }
      if (test.status === 'flaky') entry.flaky += 1
      if (test.status === 'unexpected') entry.failed += 1
      byTest.set(key, entry)
    }
  }
  return {
    reports: files.length,
    tests: [...byTest]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.flaky + b.failed - (a.flaky + a.failed) || a.name.localeCompare(b.name)),
  }
}

/**
 * A test's name, as inert text for the issue. The names are the repository's own, and the
 * workflow takes lists only from this repository's runs; this is the second lock. Everything
 * but letters, digits, spaces and a few plain marks becomes a space, so a name cannot hold a
 * backtick, a pipe, a bracket, an `@`, a `#` or a line break, and `code()` wraps it in a code
 * span, where GitHub turns nothing into a mention, a link or markup.
 */
const clean = (text) =>
  String(text)
    .replace(/[^\p{L}\p{N} .,:;·›—–'"/+=%()-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
const code = (text) => `\`${clean(text) || 'unnamed'}\``

/**
 * @param {{ runs: ReturnType<typeof summariseRuns>, outcomes: ReturnType<typeof summariseOutcomes>, ech: { host: string, resolver: string, offers: boolean | null }[], from: string, to: string }} week
 * @returns {string} the issue body
 */
export function render({ runs, outcomes, ech, from, to }) {
  const flags = []
  const echOn = [...new Set(ech.filter((e) => e.offers === true).map((e) => e.host))]
  const echUnread = ech.filter((e) => e.offers === null)
  if (echOn.length > 0) {
    flags.push(
      `**Encrypted Client Hello is offered again** for ${echOn.join(', ')}. It was switched off on 27 Nov 2026 because Chrome lost every model and picture on a network that resets it. docs/RUNBOOK.md, "The garment page loads but its model and picture do not", says how to check and switch it off.`,
    )
  }
  if (runs.main.suspectNoDeploy.length > 0) {
    flags.push(
      `**Merges passed their tests and nothing deployed all week** (runs ${runs.main.suspectNoDeploy.map((r) => r.id).join(', ')}; their browser tests were skipped on proof). On 27 Nov 2026 that was a fault in the deploy job's condition (run 45959048828). A week of documents only looks the same: check what merged.`,
    )
  }
  const repeat = outcomes.tests.filter((t) => t.flaky + t.failed >= 2)
  if (repeat.length > 0) {
    flags.push(
      `**${repeat.length} browser test${repeat.length === 1 ? '' : 's'} failed or needed a retry in two or more runs.** They are listed below; a test that needs its retry is hiding a real wait or a real fault.`,
    )
  }
  const lines = [
    `The gates from ${from} to ${to} (UTC), read from GitHub's own records.`,
    '',
    flags.length ? '## Look at this' : '## Nothing needs attention',
    ...(flags.length ? flags.map((f) => `- ${f}`) : ['No finding this week.']),
    '',
    '## How long things took',
    '',
    '| | This week | Before 27 Nov 2026 |',
    '|---|---|---|',
    `| Pull request checks, median (${runs.pulls.green} green runs) | ${one(runs.pulls.medianMin)} | ${BEFORE.pullRequestMin} min |`,
    `| Pull request checks, slowest | ${one(runs.pulls.slowestMin)} | |`,
    `| Merge until live, median (${runs.main.deployed} deploys) | ${one(runs.main.medianToLiveMin)} | ${BEFORE.mergeToLiveMin} min |`,
    `| Merge until live, slowest | ${one(runs.main.slowestToLiveMin)} | |`,
    '',
    `Pull request runs: ${runs.pulls.total} (${runs.pulls.green} green, ${runs.pulls.failed} failed, ${runs.pulls.cancelled} cancelled by a newer push). Runs on main: ${runs.main.total}, of which ${runs.main.skippedOnProof} skipped the browser tests because the same files had passed on the pull request.`,
  ]
  const failed = Object.entries(runs.pulls.failedBy).sort((a, b) => b[1] - a[1])
  if (failed.length > 0) {
    lines.push('', '## What failed pull requests', '', '| Gate | Runs it failed |', '|---|---|')
    for (const [name, count] of failed) lines.push(`| ${code(name)} | ${count} |`)
  }
  lines.push('', '## Browser tests that did not simply pass', '')
  if (outcomes.reports === 0) {
    lines.push('No report was found for this week, so this was not checked.')
  } else if (outcomes.tests.length === 0) {
    lines.push(`None, in ${outcomes.reports} reports.`)
  } else {
    lines.push(
      `From ${outcomes.reports} report${outcomes.reports === 1 ? '' : 's'} (one per run and suite).`,
      '',
      '| Test | Passed on retry | Failed |',
      '|---|---|---|',
    )
    for (const test of outcomes.tests.slice(0, 25)) {
      lines.push(`| ${code(test.name)} | ${test.flaky} | ${test.failed} |`)
    }
    if (outcomes.tests.length > 25) lines.push('', `…and ${outcomes.tests.length - 25} more.`)
  }
  lines.push('', '## Encrypted Client Hello (should be off)', '')
  if (echUnread.length === ech.length) {
    lines.push('No resolver answered, so this was not checked.')
  } else {
    lines.push(
      echOn.length === 0
        ? `Off for all ${HOSTS.length} hostnames.`
        : `Offered for: ${echOn.join(', ')}.`,
    )
    if (echUnread.length > 0) {
      lines.push(`${echUnread.length} of ${ech.length} lookups got no answer.`)
    }
  }
  lines.push(
    '',
    'Written by `.github/workflows/gate-health.yml` (`scripts/gate-health.mjs`). It reports and changes nothing; close this issue once read.',
  )
  return `${lines.join('\n')}\n`
}

/** Every page of a GitHub list, or an error: a list cut short must not read as a short week. */
async function listAll(get, path, key) {
  const items = []
  for (let page = 1; page <= 20; page += 1) {
    const body = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    const batch = body?.[key]
    if (!Array.isArray(batch)) throw new Error(`${path}: no "${key}" list`)
    items.push(...batch)
    if (items.length >= body.total_count || batch.length === 0) {
      if (items.length !== body.total_count) {
        throw new Error(`${path}: read ${items.length} of ${body.total_count}`)
      }
      return items
    }
  }
  throw new Error(`${path}: more than 2,000 entries`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2]
  const repository = process.env.REPOSITORY
  const token = process.env.GH_TOKEN
  if (!folder || !repository || !token) {
    console.error(
      'usage: REPOSITORY=owner/name GH_TOKEN=… node scripts/gate-health.mjs <outcomes-folder>',
    )
    process.exit(1)
  }
  const get = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`)
    return response.json()
  }
  try {
    const to = new Date()
    const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000)
    const day = (date) => date.toISOString().slice(0, 10)
    const runs = await listAll(
      get,
      `actions/workflows/ci.yml/runs?created=${encodeURIComponent(`>=${from.toISOString()}`)}`,
      'workflow_runs',
    )
    const entries = []
    for (const run of runs) {
      if (run.status !== 'completed') continue
      const wantsJobs =
        run.event === 'push' || (run.event === 'pull_request' && run.conclusion === 'failure')
      const jobs = wantsJobs
        ? await listAll(get, `actions/runs/${run.id}/jobs?filter=latest`, 'jobs')
        : undefined
      entries.push({ run, jobs })
    }
    const files = []
    if (existsSync(folder)) {
      for (const name of readdirSync(folder, { recursive: true })) {
        if (!String(name).endsWith('.json')) continue
        try {
          const parsed = JSON.parse(readFileSync(join(folder, String(name)), 'utf8'))
          if (typeof parsed?.suite === 'string' && Array.isArray(parsed.tests)) files.push(parsed)
        } catch {
          // An unreadable file is left out; the count of reports in the issue shows it.
        }
      }
    }
    const ech = []
    for (const resolver of RESOLVERS) {
      for (const host of HOSTS) {
        let offers = null
        try {
          const response = await fetch(`${resolver}?name=${host}&type=HTTPS`, {
            headers: { accept: 'application/dns-json' },
          })
          if (response.ok) offers = offersEch(await response.json())
        } catch {
          offers = null
        }
        ech.push({ host, resolver, offers })
      }
    }
    const summary = summariseRuns(entries)
    console.error(
      `runs ${entries.length} · reports ${files.length} · ECH lookups ${ech.filter((e) => e.offers !== null).length} of ${ech.length} answered`,
    )
    process.stdout.write(
      render({
        runs: summary,
        outcomes: summariseOutcomes(files),
        ech,
        from: day(from),
        to: day(to),
      }),
    )
  } catch (error) {
    console.error(`gate-health: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
