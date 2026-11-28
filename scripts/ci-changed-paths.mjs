#!/usr/bin/env node
/**
 * Did this push or pull request change anything the shrink service is built from?
 *
 * ci.yml's `changes` job runs this and hands `shrink=true|false` to the jobs that only
 * matter for the shrink Worker + Container: `shrink-image-audit` (on pull requests too)
 * and `deploy-shrink` (on `main`). It replaced deploy-shrink.yml's `on.push.paths` filter
 * on 2026-09-29, when that workflow's deploy moved into ci.yml so the gates it needs are
 * the SAME jobs rather than a second copy of them.
 *
 * WHY A SCRIPT AND NOT `paths:` OR A PATH-FILTER ACTION. A workflow-level `paths:` cannot
 * apply to one job, and a skipped required check counts as passed. A third-party action
 * would be one more thing holding a token; `git diff` is already on the runner.
 *
 * WHY THE LIST IS WHAT IT IS. The old filter named only apps/shrink and
 * tools/asset-pipeline, and missed `packages/shared` — which apps/shrink/src imports
 * (`GLB_HARD_MAX_BYTES`, `SHRINK_DETAIL_LEVELS`) and wrangler bundles — so a change to a
 * shared limit reached the CMS and viewer while the live shrink kept the old value.
 * Markdown under tools/asset-pipeline/ is excluded because c0a6728 (2026-08-12) built and
 * pushed a Docker image for a docs-only commit. ci.yml itself counts because the deploy
 * steps live there now, as the old filter counted deploy-shrink.yml.
 * `.trivyignore` counts because `shrink-image-audit` reads its waivers (added 2026-10-20,
 * owner decision): PR #207 renewed the base image's perl waivers and CI skipped the scan
 * that reads them, so a waiver edit was never tested and a lapsed one stayed invisible
 * until the next shrink change stopped `deploy-shrink`.
 *
 * WHEN IN DOUBT, `true`. A by-hand run, a first push, or a base commit this checkout
 * cannot see all answer `true`: an unneeded image build costs minutes, a skipped one
 * ships nothing and says nothing.
 *
 * `site=…` (2026-10-26, owner yes) says whether `deploy` has anything to ship. Every deploy
 * makes a new CMS Worker version, and the shared page store keys its copies by version, so
 * each one empties the store in every region and the next buyer waits while the page is
 * drawn: 739 ms of processor time per home-page drawing (median, 25-26 Oct), people's home
 * p90 2,244 ms. Main took 54 pushes in the 7½ days to 26 Oct, up to 13 a day, and a docs
 * commit (#265) emptied the store 26 minutes after #264 had filled it.
 * Two choices keep it on the side of deploying:
 * - The list names what can NEVER reach a Worker; anything else counts. No Worker build
 *   reads Markdown or `docs/` (checked 26 Oct), tests and e2e specs are never bundled, and
 *   `.github/` is CI configuration, except ci.yml, whose deploy steps a change should
 *   prove on a real deploy. Everything the shrink counts, the site counts too, because
 *   `deploy-shrink` needs `deploy` and a skipped need skips the job that needs it.
 * - It diffs against the LAST COMMIT THAT DEPLOYED, read from GitHub's records for the
 *   `production` environment, not against the previous push. Otherwise a code push whose
 *   deploy failed, followed by a docs push, would skip and leave the code undeployed. A
 *   skipped `deploy` job leaves no record (no pull request's run ever made one: all 40
 *   records read on 26 Oct were `main`), so the base stays at the last real deploy.
 *   Only a push to `main` can skip: a by-hand run always deploys.
 *
 * Environment: EVENT_NAME, BEFORE (push), BASE_SHA (pull_request), and for the site answer
 * REF, REPOSITORY and GH_TOKEN (needs `deployments: read`). Prints `shrink=…`, `site=…` and
 * `browser_paths=run|skip` (see `touchesBrowserTests`).
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * @param {string} file a repo-relative path from `git diff --name-only`
 * @returns {boolean}
 */
export function touchesShrink(file) {
  if (file.startsWith('tools/asset-pipeline/')) return !file.endsWith('.md')
  return (
    file.startsWith('apps/shrink/') ||
    file.startsWith('packages/shared/') ||
    file === 'pnpm-lock.yaml' ||
    file === 'pnpm-workspace.yaml' ||
    file === '.github/workflows/ci.yml' ||
    file === '.trivyignore'
  )
}

/**
 * Folders no Worker is built from. `.github/workflows/ci.yml` is the one exception.
 * `ci-installs/` holds the lockfiles two scheduled workflows install their own command-line tools
 * from (voiceover.yml, android-chrome.yml). It sat under `.github/` until 25 Nov 2026 and moved
 * because Dependabot may not change npm files there (.github/dependabot.yml has the run); it is
 * listed so that the move does not turn its weekly update into a deploy of the site.
 */
