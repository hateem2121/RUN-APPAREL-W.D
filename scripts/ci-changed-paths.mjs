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
 *
 * WHEN IN DOUBT, `true`. A by-hand run, a first push, or a base commit this checkout
 * cannot see all answer `true`: an unneeded image build costs minutes, a skipped one
 * ships nothing and says nothing.
 *
 * Environment: EVENT_NAME, BEFORE (push), BASE_SHA (pull_request). Prints `shrink=…`.
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
    file === '.github/workflows/ci.yml'
  )
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
}
