import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { test } from 'node:test'
import { pickPictures, SNAPSHOT_DIR, snapshotNameFor } from './refresh-visual-snapshots.mjs'

test('maps an actual picture to the reference it replaces', () => {
  assert.equal(
    snapshotNameFor('test-results/visual-whole-pages-home-1440-chromium/home-1440-actual.png'),
    'home-1440-chromium-linux.png',
  )
})

test('ignores the diff and expected pictures Playwright writes beside it (negative control)', () => {
  assert.equal(snapshotNameFor('x/home-1440-diff.png'), null)
  assert.equal(snapshotNameFor('x/home-1440-expected.png'), null)
  assert.equal(snapshotNameFor('x/trace.zip'), null)
})

test('every name it produces is the name of a reference that exists today', () => {
  // If Playwright's suffix or the spec's naming changed, this script would write files the
  // test never reads. The real folder is the judge.
  const refs = readdirSync(SNAPSHOT_DIR)
  for (const ref of refs) {
    const stem = ref.replace(/-chromium-linux\.png$/, '')
    assert.equal(snapshotNameFor(`${stem}-actual.png`), ref)
  }
  assert.ok(refs.length >= 15, `expected the 15 reference pictures, found ${refs.length}`)
})

test('a retried test keeps the newest attempt', () => {
  const picked = pickPictures([
    { path: 'a/home-390-actual.png', mtimeMs: 1 },
    { path: 'a-retry1/home-390-actual.png', mtimeMs: 2 },
    { path: 'a/home-390-diff.png', mtimeMs: 3 },
  ])
  assert.deepEqual([...picked], [['home-390-chromium-linux.png', 'a-retry1/home-390-actual.png']])
})
