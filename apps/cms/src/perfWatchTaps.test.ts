import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * perf-watch.yml's weekly tap measurement (faster-taps plan, Task 9), read out of the workflow and
 * run the way GitHub runs it (`bash -e`), with a stub `node` standing in for measure-taps.mjs.
 *
 * REPORT-ONLY SINCE 27 OCT (owner). Its first run, 27 Oct, missed 7 of 12 targets from GitHub's
 * runner while the same targets passed from the owner's Mac in Pakistan (p75 54-187 ms): garment
 * opens took 862-4,045 ms there with the data answered from the store, 229-317 ms on the Mac. With
 * no runner baseline yet, a red run each Monday would trip heartbeat.yml's "success within 192
 * hours" alarm on the runner's speed, not the site's. A missed target is now a warning; a
 * measurement that printed no numbers still fails, so a broken judge never goes quietly green.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..')
const TITLE = 'Measure taps and garment opens on the live site'
const SUMMARY = [
  '/ chromium: warm p50 48 ms, p75 52 ms (10 taps)',
  '/about chromium: warm p50 138 ms, p75 2125 ms (10 taps)',
].join('\n')

function step(title: string): string {
  const lines = readFileSync(join(ROOT, '.github', 'workflows', 'perf-watch.yml'), 'utf8').split(
    '\n',
  )
  const start = lines.indexOf(`      - name: ${title}`)
  const run = lines.findIndex((l, i) => i > start && /^ {8}run: \|$/.test(l))
  if (start === -1 || run === -1) throw new Error(`perf-watch.yml has no step "${title}"`)
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

/** The step, with `node` printing `printed` and exiting `code`. */
function measure(code: number, printed: string) {
  const dir = mkdtempSync(join(tmpdir(), 'perf-watch-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(dir, 'printed'), printed)
  writeFileSync(join(bin, 'node'), `#!/usr/bin/env bash\ncat "${dir}/printed"\nexit ${code}\n`, {
    mode: 0o755,
  })
  const script = join(dir, 'step.sh')
  writeFileSync(script, step(TITLE))
  const r = spawnSync('bash', ['-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

describe('perf-watch.yml: the weekly tap measurement, under bash -e', { timeout: 30_000 }, () => {
  it('reports a missed target as a warning and stays green, with the numbers printed', () => {
    const r = measure(1, SUMMARY)
    expect(r.out).toContain('/about chromium: warm p50 138 ms, p75 2125 ms')
    expect(r.out).toMatch(/::warning::.*report-only/)
    expect(r.status).toBe(0)
  })

  it('fails when the measurement printed no numbers at all (a judge that cannot measure)', () => {
    const r = measure(1, 'browserType.launch: Executable does not exist')
    expect(r.out).toMatch(/::error::/)
    expect(r.status).toBe(1)
  })

  it('stays green, with its warning, when the live site blocked the probe', () => {
    const r = measure(2, SUMMARY)
    expect(r.out).toContain('inconclusive')
    expect(r.status).toBe(0)
  })

  it('passes a run that met every target, quietly', () => {
    const r = measure(0, SUMMARY)
    expect(r.out).not.toMatch(/::warning::|::error::/)
    expect(r.status).toBe(0)
  })
})
