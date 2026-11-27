#!/usr/bin/env node
/**
 * The browser tests that did NOT simply pass, out of one run's merged Playwright report.
 *
 * WHY (27 Nov 2026). A test that fails and then passes on its retry is "flaky": the run stays
 * green and nobody is told. `languageNote.spec.ts` did that on main (run 45945482262) days after
 * it had failed a Dependabot run twice (45552789135), and finding it took reading two runs' raw
 * reports by hand, because a shard's own report is kept for one day. ci.yml's `e2e` job now
 * writes this small list beside the merged report and keeps it, and gate-health.yml reads a
 * week of them, so a test that needs its retry twice in a week is named in the weekly issue.
 *
 * It keeps only the tests Playwright marks `flaky` (failed, then passed) or `unexpected`
 * (failed every try), plus the run's four totals. Titles are the repository's own test names.
 *
 * Usage: node scripts/e2e-outcomes.mjs <viewer|site> <merged-report.json> > outcomes.json
 * The JSON goes to stdout and nothing else does. Exit 1 = the report could not be read, which
 * must never look like "no flaky tests".
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * @param {unknown} report Playwright's JSON reporter output
 * @param {string} suite which suite the report is for (`viewer` or `site`)
 * @returns {{ suite: string, stats: { expected: number, skipped: number, unexpected: number, flaky: number }, tests: { status: string, project: string, file: string, title: string }[] }}
 */
export function outcomes(report, suite) {
  const stats = /** @type {{ stats?: Record<string, unknown> }} */ (report)?.stats
  const suites = /** @type {{ suites?: unknown }} */ (report)?.suites
  if (!stats || !Array.isArray(suites)) throw new Error('not a Playwright JSON report')
  const count = (key) => {
    const value = stats[key]
    if (!Number.isInteger(value) || value < 0) throw new Error(`the report has no "${key}" total`)
    return value
  }
  const tests = []
  const walk = (node, path) => {
    for (const spec of node.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status !== 'flaky' && test.status !== 'unexpected') continue
        tests.push({
          status: test.status,
          project: String(test.projectName ?? ''),
          file: String(spec.file ?? ''),
          title: [...path, spec.title].join(' › '),
        })
      }
    }
    for (const child of node.suites ?? []) walk(child, [...path, child.title])
  }
  // The top level is one entry per FILE; its title is the file's name, already in `file`.
  for (const file of suites) walk(file, [])
  const result = {
    suite,
    stats: {
      expected: count('expected'),
      skipped: count('skipped'),
      unexpected: count('unexpected'),
      flaky: count('flaky'),
    },
    tests,
  }
  // The list and the totals come from the same report: if they disagree, the walk missed a level
  // of nesting, and a short list would read as a quiet week.
  const listed = (status) => tests.filter((t) => t.status === status).length
  if (listed('flaky') !== result.stats.flaky || listed('unexpected') !== result.stats.unexpected) {
    throw new Error(
      `found ${listed('flaky')} flaky and ${listed('unexpected')} failed tests, but the report's totals say ${result.stats.flaky} and ${result.stats.unexpected}`,
    )
  }
  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [suite, file] = process.argv.slice(2)
  if ((suite !== 'viewer' && suite !== 'site') || !file) {
    console.error('usage: node scripts/e2e-outcomes.mjs <viewer|site> <merged-report.json>')
    process.exit(1)
  }
  try {
    const result = outcomes(JSON.parse(readFileSync(file, 'utf8')), suite)
    console.error(
      `${suite}: ${result.stats.expected} passed, ${result.stats.flaky} flaky, ${result.stats.unexpected} failed, ${result.stats.skipped} skipped`,
    )
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(`e2e-outcomes: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
