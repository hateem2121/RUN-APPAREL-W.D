import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { FLOOR, judgeScanCount } from './check-secret-scan-count.mjs'

// gitleaks 8.30.1's own closing lines, colour codes included, copied from the `secrets` job of
// run 45983094480 (job 140451790157, 27 Nov 2026), which said 1030; read with
// `gh api repos/hateem2121/RUN-APPAREL-W.D/actions/jobs/140451790157/logs`. Only the number is
// changed between cases.
const ESC = String.fromCharCode(27)
const closing = (count) =>
  [
    `${ESC}[90m10:34AM${ESC}[0m ${ESC}[32mINF${ESC}[0m ${ESC}[1m${count} commits scanned.${ESC}[0m`,
    `${ESC}[90m10:34AM${ESC}[0m ${ESC}[32mINF${ESC}[0m ${ESC}[1mscanned ~26102067 bytes (26.10 MB) in 3.23s${ESC}[0m`,
    `${ESC}[90m10:34AM${ESC}[0m ${ESC}[32mINF${ESC}[0m ${ESC}[1mno leaks found${ESC}[0m`,
  ].join('\n')

test('a healthy scan passes: 1,031 scanned where git counts 1,031 (main at cd25fa9c)', () => {
  const v = judgeScanCount(closing(1031), '1031')
  assert.equal(v.ok, true)
  assert.equal(v.scanned, 1031)
})

test('a scan a little above or below the expected number passes (other refs, patchless commits)', () => {
  assert.equal(judgeScanCount(closing(1032), '1028').ok, true)
  assert.equal(judgeScanCount(closing(1030), '1031').ok, true)
})

test('the two green-but-empty runs on record fail: 1 commit and 0 commits', () => {
  for (const count of [1, 0]) {
    const v = judgeScanCount(closing(count), '1031')
    assert.equal(v.ok, false, `${count} commits scanned must fail`)
    assert.equal(v.scanned, count)
    assert.match(v.message, /floor is 928/)
  }
})

test('the floor is where it says: one commit under fails, exactly on it passes', () => {
  const needed = Math.ceil(1031 * FLOOR)
  assert.equal(judgeScanCount(closing(needed), 1031).ok, true)
  assert.equal(judgeScanCount(closing(needed - 1), 1031).ok, false)
})

test('output with no count fails as not checked, never as a pass', () => {
  for (const output of ['', 'no leaks found', 'commits scanned', '12 commit scanned']) {
    const v = judgeScanCount(output, '1031')
    assert.equal(v.ok, false, JSON.stringify(output))
    assert.equal(v.scanned, null)
  }
})

test('a missing or nonsense expected count fails as not checked', () => {
  for (const expected of ['', undefined, null, '0', '-3', 'abc', '10.5', true]) {
    assert.equal(judgeScanCount(closing(1031), expected).ok, false, String(expected))
  }
})

test('the last count wins, and a colour code is never read as part of the number', () => {
  const v = judgeScanCount(`${closing(1)}\n${closing(1031)}`, '1031')
  assert.equal(v.scanned, 1031)
  assert.equal(v.ok, true)
})

// The script as ci.yml calls it: a file and a number in, an exit code out.
const script = fileURLToPath(new URL('./check-secret-scan-count.mjs', import.meta.url))
const runScript = (output, expected) => {
  const file = join(mkdtempSync(join(tmpdir(), 'scan-count-')), 'gitleaks.out')
  if (output !== null) writeFileSync(file, output)
  const args = expected === undefined ? [script, file] : [script, file, expected]
  return spawnSync(process.execPath, args, { encoding: 'utf8' })
}

test('command line: exit 0 on a full scan, exit 1 with an ::error:: line on an empty one', () => {
  const good = runScript(closing(1031), '1031')
  assert.equal(good.status, 0, good.stdout + good.stderr)
  assert.match(good.stdout, /scanned 1031 commits/)

  const empty = runScript(closing(0), '1031')
  assert.equal(empty.status, 1)
  assert.match(empty.stdout, /^::error::The secrets scan did not read the history/)
})

test('command line: a missing output file and a missing expected count both exit 1', () => {
  assert.equal(runScript(null, '1031').status, 1)
  assert.equal(runScript(closing(1031), undefined).status, 1)
  assert.equal(runScript(closing(1031), '').status, 1)
})
