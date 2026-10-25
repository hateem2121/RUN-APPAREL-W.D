import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `.claude/skills/gates/run-gates.mjs` says it runs "this repo's gates in CI's order". On
 * 2026-09-30 it printed "All gates passed" while never running two checks CI does run:
 * `scripts/check-docs-index.mjs` (the `verify` job) and `apps/cms/scripts/check-doc-visuals.mjs`
 * (the `e2e-shard` job). Nothing compared the two lists, so a check added to CI simply never
 * reached the runner. This does.
 *
 * WIDENED 2026-10-25. The first version compared only `node <x>.mjs` lines, so seven gates
 * (knip, actionlint, zizmor, the three post-build guards `test:preload`, `test:routes`,
 * `test:built-config`, and the hook-test loop) and the CMS browser tests were in CI and not in the
 * runner, and every pnpm, bash and npm line could have been dropped from the runner unseen. Now
 * EVERY gate command in the two jobs it mirrors is compared: each must be a runner gate, an
 * explained alias of one, or a named exception the runner prints as "not run".
 *
 * The runner is asked for `--commands`, never imported: importing it would run every gate. Only
 * `verify` and `e2e-shard` are compared — `deploy`, `audit`, `lighthouse` and `changes` run
 * probes and tooling, not gates.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const RUNNER = join(REPO_ROOT, '.claude', 'skills', 'gates', 'run-gates.mjs')
const GATE_JOBS = ['verify', 'e2e-shard']
const PNPM = 'npx --yes pnpm@12.6.0'

type Step = { job: string; name: string; commands: string[] }
type Runner = {
  gates: Map<string, string>
  hooks: string[]
  notRun: string[]
}

/** The `.github/workflows/ci.yml` steps of every job, with the commands each one runs. */
function ciSteps(ciYaml: string): Step[] {
  const jobs = new Map<string, string[]>()
  let job = ''
  for (const line of ciYaml.split('\n')) {
    const header = /^ {2}([a-z][\w-]*):\s*$/.exec(line)
    if (header?.[1]) {
      job = header[1]
      jobs.set(job, [])
    }
    jobs.get(job)?.push(line)
  }
  const steps: Step[] = []
  for (const [jobName, lines] of jobs) {
    const blocks: string[][] = []
    for (const line of lines) {
      if (/^ {6}- /.test(line)) blocks.push([])
      blocks.at(-1)?.push(line)
    }
    for (const block of blocks) {
      const runAt = block.findIndex((l) => /^\s*(?:- )?run:/.test(l))
      if (runAt === -1) continue
      const runLine = block[runAt] as string
      const column = runLine.indexOf('run:')
      const first = runLine.slice(column + 4).trim()
      const body: string[] = []
      if (/^[|>][+-]?$/.test(first)) {
        for (const l of block.slice(runAt + 1)) {
          if (l.trim() !== '' && l.length - l.trimStart().length <= column) break
          body.push(l.trim())
        }
      } else if (first) {
        body.push(first)
      }
      const name = block.map((l) => /^\s*(?:- )?name:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean) ?? ''
      const commands = body
        .filter((l) => l !== '' && !l.startsWith('#'))
        .flatMap((l) => l.split(/\s&&\s/))
        .map((part) => part.trim())
        .filter((part) => /^(pnpm|npm|npx|node|bash)\s/.test(part))
        .map((part) => part.replace(/^pnpm(\s)/, `${PNPM}$1`))
      steps.push({ job: jobName, name, commands })
    }
  }
  return steps
}

/** What the runner lists: `--commands` prints `gate|hook|not-run <TAB> name <TAB> text`. */
function readRunner(): Runner {
  const listed = spawnSync('node', [RUNNER, '--commands'], { encoding: 'utf8' })
  expect(listed.status).toBe(0)
  const runner: Runner = { gates: new Map(), hooks: [], notRun: [] }
  for (const line of listed.stdout.split('\n').filter(Boolean)) {
    const [kind, name, text] = line.split('\t') as [string, string, string]
    if (kind === 'gate') runner.gates.set(name, text)
    else if (kind === 'hook') runner.hooks.push(name)
    else if (kind === 'not-run') runner.notRun.push(name)
  }
  return runner
}

/**
 * CI commands that are not a runner gate under their own text, and where each one lives instead.
 * `gate` = a runner gate that is the same check in another spelling; `notRun` = a name the runner
 * prints under "not run"; `hooks` = the hook-test loop, compared file by file below.
 */