const NOT_SHIPPED_FOLDERS = ['docs/', '.claude/', '.agents/', '.github/', 'ci-installs/']

/**
 * Files at the repo root that no Worker is built from. `skills-lock.json` records the
 * fingerprints of the vendored agent skills; only `scripts/refresh-vendored-skills.mjs`,
 * `refresh-skills.yml` and tests read it (checked 5 Nov 2026). It is not in a skipped folder, so
 * the robot's weekly skills PR #309 counted as shipping, ran a full deploy and emptied the page
 * store in every region for 20 files of skill text. Named by exact path on purpose: a file of
 * the same name anywhere else is still code.
 */
/**
 * And two measuring scripts. `scripts/perf-probe.mjs` and `scripts/first-visit-burst.mjs` are run
 * only by perf-watch.yml, against the live site; no Worker build, no deploy step and no other
 * script imports either (checked 23 Nov 2026). On that day #459 changed one number in
 * perf-probe.mjs and its test, and the merge ran a full deploy that emptied the page store in
 * every region. Named by exact path, like the file above: any other script still counts, because
 * most of scripts/ is run BY the deploy job and a change to one should be proven on a real deploy.
 */
const NOT_SHIPPED_FILES = [
  'skills-lock.json',
  'scripts/perf-probe.mjs',
  'scripts/first-visit-burst.mjs',
]

/**
 * @param {string} file a repo-relative path from `git diff --name-only`
 * @returns {boolean} false only for a file that can never change a deployed Worker
 */
