/**
 * Reads `gh actions-lock --verify --json` and says whether the workflow lockfile was CHECKED and
 * found good — not merely whether the tool exited 0.
 *
 * WHY (2026-11-08). GitHub's "Enforcing lockfiles" guide recommends a pull-request check that runs
 * `gh actions-lock --verify`. workflowHardening.test.ts already proves, offline, that every `uses:`
 * has a lockfile entry; only GitHub can say whether a locked commit is still in its action's
 * history, a full tag still points at it, and the repository behind the name is the one locked.
 * Measured against v0.4.1 on this repository's own lockfile before this was written:
 *   clean lockfile ..................... exit 0, valid true, 1 warning (Scorecard's image)
 *   one locked commit changed by hand .. exit 1, valid false, `unreachable-pin` errors
 *   GitHub refused (dead proxy) ........ exit 1, valid false, `reachability-unknown` errors
 *   GitHub TIMED OUT (plain output) .... exit 0, "Couldn't verify 10 pins … re-run this check"
 * The last row is the trap: a slow API turned the check green having verified nothing — the
 * green-but-empty failure .github/CLAUDE.md records for gitleaks. So this judges the JSON, and a
 * pin GitHub could not answer for is "not checked" (exit 2), never a pass and never "the lockfile
 * is wrong": a failed FETCH and a failed CHECK must not look the same.
 *
 * Usage: node scripts/check-actions-lock.mjs <report.json>
 * Exit 0 = checked and valid, 1 = the lockfile is wrong, 2 = not checked (GitHub unreachable,
 * or no readable report).
 */
import { readFileSync, realpathSync } from 'node:fs'

/** Finding categories that mean GitHub was not asked or did not answer. */
const NOT_CHECKED = /reachability-unknown|unreachable-api|unverified|could-not-verify/

/**
 * Pure: one `--verify --json` report to a verdict.
 *
 * @param {unknown} report the parsed JSON, or anything else
 * @returns {{ state: 'ok' | 'invalid' | 'unchecked', lines: string[] }}
 */
export function judgeLockReport(report) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.findings)) {
    return { state: 'unchecked', lines: ['no readable report from gh actions-lock'] }
  }
  const findings = report.findings
  const describe = (f) => `${f.severity ?? '?'} ${f.category ?? '?'}: ${f.detail ?? ''}`
  // The tool repeats one finding once per workflow that uses the pin; say each once.
  const unique = (list) => [...new Set(list.map(describe))]
  const notChecked = findings.filter((f) => NOT_CHECKED.test(String(f.category ?? '')))
  if (notChecked.length > 0) {
    return { state: 'unchecked', lines: unique(notChecked) }
  }
  const errors = findings.filter((f) => f.severity === 'error')
  if (report.valid !== true || errors.length > 0) {
    const lines = unique(errors)
    return { state: 'invalid', lines: lines.length ? lines : ['the report says valid: false'] }
  }
  return { state: 'ok', lines: unique(findings) }
}

function main(file) {
  let report = null
  try {
    report = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // An empty or cut-off file is the tool failing to run, not a verdict on the lockfile.
  }
  const { state, lines } = judgeLockReport(report)
  for (const line of lines) console.log(`  ${line}`)
  if (state === 'ok') {
    console.log('actions.lock: every locked action was checked against GitHub and is valid')
    return 0
  }
  if (state === 'invalid') {
    console.log(
      '::error::actions.lock does not match GitHub — run `gh actions-lock` and review the diff',
    )
    return 1
  }
  console.log(
    '::error::actions.lock was NOT checked: GitHub did not answer for every pin. This is not a verdict on the lockfile — re-run the job.',
  )
  return 2
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  process.exitCode = main(process.argv[2] ?? '')
}
