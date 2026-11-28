/**
 * Reads what gitleaks printed and says whether the secrets scan read the repository's history,
 * not merely whether it exited 0.
 *
 * WHY (2026-11-27). ci.yml's `secrets` job has twice been green having scanned almost nothing:
 * "1 commits scanned. scanned ~60 bytes" (run 32140573361) and "0 commits scanned" (run
 * 32506101672), both with "no leaks found" and exit 0 (.github/CLAUDE.md). The rule written
 * after them was "read the count, not the colour", which only works when a person reads it.
 * This reads it on every run.
 *
 * WHY A FLOOR AND NOT "EQUAL". Measured on six runs of 27 Nov 2026 against git's own counts:
 * on `main` at cd25fa9c gitleaks said 1,031 where `git rev-list --count HEAD` says 1,090 and
 * `--no-merges` says 1,031. gitleaks reads `git log -p`, and the 59 merge commits carry no
 * patch. On the other five commits it said 1,031 or 1,032 where `--no-merges` says 1,028 to
 * 1,031: the scan covers every fetched ref, not only HEAD. So the number can sit a little above
 * the expected one, and "equal" would fail healthy runs. A commit with no patch at all (an empty
 * commit) may put it a little below; that was not measured, and the floor leaves room for it.
 * The two failures on record were at 0.1% and 0% of the history; the floor is 90%.
 *
 * Usage: node scripts/check-secret-scan-count.mjs <gitleaks-output-file> <expected-commits>
 *   expected-commits: `git rev-list --count --no-merges HEAD`
 * Exit 0 = the scan read the history. Exit 1 = it did not, or nobody can tell: no count in the
 * output and no usable expected number both fail, by name.
 */
import { readFileSync, realpathSync } from 'node:fs'

/** The share of the expected commits a scan must have read. */
export const FLOOR = 0.9

/**
 * Pure: gitleaks' output and git's own count to a verdict.
 *
 * @param {string} output everything gitleaks printed (colour codes included)
 * @param {unknown} expected the number of non-merge commits git counts from HEAD
 * @returns {{ ok: boolean, scanned: number | null, needed: number | null, message: string }}
 */
export function judgeScanCount(output, expected) {
  const wanted = Number(expected)
  if (typeof expected === 'boolean' || expected === '' || expected === null) {
    return fail(null, null, 'git gave no commit count to compare with, so the scan was NOT checked')
  }
  if (!Number.isInteger(wanted) || wanted < 1) {
    return fail(null, null, `git's commit count is "${expected}", so the scan was NOT checked`)
  }
  // The last one: gitleaks prints the line once, at the end. Digits only, so a colour code
  // beside the number cannot be read as part of it.
  const found = [...String(output).matchAll(/(\d+) commits scanned/g)].at(-1)
  const needed = Math.ceil(wanted * FLOOR)
  if (!found) {
    return fail(
      null,
      needed,
      'gitleaks printed no "commits scanned" line, so nobody can say what it read',
    )
  }
  const scanned = Number(found[1])
  if (scanned < needed) {
    return fail(
      scanned,
      needed,
      `gitleaks scanned ${scanned} commits; this checkout has ${wanted} non-merge commits and the floor is ${needed}`,
    )
  }
  return {
    ok: true,
    scanned,
    needed,
    message: `gitleaks scanned ${scanned} commits (git counts ${wanted} non-merge commits from HEAD; floor ${needed})`,
  }
}

function fail(scanned, needed, message) {
  return { ok: false, scanned, needed, message }
}

function main(file, expected) {
  let output = ''
  try {
    output = readFileSync(file, 'utf8')
  } catch {
    // An unreadable file is "no count", which fails below by name.
  }
  const verdict = judgeScanCount(output, expected ?? '')
  if (verdict.ok) {
    console.log(verdict.message)
    return 0
  }
  console.log(
    `::error::The secrets scan did not read the history: ${verdict.message}. A green scan of nothing is not a pass.`,
  )
  return 1
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  process.exitCode = main(process.argv[2] ?? '', process.argv[3])
}