export function touchesSite(file) {
  if (file === '.github/workflows/ci.yml') return true
  if (NOT_SHIPPED_FOLDERS.some((folder) => file.startsWith(folder))) return false
  if (NOT_SHIPPED_FILES.includes(file)) return false
  if (file.endsWith('.md')) return false
  if (/\.test\.[cm]?[jt]sx?$/.test(file)) return false
  if (/(^|\/)e2e\//.test(file)) return false
  return true
}

/**
 * Can this file change what a browser test sees? (28 Nov 2026, owner's yes.)
 *
 * `e2e-shard` skips its test steps, on every machine, only when NO changed file can: `changes`
 * hands it `browser_paths=skip` and each machine says so in its log and ends green in about a
 * minute. Measured before it was built: 12% of the last 119 merged pull requests changed nothing
 * a browser test reads, and each of them ran all 6,885 tests.
 *
 * NARROWER THAN `touchesSite`, ON PURPOSE. A test file or an `e2e/` file never reaches a Worker,
 * but it IS the browser tests, so both count here. Only the folders and files that no build, no
 * test server and no spec reads are left out: the same lists as above, and Markdown. Checked the
 * day it was added: no spec, Playwright config or app source opens a file under `docs/`,
 * `.claude/`, `.agents/`, `.github/` or a `.md` file. The picture-and-diagram check that reads
 * `docs/` is its own step on one machine and is never skipped.
 *
 * NOT BY SUITE. Skipping only the viewer's machines for a website change (or the reverse) was
 * looked at and left out: 25 of the website's 84 specs name the viewer's files and 20 of the
 * viewer's 60 name the website's (`grep -rlE` for each app's folder and port over the other's
 * `e2e/`, 28 Nov 2026), and some read them: `liveGarment.spec.ts` serves a file out of
 * `apps/viewer/public`, `siteFooter.spec.ts` reads `apps/cms/public/standards`.
 *
 * @param {string} file a repo-relative path from `git diff --name-only`
 * @returns {boolean} false only for a file no browser test can read
 */
export function touchesBrowserTests(file) {
  if (file === '.github/workflows/ci.yml') return true
  if (NOT_SHIPPED_FOLDERS.some((folder) => file.startsWith(folder))) return false
  if (NOT_SHIPPED_FILES.includes(file)) return false
  if (file.endsWith('.md')) return false
  return true
}

/**
 * WHEN IN DOUBT, `true` (run the tests): no base to diff against, or a base git cannot see.
 *
 * @param {{ eventName?: string, before?: string, baseSha?: string }} event
 * @param {(base: string) => string[] | null} changedSince
 * @returns {boolean}
 */
export function browserTestsChanged(event, changedSince) {
  const base = baseFor(event)
  if (base === null) return true
  const files = changedSince(base)
  if (files === null) return true
  // An empty list is not "nothing can reach them": it is a diff that found nothing, so test.
  if (files.length === 0) return true
  return files.some(touchesBrowserTests)
}

/**
 * The answer `changes` hands to `e2e-shard`.
 *
 * ⚠️ ON `main` A NOTES-ONLY PUSH SKIPS ONLY WHEN NOTHING IS WAITING TO DEPLOY. Found by the
 * reviewer before this was ever pushed (28 Nov 2026): a code commit lands on `main`, its
 * browser tests fail there and the deploy is stopped; a notes-only push follows. Judged by its
 * own files that push would skip the tests, `e2e` would pass, and `deploy` would run, because
 * `site` is measured from the last commit that DEPLOYED and still holds the failed code. So on
 * a push to `main` the tests run whenever `site` is true. A pull request is judged by its own
 * files alone: it deploys nothing, and `main`'s own run decides afterwards.
 *
 * @param {{ onMainPush: boolean, site: boolean, changed: boolean }} facts `changed` is
 *   `browserTestsChanged`'s answer, `site` is `siteChanged`'s
 * @returns {'run' | 'skip'}
 */
export function browserPaths({ onMainPush, site, changed }) {
  if (changed) return 'run'
  if (onMainPush && site) return 'run'
  return 'skip'
}

/**
 * The commit of the newest `production` deploy whose latest status is `success`.
 * GitHub does not document the order of either list, so both are sorted here.
 *
 * @param {{ sha: string, created_at: string, statuses: { state: string, created_at: string }[] }[]} deployments
 * @returns {string | null}
 */
export function latestSuccessfulSha(deployments) {
  const newestFirst = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  for (const deployment of [...deployments].sort(newestFirst)) {
    const [latest] = [...deployment.statuses].sort(newestFirst)
    if (latest?.state === 'success') return deployment.sha
  }
  return null
}

/**
 * Reads GitHub's deploy records. Any failure answers null, which deploys.
 *
 * @param {{ repository?: string, token?: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<string | null>}
 */
export async function lastDeployedSha({ repository, token, fetchImpl = fetch }) {
  if (!repository || !token) return null
  const get = async (path) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
  try {
    const list = await get('deployments?environment=production&per_page=30')
    if (!Array.isArray(list)) return null
    const deployments = await Promise.all(
      list.map(async (d) => ({
        sha: d.sha,
        created_at: d.created_at,
        statuses: await get(`deployments/${d.id}/statuses?per_page=100`),
      })),
    )
    return latestSuccessfulSha(deployments)
  } catch {
    return null
  }
}

/**
 * @param {{ eventName?: string, ref?: string }} event
 * @param {string | null} deployedSha the last commit that deployed, or null
 * @param {(base: string) => string[] | null} changedSince
 * @returns {boolean}
 */
export function siteChanged({ eventName, ref }, deployedSha, changedSince) {
  if (eventName !== 'push' || ref !== 'refs/heads/main') return true
  if (!deployedSha) return true
  const files = changedSince(deployedSha)
  if (files === null) return true
  return files.some(touchesSite)
}

/**
 * The commit to diff against, or null when there is no trustworthy one.
 *
 * @param {{ eventName?: string, before?: string, baseSha?: string }} event
 * @returns {string | null}
 */
export function baseFor({ eventName, before, baseSha }) {
  if (eventName === 'pull_request') return baseSha || null
  if (eventName === 'push') {
    // GitHub sends forty zeros for a branch's first push.
    if (!before || /^0+$/.test(before)) return null
    return before
  }
  return null // workflow_dispatch, schedule, anything else: rebuild
}

/**
 * @param {{ eventName?: string, before?: string, baseSha?: string }} event
 * @param {(base: string) => string[] | null} changedSince files changed since `base`,
 *   or null when git cannot answer (the base commit is not in this checkout)
 * @returns {boolean}
 */
export function shrinkChanged(event, changedSince) {
  const base = baseFor(event)
  if (base === null) return true
  const files = changedSince(base)
  if (files === null) return true
  return files.some(touchesShrink)
}

function gitChangedSince(base) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return null
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = {
    eventName: process.env.EVENT_NAME,
    before: process.env.BEFORE,
    baseSha: process.env.BASE_SHA,
  }
  const base = baseFor(event)
  const files = base === null ? null : gitChangedSince(base)
  const shrink = shrinkChanged(event, () => files)
  console.error(
    `event=${event.eventName ?? '?'} base=${base ?? 'none'} changed=${files === null ? 'unknown' : files.length} → shrink=${shrink}`,
  )
  console.log(`shrink=${shrink}`)

  const ref = process.env.REF
  const onMainPush = event.eventName === 'push' && ref === 'refs/heads/main'
  const deployed = onMainPush
    ? await lastDeployedSha({ repository: process.env.REPOSITORY, token: process.env.GH_TOKEN })
    : null
  let siteFiles = null
  const site = siteChanged({ eventName: event.eventName, ref }, deployed, (sha) => {
    siteFiles = gitChangedSince(sha)
    return siteFiles
  })
  console.error(
    `last deployed=${deployed ?? 'none'} changed since=${siteFiles === null ? 'unknown' : siteFiles.length} → site=${site}`,
  )
  console.log(`site=${site}`)

  const changed = browserTestsChanged(event, () => files)
  const answer = browserPaths({ onMainPush, site, changed })
  console.error(
    `browser tests: ${answer} (a changed file can reach them: ${changed}; push to main with something to deploy: ${onMainPush && site})`,
  )
  console.log(`browser_paths=${answer}`)
}
