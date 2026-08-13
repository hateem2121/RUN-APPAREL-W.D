#!/usr/bin/env node
/**
 * Keep `tools/asset-pipeline/package.json` and its npm `package-lock.json` in sync.
 *
 * THE FAILURE THIS CATCHES, AND WHY NOTHING ELSE DOES. That directory carries TWO
 * lockfiles. `pnpm-lock.yaml` is the workspace's; `package-lock.json` is npm's and is
 * read by exactly one thing — `apps/shrink/Dockerfile`, via `npm ci`. No workspace
 * tooling maintains it, so bumping a dependency in the workspace desynchronises it
 * silently.
 *
 * Measured 2026-08-12 (dependency refresh `9c22a2a`): five packages drifted and the
 * image build died on *"can only install packages when your package.json and
 * package-lock.json are in sync"*. Note WHERE it did not surface — `lint`,
 * `typecheck` 5/5, 621 tests, `build`, and the container's own `tsc --noEmit` were
 * ALL GREEN, because none of them run `npm ci`. The only thing that executes that
 * path is the Docker build triggered by a push to `main`. It cost a deploy.
 *
 * So this is deliberately a check that runs in `pnpm test`, seconds after the change,
 * rather than a comment asking the next person to remember. It reproduces `npm ci`'s
 * own sync rule without needing npm, a network, or the 200 MB of node_modules the
 * real command would install.
 *
 * ⚠️ It compares DECLARED RANGES against the lockfile's root entry, which is exactly
 * what `npm ci` compares. It does NOT verify the resolved tree, so it cannot catch a
 * hand-edited transitive. Regenerate rather than hand-edit — the procedure is in
 * tools/asset-pipeline/CLAUDE.md.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')

/** Every package.json in this repo that is shadowed by a hand-maintained npm lockfile. */
export const NPM_LOCKED = [
  {
    name: 'tools/asset-pipeline',
    packageJson: 'tools/asset-pipeline/package.json',
    lockfile: 'tools/asset-pipeline/package-lock.json',
    consumer: 'apps/shrink/Dockerfile (npm ci)',
  },
]

/**
 * Compare one package.json's declared dependencies against its npm lockfile's root
 * entry — the same comparison `npm ci` makes before it refuses to install.
 *
 * Pure: takes parsed objects, returns problems. No fs, no process.
 *
 * @param {{name: string, consumer: string}} target
 * @param {Record<string, unknown> | null} pkg
 * @param {Record<string, unknown> | null} lock
 * @returns {string[]}
 */
export function compare(target, pkg, lock) {
  if (!pkg) return [`${target.name}: package.json is missing or unparseable.`]
  if (!lock) {
    return [
      `${target.name}: package-lock.json is missing or unparseable — ${target.consumer} ` +
        `will fail. Regenerate it per tools/asset-pipeline/CLAUDE.md.`,
    ]
  }

  const problems = []
  const root = /** @type {Record<string, Record<string, string>> | undefined} */ (
    /** @type {Record<string, unknown>} */ (lock.packages)?.['']
  )
  if (!root) {
    return [`${target.name}: lockfile has no root ("") entry — it is not an npm v2+ lockfile.`]
  }

  for (const kind of ['dependencies', 'devDependencies']) {
    const declared = /** @type {Record<string, string>} */ (pkg[kind] ?? {})
    const locked = /** @type {Record<string, string>} */ (root[kind] ?? {})

    for (const [dep, range] of Object.entries(declared)) {
      if (!(dep in locked)) {
        problems.push(`${target.name}: ${kind}.${dep} is in package.json but not in the lockfile.`)
      } else if (locked[dep] !== range) {
        problems.push(
          `${target.name}: ${kind}.${dep} is "${range}" in package.json but "${locked[dep]}" in the lockfile.`,
        )
      }
    }
    for (const dep of Object.keys(locked)) {
      if (!(dep in declared)) {
        problems.push(`${target.name}: ${kind}.${dep} is in the lockfile but not in package.json.`)
      }
    }
  }

  /**
   * The other half of the documented procedure, and the reason it says "regenerate in
   * a temp dir, NEVER in the workspace": pnpm's symlinked node_modules makes npm write
   * `"resolved": "file:…"` paths that do not exist inside the image. The build fails
   * there rather than here, with a message about a missing tarball.
   */
  const raw = JSON.stringify(lock)
  if (raw.includes('"resolved":"file:') || raw.includes('"resolved": "file:')) {
    problems.push(
      `${target.name}: lockfile contains "file:" resolved paths — it was regenerated inside ` +
        `the pnpm workspace. Redo it in a temp dir (tools/asset-pipeline/CLAUDE.md).`,
    )
  }

  return problems
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function check(root = REPO_ROOT, targets = NPM_LOCKED) {
  return targets.flatMap((target) =>
    compare(
      target,
      readJson(join(root, target.packageJson)),
      readJson(join(root, target.lockfile)),
    ),
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const problems = check()
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`)
    console.error(
      '\nThe npm lockfile no longer matches its package.json. Nothing else in this repo\n' +
        'runs `npm ci`, so this would next surface as a FAILED CONTAINER BUILD on main.\n' +
        'Regenerate (temp dir, never in the workspace):\n\n' +
        '  cd $(mktemp -d) && cp <repo>/tools/asset-pipeline/package.json . \\\n' +
        '    && npm install --package-lock-only\n',
    )
    process.exit(1)
  }
  console.log(`npm lockfiles in sync (${NPM_LOCKED.length} checked).`)
}
