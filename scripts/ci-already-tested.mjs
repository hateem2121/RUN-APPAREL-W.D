#!/usr/bin/env node
/**
 * Did the browser tests already pass on exactly these files?
 *
 * ci.yml's `changes` job runs this on every run and hands `browser_tests=proven|run` to
 * `e2e-shard`. On a push to `main` that answer is `proven` only when GitHub's own records show
 * that the pull request this commit came from was tested on the SAME files; then the shards are
 * skipped and `e2e` passes on the proof (`--verdict` below). Everything else answers `run`.
 *
 * WHY (measured 27 Nov 2026, the 60 CI runs of 24–27 Nov). A merge re-ran all 6,885 browser tests
 * on `main` before deploying: a median 19.0 min on the slowest machine, inside a median 33.9 min
 * from merge to live. For 8 of the last 8 merged pull requests (#486–#493) the files `main`
 * tested were the pull request's files, byte for byte (the same git tree id), because since
 * 2026-10-25 a pull request must be up to date with `main` before it merges. A run also takes 14
 * of the account's 20 concurrent jobs (GitHub's limits page, read 27 Nov), so a `main` run beside
 * a pull request's made jobs queue: the longest wait for a machine was 18.4 min.
 *
 * WHAT COUNTS AS PROOF. All of these, read from GitHub, or the answer is `run`:
 *   1. the event is a push to `main` (a by-hand run always tests);
 *   2. exactly one merged pull request of this repository has this commit as its merge commit;
 *   3. the commit has one parent, and its tree id equals the pull request head's tree id — the
 *      files are identical;
 *   4. the head contains that parent (`behind_by` 0). A pull request's run tests the head MERGED
 *      with `main` as it was then; when the head already holds the newest `main` it holds every
 *      earlier one, so that merge was the head's own files;
 *   5. a `pull_request` run of ci.yml on that head succeeded, its job list was read whole, at
 *      least one `e2e (…)` shard ran and every one succeeded, and so did its `e2e` job;
 *   6. every one of those shards RAN its tests: its `e2e (viewer, this shard)` or
 *      `e2e (public site, this shard)` step ended `success`. Since 28 Nov 2026 a pull request of
 *      notes only ends its shards green without running a test (`browser_paths=skip`), and a
 *      green shard that tested nothing proves nothing about the files underneath it.
 *
 * WHEN IN DOUBT, `run`. An unanswered request, an odd shape or a missing token all test again:
 * a repeated run costs minutes, a skipped one that should have run ships an untested page.
 *
 * `verify`, `artwork`, `audit`, `secrets` and `lighthouse` still run on every push to `main`:
 * each ends inside the time `verify` takes (5.9 min that day; two side-by-side halves since
 * 28 Nov 2026), so skipping them would not bring a deploy forward,
 * and `audit` reads advisories that can change between two runs of the same files.
 *
 * Environment: EVENT_NAME, REF, SHA, REPOSITORY, GH_TOKEN (needs `actions: read` and
 * `pull-requests: read`). Prints `browser_tests=proven|run`; the reason goes to stderr.
 * `--verdict` reads SHARDS, CHANGES and BROWSER_TESTS and exits 1 unless the gate is met.
 */
import { fileURLToPath } from 'node:url'

const run = (reason) => ({ proven: false, reason })

/** The two steps of `e2e-shard` that run tests. scripts/ci-already-tested.test.mjs holds the names to ci.yml. */
export const TEST_STEPS = ['e2e (viewer, this shard)', 'e2e (public site, this shard)']

/**
 * Did this shard run its tests, or only end green? (See condition 6 above.)
 *
 * @param {{ steps?: { name?: string, conclusion?: string }[] }} job
 * @returns {boolean}
 */
export function ranItsTests(job) {
  return (
    Array.isArray(job?.steps) &&
    job.steps.some(
      (step) => TEST_STEPS.includes(String(step?.name)) && step.conclusion === 'success',
    )
  )
}

/**
 * @param {{ eventName?: string, ref?: string, sha?: string, repository?: string, token?: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ proven: boolean, reason: string }>}
 */