const CI_ALIASES: Record<string, { gate?: string; notRun?: string; hooks?: true }> = {
  // CI runs the viewer suite sharded; the runner runs it whole.
  [`${PNPM} --filter @run-apparel/viewer exec playwright test "\${args[@]}"`]: { gate: 'e2e' },
  // CI keeps the contact sheets as a build artifact; the runner does not.
  [`${PNPM} eval:artwork -- --keep "$RUNNER_TEMP/artwork-eval"`]: { gate: 'eval-artwork' },
  // The website's browser suite and its throwaway database.
  [`${PNPM} --filter @run-apparel/cms migrate`]: { notRun: 'cms-e2e' },
  [`${PNPM} seed:cms`]: { notRun: 'cms-e2e' },
  [`${PNPM} --filter @run-apparel/cms exec playwright test "\${args[@]}"`]: { notRun: 'cms-e2e' },
  'node "$t"': { hooks: true },
}

/**
 * CI steps with no command the parser knows: a tool the step downloads, or a diagnostic. Keyed by
 * the step's `name:`. `gate` and `notRun` mean the same as above; `diagnostic` is a step that
 * checks nothing about the repository.
 */
const NAMED_STEPS: Record<string, { gate?: string; notRun?: string; diagnostic?: true }> = {
  actionlint: { gate: 'actionlint' },
  'zizmor (workflow security)': { gate: 'zizmor' },
  'Runner image has the tools the workflows rely on': { notRun: 'runner-tools' },
  'Container facts (user, HOME, browsers)': { diagnostic: true },
}

/** Everything in the CI gate jobs that the runner neither runs nor explains. Empty when in step. */
function unaccounted(ciYaml: string, runner: Runner): string[] {
  const problems: string[] = []
  const runnerCommands = new Set(runner.gates.values())
  for (const step of ciSteps(ciYaml).filter((s) => GATE_JOBS.includes(s.job))) {
    const label = `${step.job}: ${step.name || '(unnamed)'}`
    if (step.commands.length === 0) {
      const named = NAMED_STEPS[step.name]
      if (!named) problems.push(`${label} — a step with no command the parser knows`)
      else if (named.gate && !runner.gates.has(named.gate))
        problems.push(`${label} — the runner has no "${named.gate}" gate`)
      else if (named.notRun && !runner.notRun.includes(named.notRun))
        problems.push(`${label} — the runner does not list "${named.notRun}" as not run`)
      continue
    }
    for (const command of step.commands) {
      const alias = CI_ALIASES[command]
      if (runnerCommands.has(command)) continue
      if (!alias) problems.push(`${label} — CI runs \`${command}\` and the runner does not`)
      else if (alias.gate && !runner.gates.has(alias.gate))
        problems.push(`${label} — the runner has no "${alias.gate}" gate`)
      else if (alias.notRun && !runner.notRun.includes(alias.notRun))
        problems.push(`${label} — the runner does not list "${alias.notRun}" as not run`)
    }
  }
  return problems
}

/** A runner gate CI never runs (a phantom, or one whose CI step was deleted). Empty when in step. */
function runnerOnly(ciYaml: string, runner: Runner): string[] {
  const steps = ciSteps(ciYaml)
  const ciCommands = new Set(steps.flatMap((s) => s.commands))
  const ciNames = new Set(steps.map((s) => s.name))
  const aliased = new Set(
    Object.values(CI_ALIASES)
      .map((a) => a.gate)
      .filter(Boolean),
  )
  const toolStep = new Map(
    Object.entries(NAMED_STEPS).flatMap(([name, v]) => (v.gate ? [[v.gate, name] as const] : [])),
  )
  return [...runner.gates]
    .filter(([name, command]) => {
      if (aliased.has(name) || ciCommands.has(command)) return false
      const tool = toolStep.get(name)
      return !(tool && ciNames.has(tool))
    })
    .map(([name, command]) => `${name} (\`${command}\`)`)
}

