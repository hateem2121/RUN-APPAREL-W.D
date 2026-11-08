import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { judgeLockReport } from './check-actions-lock.mjs'

// Shapes copied from gh actions-lock v0.4.1 run against this repository on 2026-11-08: a clean
// lockfile, one with a locked commit changed by hand, and one run with GitHub unreachable.
const scorecardWarning = {
  category: 'container-image',
  severity: 'warning',
  detail: 'container image ghcr.io/ossf/scorecard-action:v2.5.0 is not pinned by digest',
}
const CLEAN = { valid: true, findings: [scorecardWarning] }
const movedPin = {
  category: 'unreachable-pin',
  severity: 'error',
  detail: "locked commit 3d3c42e5aac5 is not in actions/checkout's history",
}
const TAMPERED = { valid: false, findings: [movedPin, movedPin, scorecardWarning] }
const unreachable = (name) => ({
  category: 'reachability-unknown',
  severity: 'error',
  detail: `could not verify locked ${name}: Post "https://api.github.com/graphql": proxyconnect`,
})
const OFFLINE = {
  valid: false,
  findings: [unreachable('actions/checkout@3d3c42e5aac5'), unreachable('actions/cache@27d5ce7f')],
}

test('a clean lockfile passes, and its warning is still printed', () => {
  const v = judgeLockReport(CLEAN)
  assert.equal(v.state, 'ok')
  assert.equal(v.lines.length, 1)
})

test('a changed locked commit fails as invalid, each finding said once', () => {
  const v = judgeLockReport(TAMPERED)
  assert.equal(v.state, 'invalid')
  assert.equal(v.lines.length, 1)
  assert.match(v.lines[0], /unreachable-pin/)
})

test('GitHub not answering is "not checked", never a pass and never "invalid"', () => {
  assert.equal(judgeLockReport(OFFLINE).state, 'unchecked')
  // Even if a future version marked the run valid while some pins went unanswered.
  const quietTimeout = { valid: true, findings: [{ ...unreachable('x@1'), severity: 'warning' }] }
  assert.equal(judgeLockReport(quietTimeout).state, 'unchecked')
})

test('no report, or a report without findings, is "not checked"', () => {
  for (const r of [null, undefined, '', {}, { valid: true }]) {
    assert.equal(judgeLockReport(r).state, 'unchecked')
  }
})

test('valid: false with no error finding still fails', () => {
  assert.equal(judgeLockReport({ valid: false, findings: [] }).state, 'invalid')
})

test('the command exits 0 / 1 / 2 for clean / tampered / offline and for an empty file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-report-'))
  const script = fileURLToPath(new URL('./check-actions-lock.mjs', import.meta.url))
  const run = (body) => {
    const file = join(dir, 'report.json')
    writeFileSync(file, body)
    return spawnSync(process.execPath, [script, file], { encoding: 'utf8' }).status
  }
  assert.equal(run(JSON.stringify(CLEAN)), 0)
  assert.equal(run(JSON.stringify(TAMPERED)), 1)
  assert.equal(run(JSON.stringify(OFFLINE)), 2)
  assert.equal(run(''), 2)
})
