#!/usr/bin/env node
/**
 * Repo-wide coverage gate.
 *
 * WHY THIS EXISTS ON TOP OF THE PER-PACKAGE THRESHOLDS. Vitest's own `thresholds`
 * already fail each package's `test` script on a shortfall, and that is the fast
 * signal. What they cannot express is the failure that actually worries me here: a
 * package DISAPPEARING from the measurement. Delete a `coverage` block, rename a
 * config, or drop a workspace from `pnpm -r`, and that package's tests still run and
 * still pass — it simply stops being counted, and the repo-wide number goes UP
 * because the un-covered code left the denominator.
 *
 * That is the same shape as two failures already in this repo's history: gitleaks
 * living in a workflow where `needs:` could not reach it (so it could only ever fail
 * its own run), and `REFERENCE_PATHS` in find-orphan-media.mjs being declared and
 * never read while a test told the next person to update it. Both were green the
 * whole time. A gate nothing reaches is worse than no gate, because it is credited.
 *
 * So this asserts PRESENCE first and percentages second.
 *
 * ⚠️ IT READS FILES ON DISK, so it must run after the coverage run in the same job.
 * On a CI runner the checkout is clean and a missing file therefore means "did not
 * run"; locally a stale `coverage/` from an earlier run can satisfy the presence
 * check. `--max-age-minutes` exists for that and CI passes it.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')

/**
 * Every workspace that runs vitest. Hard-coded rather than discovered, on purpose:
 * discovery would silently shrink along with the thing it is checking, which is the
 * exact failure above.
 */
export const EXPECTED_PACKAGES = [
  'packages/shared',
  'apps/shrink',
  'apps/cms',
  'apps/viewer',
  'tools/asset-pipeline',
]

/**
 * Repo-wide floor.
 *
 * RE-RATCHETED 2026-08-31 (L10-01). It was set to 66 on 2026-08-13 from a
 * then-measurement of 1794/2686 lines = 66.79%, and never moved again. By
 * 2026-08-31 the real figure was 83.77%, so **319 already-covered lines could have
 * stopped being covered with every gate still green** — a floor 17 points below
 * reality is a floor that has stopped measuring anything.
 *
 * Now 81, from a measured 83.77% with two points of slack. Per-package thresholds
 * moved the same way and by the same rule: floor(measured) - 2, and NEVER below the
 * existing number, so this can only tighten.
 *
 * ⚠️ RAISING IS ALLOWED; LOWERING IS NOT. If a change drops coverage under a floor,
 * the answer is a test, not a smaller number. See CLAUDE.md — the viewer's floor is
 * deliberately the lowest in the repo and must NOT be "fixed" by excluding App.tsx
 * or Stage.tsx, which is where most of its uncovered lines live; they are covered by
 * apps/viewer/e2e/ in a real browser instead.
 *
 * ⚠️ RE-RATCHET AFTER A DELETION WITH CARE. A number a deletion happened to produce
 * is one nobody measured — that is why the floor was deliberately NOT raised when
 * RenderPage.tsx was removed on 2026-08-17.
 */
export const REPO_LINE_FLOOR = 81

/**
 * Decide the outcome from already-loaded summaries. Pure — no fs, no process — so
 * the failure modes can be tested without staging a coverage directory.
 *
 * @param {{name: string, summary: {total: {lines: {covered: number, total: number, pct: number}}} | null, ageMinutes: number | null}[]} reports
 * @param {{ floor?: number, maxAgeMinutes?: number | null }} [options]
 * @returns {{ ok: boolean, errors: string[], rows: {name: string, pct: number, covered: number, total: number}[], repoPct: number }}
 */
export function evaluate(reports, { floor = REPO_LINE_FLOOR, maxAgeMinutes = null } = {}) {
  const errors = []
  const rows = []
  let covered = 0
  let total = 0

  for (const report of reports) {
    if (!report.summary) {
      errors.push(
        `${report.name}: no coverage/coverage-summary.json. Either its tests did not run, ` +
          `or its vitest config lost its coverage block — see vitest.coverage.mjs.`,
      )
      continue
    }
    if (maxAgeMinutes !== null && report.ageMinutes !== null && report.ageMinutes > maxAgeMinutes) {
      errors.push(
        `${report.name}: coverage report is ${Math.round(report.ageMinutes)} min old ` +
          `(limit ${maxAgeMinutes}). A stale report would pass the presence check while ` +
          `measuring nothing — re-run the coverage step.`,
      )
      continue
    }
    const lines = report.summary.total.lines
    rows.push({ name: report.name, pct: lines.pct, covered: lines.covered, total: lines.total })
    covered += lines.covered
    total += lines.total
  }

  const repoPct = total === 0 ? 0 : Number(((covered / total) * 100).toFixed(2))

  if (total === 0) {
    errors.push('No coverage data at all — refusing to report a pass on an empty measurement.')
  } else if (repoPct < floor) {
    errors.push(`Repo-wide line coverage ${repoPct}% is below the floor of ${floor}%.`)
  }

  return { ok: errors.length === 0, errors, rows, repoPct }
}

function loadReports(root, packages) {
  return packages.map((name) => {
    const path = join(root, name, 'coverage', 'coverage-summary.json')
    try {
      const summary = JSON.parse(readFileSync(path, 'utf8'))
      const ageMinutes = (Date.now() - statSync(path).mtimeMs) / 60_000
      return { name, summary, ageMinutes }
    } catch {
      return { name, summary: null, ageMinutes: null }
    }
  })
}

function main() {
  const argv = process.argv.slice(2)
  const ageArg = argv.indexOf('--max-age-minutes')
  const maxAgeMinutes = ageArg === -1 ? null : Number(argv[ageArg + 1])

  const { ok, errors, rows, repoPct } = evaluate(loadReports(REPO_ROOT, EXPECTED_PACKAGES), {
    maxAgeMinutes,
  })

  for (const row of rows) {
    console.log(
      `  ${row.name.padEnd(24)} ${String(row.pct).padStart(6)}%  (${row.covered}/${row.total} lines)`,
    )
  }
  console.log(`  ${'REPO'.padEnd(24)} ${String(repoPct).padStart(6)}%  (floor ${REPO_LINE_FLOOR}%)`)

  if (!ok) {
    for (const error of errors) console.error(`::error::${error}`)
    process.exit(1)
  }
  console.log('Coverage gate passed.')
}

// Only run when invoked directly, so the test can import `evaluate`.
if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main()
}
