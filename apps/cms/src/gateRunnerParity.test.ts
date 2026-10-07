import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `.claude/skills/gates/run-gates.mjs` says it runs "this repo's gates in CI's order". On
 * 2026-09-30 it printed "All gates passed" while never running two checks CI does run:
 * `scripts/check-docs-index.mjs` (the `verify` job) and `apps/cms/scripts/check-doc-visuals.mjs`
 * (the `e2e-shard` job). Nothing compared the two lists, so a check added to CI simply never
 * reached the runner. This does.
 *
 * The runner is read as TEXT and asked for `--list`, never imported: importing it would run
 * every gate. Only the two jobs the runner mirrors are compared — `deploy`, `audit`,
 * `lighthouse` and `changes` run probes and tooling, not gates.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const RUNNER = join(REPO_ROOT, '.claude', 'skills', 'gates', 'run-gates.mjs')
const GATE_JOBS = ['verify', 'e2e-shard']

/** Every `node <path>.mjs` a job runs, in file order, with the job's name. */
function nodeChecksByJob(ciYaml: string): Array<{ job: string; script: string }> {
  const found: Array<{ job: string; script: string }> = []
  let job = ''
  for (const line of ciYaml.split('\n')) {
    const header = /^ {2}([a-z][\w-]*):\s*$/.exec(line)
    if (header?.[1]) job = header[1]
    const run = /\bnode\s+(\S+\.mjs)\b/.exec(line)
    if (run?.[1] && !line.trimStart().startsWith('#')) found.push({ job, script: run[1] })
  }
  return found
}

/** The gate names in the order the runner runs them. */
function runnerOrder(): string[] {
  const listed = spawnSync('node', [RUNNER, '--list'], { encoding: 'utf8' })
  expect(listed.status).toBe(0)
  return listed.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name): name is string => Boolean(name))
}

describe('the local gate runner and CI', () => {
  const ciYaml = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  const runner = readFileSync(RUNNER, 'utf8')
  const gateChecks = nodeChecksByJob(ciYaml).filter((entry) => GATE_JOBS.includes(entry.job))

  it('finds the node checks it is meant to compare — negative control for the parser', () => {
    // Measured 2026-09-30: CI's two gate jobs ran exactly these three; the CMS Worker's size
    // joined `verify` on 2026-10-07.
    expect(gateChecks.map((entry) => entry.script).sort()).toEqual(
      [
        'apps/cms/scripts/check-doc-visuals.mjs',
        'scripts/check-bundle-budget.mjs',
        'scripts/check-cms-worker-size.mjs',
        'scripts/check-docs-index.mjs',
      ].sort(),
    )
    // A commented-out command is not a step.
    expect(nodeChecksByJob('  verify:\n      # run: node scripts/x.mjs\n')).toEqual([])
  })

  it('runs every node check CI runs in its gate jobs', () => {
    const missing = gateChecks.filter((entry) => !runner.includes(`'${entry.script}'`))
    expect(missing).toEqual([])
  })

  it('runs the docs index before the build, and the doc pictures just before e2e, as CI does', () => {
    const order = runnerOrder()
    expect(order.indexOf('docs-index')).toBeGreaterThan(order.indexOf('alert-shell'))
    expect(order.indexOf('docs-index')).toBeLessThan(order.indexOf('build'))
    expect(order.indexOf('doc-visuals')).toBe(order.indexOf('e2e') - 1)
  })
})
