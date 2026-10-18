#!/usr/bin/env node
/**
 * Re-take the Lighthouse robot's runner baseline from the reports `lighthouse-live.yml` keeps.
 *
 * WHY. The runner floors (`PERFORMANCE_FLOORS['github-runner']` in lighthouse-robot.mjs) came
 * from the nine medians of one afternoon, 2026-09-25, on ubuntu-24.04 with Chrome 152. On
 * 2026-09-29 the runner moved to ubuntu-26.04 and Chrome 153 (155 by 2026-10-18), the phone
 * medians stepped down by 0.01–0.03, and the robot failed 12 of the 22 runs to 2026-10-18 with
 * nothing on the site broken (investigation F-01/F-02). The robot's own rule: when the runner
 * changes, re-take the baseline rather than loosen one number. This prints, per page and
 * device, the spread of one median per job, so a floor can sit under that spread on evidence.
 * It changes nothing; floors change only with the owner's approval (decision of 2026-10-18).
 *
 * Usage (each DIR is one downloaded `lighthouse-reports-*` artifact, i.e. one job):
 *   gh run download <id> -n lighthouse-reports-<id>-<attempt> -D <DIR>
 *   node scripts/lighthouse-baseline.mjs DIR...
 */
import { readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyRun,
  MIN_VALID_RUNS,
  median,
  PERFORMANCE_FLOORS,
  paintStall,
  readReport,
} from './lighthouse-robot.mjs'

/** One job's measured runs; warm-ups (`warmup.N.json`) are never judged and are left out. */
export function readJobDir(dir) {
  return readdirSync(dir)
    .filter((file) => /\.run\d+\.json$/.test(file))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((file) => {
      const [page, formFactor] = file.replace(/\.run\d+\.json$/, '').split(/\.(?=[^.]+$)/)
      return { page, formFactor, run: readReport(join(dir, file)) }
    })
}

/** The value at a fraction of the way up a sorted list, by nearest rank. */
function nearestRank(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]
}

/**
 * One median per job and page/device, judged the way the robot judges: only valid runs count,
 * and a job with fewer than MIN_VALID_RUNS of them is left out, as the robot leaves it unjudged.
 */
export function summariseBaseline(jobs) {
  const byKey = new Map()
  for (const entries of jobs) {
    const perKey = new Map()
    for (const { page, formFactor, run } of entries) {
      const key = `${page}.${formFactor}`
      if (!perKey.has(key)) perKey.set(key, [])
      if (classifyRun(run).kind === 'valid') perKey.get(key).push(run)
    }
    for (const [key, valid] of perKey) {
      if (!byKey.has(key)) byKey.set(key, { medians: [], runs: [] })
      if (valid.length < MIN_VALID_RUNS) continue
      byKey.get(key).medians.push(median(valid.map((run) => run.scores.performance)))
      byKey.get(key).runs.push(...valid)
    }
  }
  const summary = {}
  for (const [key, { medians, runs }] of byKey) {
    const sorted = [...medians].sort((a, b) => a - b)
    summary[key] = {
      jobs: sorted.length,
      medians: sorted,
      worstMedian: sorted[0] ?? null,
      p10Median: sorted.length ? nearestRank(sorted, 0.1) : null,
      stallRate: runs.length ? runs.filter(paintStall).length / runs.length : 0,
      cpuMedian: median(runs.map((run) => run.benchmarkIndex)),
      failuresAt: (floor) => sorted.filter((value) => value < floor).length,
    }
  }
  return summary
}

function main() {
  const dirs = process.argv.slice(2)
  if (!dirs.length) throw new Error('name one or more artifact folders, one per job')
  const summary = summariseBaseline(dirs.map(readJobDir))
  const floors = PERFORMANCE_FLOORS['github-runner']
  const f = (value) => (value === null ? '—' : value.toFixed(3))
  console.log(`[lighthouse-baseline] ${dirs.length} job folder(s)`)
  for (const [key, s] of Object.entries(summary).sort()) {
    const floor = floors[key]
    console.log(
      `  ${key.padEnd(26)} jobs ${String(s.jobs).padStart(3)}  medians worst ${f(s.worstMedian)}` +
        ` p10 ${f(s.p10Median)} mid ${f(median(s.medians))} best ${f(s.medians.at(-1) ?? null)}` +
        `  stalls ${(s.stallRate * 100).toFixed(1)}%  cpu ${s.cpuMedian === null ? '—' : Math.round(s.cpuMedian)}` +
        `  floor ${floor ?? '—'} would fail ${floor === undefined ? '—' : `${s.failuresAt(floor)}/${s.jobs}`}`,
    )
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
