import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  containerRowName,
  imageVerdict,
  lastModifiedEpoch,
} from '../../../scripts/shrink-image-moved.mjs'

/**
 * scripts/shrink-image-moved.mjs decides whether deploy-shrink's image moved. The table below
 * has the shape `wrangler containers list` printed on 2026-10-14, when the inline check failed
 * a good deploy (issue #177): this container's row still said 2026-10-13 one minute after the
 * deploy, another project's row sits in the same table, and the stamps carry nanoseconds.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'shrink-image-moved.mjs')

function table(shrinkStamp: string, otherStamp = '2026-10-12T09:10:40.199000064Z') {
  return [
    '┌──────┬──────────────────────────────────────────┬───────┬────────────────┬────────────────────────────────┐',
    '│ ID   │ NAME                                     │ STATE │ LIVE INSTANCES │ LAST MODIFIED                  │',
    '├──────┼──────────────────────────────────────────┼───────┼────────────────┼────────────────────────────────┤',
    `│ a1   │ other-project-runner                     │ ready │ 1              │ ${otherStamp} │`,
    '├──────┼──────────────────────────────────────────┼───────┼────────────────┼────────────────────────────────┤',
    `│ a2   │ run-apparel-viewer-shrink-shrinkcontainer │ ready │ 1              │ ${shrinkStamp} │`,
    '└──────┴──────────────────────────────────────────┴───────┴────────────────┴────────────────────────────────┘',
  ].join('\n')
}

const NAME = 'run-apparel-viewer-shrink-shrinkcontainer'
// 2026-10-14T06:43:22Z, when deploy-shrink began on 727174aa.
const RUN_BEGAN = Date.parse('2026-10-14T06:43:22Z') / 1000

describe('which row is the shrink container', () => {
  it('is named from apps/shrink/wrangler.jsonc, so a rename there cannot leave the check reading nothing', () => {
    const config = readFileSync(join(ROOT, 'apps', 'shrink', 'wrangler.jsonc'), 'utf8')
    const worker = config.match(/^\s*"name":\s*"([^"]+)"/m)?.[1]
    const className = config.match(/"containers":\s*\[\s*\{[^}]*"class_name":\s*"([^"]+)"/)?.[1]
    expect(worker).toBeDefined()
    expect(className).toBeDefined()
    expect(containerRowName(worker as string, className as string)).toBe(NAME)
  })

  it('is the name ci.yml passes to the check', () => {
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(ci).toContain(`shrink-image-moved.mjs --name ${NAME} --before`)
  })
})

describe('reading the row', () => {
  it('reads nanosecond stamps', () => {
    expect(lastModifiedEpoch(table('2026-10-14T06:44:26.468999936Z'), NAME)).toBe(
      Date.parse('2026-10-14T06:44:26Z') / 1000,
    )
  })

  it('reads this row only, never another container on the account', () => {
    // The inline check took the newest stamp in the table: the other row here is newer and
    // would have passed a stale shrink image.
    const t = table('2026-10-13T06:19:24.000000000Z', '2026-10-14T07:00:00.000000000Z')
    expect(imageVerdict(t, NAME, RUN_BEGAN).verdict).toBe('old')
  })

  it('is unknown, not moved, when the row is missing', () => {
    expect(imageVerdict(table('2026-10-14T06:44:26Z'), 'some-other-name', RUN_BEGAN)).toEqual({
      verdict: 'unknown',
      modified: null,
    })
  })
})

describe('the verdict, both ways (the 727174aa deploy)', () => {
  it('is old one minute after the deploy, when the row still showed the day before', () => {
    expect(imageVerdict(table('2026-10-13T06:19:24.000000000Z'), NAME, RUN_BEGAN).verdict).toBe(
      'old',
    )
  })

  it('is moved once the row shows the new image', () => {
    expect(imageVerdict(table('2026-10-14T06:44:26.468999936Z'), NAME, RUN_BEGAN).verdict).toBe(
      'moved',
    )
  })
})

/**
 * The workflow step itself, read out of ci.yml and run the way GitHub runs it: `bash -e {0}`
 * (printed at the top of every step's log). On 1734cac9 (issue #179) the step's retry loop never
 * ran: Cloudflare's stamp still said 06:44:26 at 08:03:57, the script answered `old` (exit 1),
 * and `-e` ended the step on that line, before `verdict=$?`, though wrangler had replaced the
 * image (f686a27f -> da9c0c00) five seconds earlier. The step was simulated without `-e` before
 * it merged, which is why that simulation passed. `pnpm` (the wrangler read) and `sleep` are
 * stubs on PATH; each read takes the next entry of PLAN, and the last entry repeats.
 */