describe('the local gate runner and CI', () => {
  const ciYaml = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  const runner = readRunner()

  it('finds the commands it is meant to compare — negative control for the parser', () => {
    const found = ciSteps(ciYaml)
      .filter((s) => GATE_JOBS.includes(s.job))
      .flatMap((s) => s.commands)
    // Measured 2026-10-25: pnpm, npm, npx, bash and node lines all parsed, across both jobs.
    for (const expected of [
      `${PNPM} lint`,
      `${PNPM} exec knip`,
      `${PNPM} --filter @run-apparel/viewer test:preload`,
      `${PNPM} --filter @run-apparel/cms test:routes`,
      `${PNPM} --filter @run-apparel/cms test:built-config`,
      'npm ci --no-audit --no-fund',
      'npx tsc --noEmit',
      'bash scripts/test-alert-shell.sh',
      'node scripts/check-cms-worker-size.mjs',
      'node apps/cms/scripts/check-doc-visuals.mjs',
      'node --test scripts/*.test.mjs',
    ]) {
      expect(found, `the parser lost ${expected}`).toContain(expected)
    }
    // A commented-out command is not a step, and a step outside the gate jobs is not compared.
    expect(
      ciSteps('  verify:\n    steps:\n      - run: |\n          # node scripts/x.mjs\n'),
    ).toEqual([{ job: 'verify', name: '', commands: [] }])
  })

  it('runs, or explains, every command CI runs in its gate jobs', () => {
    expect(unaccounted(ciYaml, runner)).toEqual([])
  })

  it('has no gate CI does not run', () => {
    expect(runnerOnly(ciYaml, runner)).toEqual([])
  })

  it('⚠️ CONTROL: a gate CI runs that the runner lacks is caught (a planted missing gate)', () => {
    const without = (name: string): Runner => {
      const gates = new Map(runner.gates)
      gates.delete(name)
      return { ...runner, gates }
    }
    // Each kind of line the first version could not see, dropped from the runner in turn.
    for (const name of [
      'knip',
      'preload',
      'routes',
      'built-config',
      'script-tests',
      'lint',
      'seed',
    ]) {
      const problems = unaccounted(ciYaml, without(name))
      expect(problems.length, `dropping "${name}" from the runner went unnoticed`).toBeGreaterThan(
        0,
      )
    }
    // A tool step (no command line) too.
    expect(unaccounted(ciYaml, without('actionlint')).join('\n')).toContain('actionlint')
    expect(unaccounted(ciYaml, without('zizmor')).join('\n')).toContain('zizmor')
  })

  it('⚠️ CONTROL: a command or step added to CI that the runner does not know is caught', () => {
    const addedCommand = ciYaml.replace(
      /^( {6}- run: pnpm lint)$/m,
      '$1\n      - run: pnpm test:newgate',
    )
    expect(addedCommand).not.toBe(ciYaml)
    expect(unaccounted(addedCommand, runner).join('\n')).toContain('test:newgate')

    const addedStep = ciYaml.replace(
      /^( {6}- run: pnpm lint)$/m,
      '$1\n      - name: Mystery tool\n        run: python3 mystery.py',
    )
    expect(unaccounted(addedStep, runner).join('\n')).toContain('Mystery tool')
  })

  it('⚠️ CONTROL: a runner gate with no CI counterpart is caught', () => {
    const phantom: Runner = {
      ...runner,
      gates: new Map([...runner.gates, ['phantom', `${PNPM} phantom`]]),
    }
    expect(runnerOnly(ciYaml, phantom).join('\n')).toContain('phantom')
  })

  it('runs every hook test file there is — CI runs them with a glob', () => {
    const files = readdirSync(join(REPO_ROOT, '.claude', 'hooks'))
      .filter((f) => f.endsWith('.test.mjs'))
      .map((f) => f.replace(/\.test\.mjs$/, ''))
    expect(runner.hooks.sort()).toEqual(files.sort())
  })

  it('runs the docs index before the build, and the doc pictures just before e2e, as CI does', () => {
    const order = [...runner.gates.keys()]
    expect(order.indexOf('docs-index')).toBeGreaterThan(order.indexOf('alert-shell'))
    expect(order.indexOf('docs-index')).toBeLessThan(order.indexOf('build'))
    expect(order.indexOf('doc-visuals')).toBe(order.indexOf('e2e') - 1)
    // The three guards read what `build` wrote, and the size gate what the Worker build wrote.
    for (const guard of ['preload', 'routes', 'built-config', 'bundle-budget']) {
      expect(order.indexOf(guard), guard).toBeGreaterThan(order.indexOf('build'))
    }
    expect(order.indexOf('cms-worker-size')).toBeGreaterThan(order.indexOf('cms-worker-build'))
  })
})
