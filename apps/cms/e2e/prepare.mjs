/**
 * Build the CMS so `next start` has something to serve.
 *
 * Runs inside Playwright's `webServer.command`, before the readiness poll, so `.next/`
 * always exists by the time serve.mjs answers. Mirrors apps/viewer/e2e/prepare.mjs.
 *
 * ⚠️ `npx --yes pnpm@10.34.5`, NEVER A BARE `pnpm`. This is the exact shape that cost
 * two sessions: `pnpm` may not be on PATH, and on this machine it has been present,
 * absent, AND present-but-broken (a symlink into a Node cellar a later Node replaced —
 * `command -v` finds it and running it fails). A bare `pnpm` here exits 127 inside a
 * child process, and the only symptom Playwright surfaces is
 * `Timed out waiting 120000ms from config.webServer` two minutes later, with the real
 * status buried. The viewer's prepare.mjs carries the same warning for the same reason.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CMS = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(CMS, '..', '..')

const run = (label, args) => {
  process.stdout.write(`[cms-e2e] ${label}\n`)
  const result = spawnSync('npx', ['--yes', 'pnpm@10.34.5', ...args], {
    cwd: REPO,
    stdio: 'inherit',
    // ⚠️ Strip a PORT inherited from the developer's shell. `next build` does not read
    // it, but anything this shells out to might, and the failure mode is silent.
    env: { ...process.env, PORT: undefined, NODE_ENV: undefined },
  })
  if (result.status !== 0) {
    throw new Error(
      `[cms-e2e] "${label}" exited ${result.status}. ` +
        'If that status is 127 the command was not found — see the pnpm note at the ' +
        'top of this file before assuming the build is broken.',
    )
  }
}

// Skip the rebuild when a build is already present AND we are not in CI. Locally the
// suite is run repeatedly against unchanged code; in CI the checkout is always cold, so
// the guard can never mask a stale build there.
if (process.env.CI || !existsSync(join(CMS, '.next', 'BUILD_ID'))) {
  run('building the CMS', ['--filter', '@run-apparel/cms', 'build'])
} else {
  process.stdout.write('[cms-e2e] reusing the existing build (set CI=1 to force)\n')
}