describe('the drift step in ci.yml, run under bash -e as GitHub runs it', () => {
  // 2026-10-14T08:03:23Z, when deploy-shrink began on 1734cac9.
  const BEFORE = Date.parse('2026-10-14T08:03:23Z') / 1000

  function driftStep(): string {
    const lines = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').split('\n')
    const start = lines.findIndex((l) =>
      /^ {6}- name: Assert the container image actually moved/.test(l),
    )
    const run = lines.findIndex((l, i) => i > start && /^ {8}run: \|$/.test(l))
    if (start === -1 || run === -1)
      throw new Error('the drift step or its run: block is not in ci.yml')
    const body: string[] = []
    for (const line of lines.slice(run + 1)) {
      if (line.trim() === '') {
        body.push('')
        continue
      }
      if (!line.startsWith(' '.repeat(10))) break
      body.push(line.slice(10))
    }
    return body.join('\n')
  }

  function runStep(plan: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'drift-step-'))
    const stubs = join(dir, 'bin')
    mkdirSync(stubs)
    const moved = table('2026-10-14T08:04:10.123456789Z', '2026-10-14T07:00:00.000000000Z')
    const old = table('2026-10-14T06:44:26.468999936Z', '2026-10-14T08:04:30.000000000Z')
    const reads = join(dir, 'reads')
    writeFileSync(join(dir, 'moved'), moved)
    writeFileSync(join(dir, 'old'), old)
    writeFileSync(join(dir, 'none'), 'wrangler printed no table')
    writeFileSync(reads, '')
    writeFileSync(
      join(stubs, 'pnpm'),
      [
        '#!/usr/bin/env bash',
        `echo read >> "${reads}"`,
        `n=$(wc -l < "${reads}" | tr -d ' ')`,
        `plan=(${plan.join(' ')})`,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: bash array syntax for the stub, not a template
        'i=$(( n <= ${#plan[@]} ? n - 1 : ${#plan[@]} - 1 ))',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: bash array syntax for the stub, not a template
        'step=${plan[$i]}',
        'if [ "$step" = fail ]; then echo "✘ [ERROR] A request to the Cloudflare API failed." >&2; exit 1; fi',
        `cat "${dir}/$step"`,
      ].join('\n'),
      { mode: 0o755 },
    )
    writeFileSync(join(stubs, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
    const script = join(dir, 'step.sh')
    writeFileSync(script, driftStep())
    const result = spawnSync('bash', ['-e', script], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${stubs}:${process.env.PATH}`, BEFORE: String(BEFORE) },
    })
    const count = readFileSync(reads, 'utf8').split('\n').filter(Boolean).length
    return { status: result.status, out: result.stdout + result.stderr, reads: count }
  }

  it('waits for the stamp: old on the first read, moved on the second, passes (the 1734cac9 deploy)', () => {
    const r = runStep(['old', 'moved'])
    expect(r.out).toContain('the deploy moved it (read 2)')
    expect(r.reads).toBe(2)
    expect(r.status).toBe(0)
  })

  it('passes at once when the first read already shows the new image', () => {
    const r = runStep(['moved'])
    expect(r.reads).toBe(1)
    expect(r.status).toBe(0)
  })

  it('fails after all nine reads when the image never moves', () => {
    const r = runStep(['old'])
    expect(r.reads).toBe(9)
    expect(r.out).toContain('The container image did NOT move')
    expect(r.status).toBe(1)
  })

  it('retries a failed wrangler read, and passes when a later read shows the new image', () => {
    const r = runStep(['fail', 'moved'])
    expect(r.reads).toBe(2)
    expect(r.status).toBe(0)
  })

  it('fails, naming the read and not the image, when wrangler fails all nine times', () => {
    const r = runStep(['fail'])
    expect(r.reads).toBe(9)
    expect(r.out).toContain('failed on all 9 reads')
    expect(r.status).toBe(1)
  })

  it('warns and passes, without retrying, when the row cannot be found', () => {
    const r = runStep(['none'])
    expect(r.reads).toBe(1)
    expect(r.out).toContain('drift NOT verified')
    expect(r.status).toBe(0)
  })
})

describe('the command the workflow runs', () => {
  function run(input: string, ...args: string[]) {
    return spawnSync('node', [SCRIPT, ...args], { input, encoding: 'utf8' })
  }

  it('exits 0 when the image moved, 1 when it did not, 2 when it cannot tell', () => {
    const before = ['--name', NAME, '--before', String(RUN_BEGAN)]
    expect(run(table('2026-10-14T06:44:26.468999936Z'), ...before).status).toBe(0)
    expect(run(table('2026-10-13T06:19:24.000000000Z'), ...before).status).toBe(1)
    expect(run('wrangler printed no table', ...before).status).toBe(2)
    expect(run('', '--name', NAME).status).toBe(2)
  })
})