export async function alreadyTested({ eventName, ref, sha, repository, token, fetchImpl = fetch }) {
  if (eventName !== 'push' || ref !== 'refs/heads/main') return run('not a push to main')
  if (!sha || !repository || !token) return run('no commit, repository or token')
  const get = async (path) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
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
    const pulls = await get(`commits/${sha}/pulls?per_page=100`)
    if (!Array.isArray(pulls)) return run('the pull request list has an unexpected shape')
    const merged = pulls.filter(
      (pull) =>
        pull?.merged_at &&
        pull.merge_commit_sha === sha &&
        pull.base?.ref === 'main' &&
        pull.head?.repo?.full_name === repository,
    )
    if (merged.length !== 1) return run(`${merged.length} merged pull requests name this commit`)
    const [pull] = merged
    const head = pull.head.sha

    const commit = await get(`git/commits/${sha}`)
    if (!Array.isArray(commit?.parents) || commit.parents.length !== 1) {
      return run('the commit does not have exactly one parent')
    }
    const headCommit = await get(`git/commits/${head}`)
    if (!commit.tree?.sha || commit.tree.sha !== headCommit?.tree?.sha) {
      return run(`#${pull.number}: the files differ from the pull request's`)
    }
    const compared = await get(`compare/${commit.parents[0].sha}...${head}`)
    if (compared?.behind_by !== 0) {
      return run(`#${pull.number}: its head did not hold the newest main`)
    }

    const listed = await get(
      `actions/workflows/ci.yml/runs?head_sha=${head}&event=pull_request&per_page=100`,
    )
    const runs = Array.isArray(listed?.workflow_runs) ? listed.workflow_runs : []
    for (const candidate of runs) {
      if (candidate.head_sha !== head || candidate.conclusion !== 'success') continue
      const page = await get(`actions/runs/${candidate.id}/jobs?filter=latest&per_page=100`)
      const jobs = Array.isArray(page?.jobs) ? page.jobs : []
      // A list cut short could hide a failed shard; GitHub says how many there are.
      if (page?.total_count !== jobs.length) continue
      const shards = jobs.filter((job) => String(job.name).startsWith('e2e ('))
      const verdictJob = jobs.find((job) => job.name === 'e2e')
      if (shards.length === 0) continue
      if (!shards.every((job) => job.conclusion === 'success')) continue
      if (!shards.every(ranItsTests)) continue
      if (verdictJob?.conclusion !== 'success') continue
      return {
        proven: true,
        reason: `#${pull.number}: run ${candidate.id} ran and passed its tests on ${shards.length} browser-test machines, on tree ${commit.tree.sha}`,
      }
    }
    return run(`#${pull.number}: no successful pull-request run with passing browser tests`)
  } catch (error) {
    return run(`GitHub did not answer (${error instanceof Error ? error.message : 'unknown'})`)
  }
}

/**
 * The `e2e` gate's decision. A skipped shard job passes ONLY with the proof above, from a
 * `changes` job that itself succeeded: a skipped required check counts as passed on GitHub, so
 * every other way of not running fails here by name.
 *
 * @param {{ shards?: string, changes?: string, browserTests?: string }} results
 * @returns {{ ok: boolean, message: string }}
 */
export function verdict({ shards, changes, browserTests }) {
  if (shards === 'success') return { ok: true, message: 'every browser-test machine passed' }
  if (shards === 'skipped' && changes === 'success' && browserTests === 'proven') {
    return {
      ok: true,
      message: "not run again: the same files passed on the pull request (see the 'changes' job)",
    }
  }
  return {
    ok: false,
    message: `a browser-test shard did not pass (shards: ${shards || 'none'}, changes: ${changes || 'none'}, browser_tests: ${browserTests || 'none'})`,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verdict')) {
    const result = verdict({
      shards: process.env.SHARDS,
      changes: process.env.CHANGES,
      browserTests: process.env.BROWSER_TESTS,
    })
    if (result.ok) console.log(`e2e: ${result.message}`)
    else {
      console.log(
        `::error::${result.message}. The merged report is the 'playwright-report-<sha>' artifact of this run.`,
      )
      process.exit(1)
    }
  } else {
    const result = await alreadyTested({
      eventName: process.env.EVENT_NAME,
      ref: process.env.REF,
      sha: process.env.SHA,
      repository: process.env.REPOSITORY,
      token: process.env.GH_TOKEN,
    })
    console.error(`browser tests: ${result.proven ? 'proven' : 'run'} — ${result.reason}`)
    console.log(`browser_tests=${result.proven ? 'proven' : 'run'}`)
  }
}
