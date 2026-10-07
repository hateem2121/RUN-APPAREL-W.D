#!/usr/bin/env node
/**
 * Run this repo's gates in CI's order, stopping at the first failure.
 *
 * WHY A SCRIPT RATHER THAN A LIST IN PROSE. The order is not decorative and three of
 * the gates are invisible from the workspace, which is why "it passed locally" has
 * failed here twice:
 *
 *   - `apps/shrink/container` is not a pnpm member, so `pnpm -r` skips it entirely
 *     and it gets its own `npm install && npx tsc --noEmit` step in CI.
 *   - `eval:artwork` runs in a job of its own.
 *   - `check-bundle-budget` reads `apps/viewer/dist`, so it exits 1 unless `build`
 *     has already run — which is why it sits AFTER build below, not with the other
 *     node scripts.
 *
 * Reconstructing that from CLAUDE.md costs minutes and gets the order wrong
 * occasionally; this cannot.
 *
 * `pnpm` IS NOT ON PATH RELIABLY HERE. Every pnpm gate below uses the npx form. A
 * bare `pnpm` exits 127, and a child process that shells out to one (as
 * `apps/viewer/e2e/prepare.mjs` did until 2026-09-29) surfaces that 127 as a two-minute
 * Playwright timeout naming nothing at all. Do not "simplify" these commands.
 *
 * Usage:
 *   node .claude/skills/gates/run-gates.mjs              # everything, in order
 *   node .claude/skills/gates/run-gates.mjs --from build # resume from a gate
 *   node .claude/skills/gates/run-gates.mjs --list       # names only, run nothing
 */
import { spawnSync } from 'node:child_process'

const PNPM = ['npx', '--yes', 'pnpm@12.6.0']

/**
 * In CI's order. `cwd` is repo-relative.
 */
const GATES = [
  {
    name: 'install',
    why: 'the lockfile moves often here; run after every merge',
    argv: [...PNPM, 'install', '--frozen-lockfile'],
  },
  { name: 'lint', why: 'biome check . — the cheapest gate to fail on', argv: [...PNPM, 'lint'] },
  { name: 'typecheck', why: '5 workspaces', argv: [...PNPM, 'typecheck'] },
  {
    name: 'test',
    why: 'full suite plus the MEASURED coverage floors — never lower one to go green',
    argv: [...PNPM, 'test:coverage'],
  },
  {
    name: 'alert-shell',
    why: 'the alert branch nothing else exercises',
    argv: ['bash', 'scripts/test-alert-shell.sh'],
  },
  {
    // Missing from this list until 2026-09-30, though CI's `verify` job runs it right here:
    // the runner said "All gates passed" without it. apps/cms/src/gateRunnerParity.test.ts
    // now fails when CI's gate jobs run a node check this list does not.
    name: 'docs-index',
    why: 'every maintained document reachable from docs/README.md; reads git ls-files, no build',
    argv: ['node', 'scripts/check-docs-index.mjs'],
  },
  {
    name: 'container-install',
    why: 'NOT a pnpm member — pnpm -r skips it, and npm ci is where a desynced second lockfile bites',
    // `ci`, as CI and the Dockerfile do: exactly the lockfile, never a fresh resolve.
    argv: ['npm', 'ci', '--no-audit', '--no-fund'],
    cwd: 'apps/shrink/container',
  },
  {
    name: 'container-typecheck',
    why: 'its own CI step; invisible to every workspace command',
    argv: ['npx', 'tsc', '--noEmit'],
    cwd: 'apps/shrink/container',
  },
  { name: 'seed', why: 'fixtures the build needs', argv: [...PNPM, 'seed:assets'] },
  {
    name: 'build',
    why: 'the gate that catches dependency breaks typecheck does not',
    argv: [...PNPM, 'build'],
  },
  {
    name: 'bundle-budget',
    why: 'reads apps/viewer/dist — MUST run after build or it exits 1 for the wrong reason',
    argv: ['node', 'scripts/check-bundle-budget.mjs'],
  },
  {
    // The CMS Worker from the `build` above (2026-10-07): at 99% of Cloudflare's limit it
    // broke the live site under load, and nothing had measured it before a deploy.
    // Its own full build: `--skipNextBuild` needs Next's standalone output, which a plain
    // `next build` does not write.
    name: 'cms-worker-build',
    why: 'builds the CMS Worker as the deploy does (~3 min), as CI verify does',
    argv: [...PNPM, '--filter', '@run-apparel/cms', 'exec', 'opennextjs-cloudflare', 'build'],
  },
  {
    name: 'cms-worker-size',
    why: 'fails over 80% of the 64 MiB limit — needs cms-worker-build',
    argv: ['node', 'scripts/check-cms-worker-size.mjs'],
  },
  {
    name: 'eval-artwork',
    why: 'separate CI job — gates the deploy',
    argv: [...PNPM, 'eval:artwork'],
  },
  {
    // CI runs it FIRST in the e2e job, so a red browser test cannot hide it; here too.
    // Needs Chromium (the same one e2e uses). Missing until 2026-09-30, like docs-index.
    name: 'doc-visuals',
    why: 'every picture in the docs described, every diagram draws — needs Chromium',
    argv: ['node', 'apps/cms/scripts/check-doc-visuals.mjs'],
  },
  {
    name: 'e2e',
    why: 'separate CI job — ALSO gates the deploy. Slowest in CI (5 machines), ~45s locally',
    argv: [...PNPM, '--filter', '@run-apparel/viewer', 'test:e2e'],
  },
]

/**
 * The .claude/ guard tests. Separate from GATES because .claude/ is not a workspace
 * package, so vitest never sees them, and because each is its own entry point rather
 * than a suite. CI runs them too since 2026-09-29 (`verify` → "Hook guard tests").
 */
const HOOK_TESTS = [
  'guard-bare-pnpm',
  'guard-pipeline-input',
  'guard-main-branch',
  'log-instructions-loaded',
  'explain-failure',
  'recall-nested-instructions',
  'format-edited-file',
  'check-doc-citations',
]

const args = process.argv.slice(2)
if (args.includes('--list')) {
  for (const g of GATES) console.log(`  ${g.name.padEnd(20)} ${g.why}`)
  console.log(`  ${'hooks'.padEnd(20)} the .claude/ guards (also CI's verify since 2026-09-29)`)
  process.exit(0)
}

const fromIndex = args.indexOf('--from')
const from = fromIndex === -1 ? null : args[fromIndex + 1]
let started = from === null
const startedAt = process.hrtime.bigint()
const results = []

/** Run one gate. Returns true on success. */
function runGate(name, argv, cwd, why) {
  console.log(`\n=== ${name} === ${why}`)
  console.log(`$ ${argv.join(' ')}${cwd ? `   (in ${cwd})` : ''}`)
  const began = process.hrtime.bigint()
  const run = spawnSync(argv[0], argv.slice(1), { cwd, stdio: 'inherit', env: process.env })
  const seconds = Number(process.hrtime.bigint() - began) / 1e9
  results.push({ name, status: run.status === 0 ? 'pass' : 'FAIL', seconds })
  return run.status === 0
}

function summarise() {
  for (const r of results) {
    const time = r.seconds === undefined ? '' : ` (${r.seconds.toFixed(1)}s)`
    console.log(`  ${r.status.padEnd(7)} ${r.name}${time}`)
  }
}

for (const gate of GATES) {
  if (!started) {
    if (gate.name === from) started = true
    else {
      results.push({ name: gate.name, status: 'skipped' })
      continue
    }
  }
  if (runGate(gate.name, gate.argv, gate.cwd, gate.why)) continue

  console.log(`\n${gate.name} FAILED.`)
  summarise()
  const remaining = GATES.slice(GATES.indexOf(gate) + 1).map((g) => g.name)
  if (remaining.length > 0) {
    console.log(`\nNot run: ${remaining.join(', ')}`)
    console.log(`Resume with: node .claude/skills/gates/run-gates.mjs --from ${gate.name}`)
  }
  process.exit(1)
}

let hooksOk = true
console.log('\n=== hooks === the .claude/ guards (CI runs them in verify too).')
for (const test of HOOK_TESTS) {
  const run = spawnSync('node', [`.claude/hooks/${test}.test.mjs`], {
    stdio: 'inherit',
    env: process.env,
  })
  if (run.status !== 0) hooksOk = false
}
results.push({ name: 'hooks', status: hooksOk ? 'pass' : 'FAIL' })

if (!hooksOk) {
  console.log('\nhooks FAILED.')
  summarise()
  process.exit(1)
}

console.log('\nAll gates passed.')
summarise()
console.log(`\nTotal ${(Number(process.hrtime.bigint() - startedAt) / 1e9).toFixed(1)}s.`)
