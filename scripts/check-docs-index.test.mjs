import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { danglingLinks } from './check-docs-index.mjs'

// A throwaway docs/ folder, so a passing test cannot depend on what the real index
// happens to link today.
function tempDocs() {
  const dir = mkdtempSync(join(tmpdir(), 'docs-index-'))
  writeFileSync(join(dir, 'REAL.md'), '# real\n')
  return dir
}

test('a relative link that resolves, an absolute URL and an anchor are all fine', () => {
  const dir = tempDocs()
  const index = '[real](REAL.md) · [site](https://wear-run.com) · [top](#top)'
  assert.deepEqual(danglingLinks(index, dir), [])
})

test('negative control: a link to a deleted file is caught — the 2026-11-08 finding', () => {
  const dir = tempDocs()
  // The exact row that rotted in the real index: the file was deleted 2026-10-23 and
  // the one-direction check never asked about it again.
  const index =
    '| [PIPELINE-INVESTIGATION-2026-09-01.md](PIPELINE-INVESTIGATION-2026-09-01.md) | The pipeline investigation of 2026-09-01 |'
  assert.deepEqual(
    danglingLinks(index, dir).map((d) => d.target),
    ['PIPELINE-INVESTIGATION-2026-09-01.md'],
  )
})

test('negative control: a ../ link resolves against the folder above the index', () => {
  const dir = tempDocs()
  assert.equal(danglingLinks('[root](../no-such-dir/MISSING.md)', dir).length, 1)
  // and the same shape that works in the real index keeps working
  writeFileSync(join(dir, '..', 'PARENT.md'), '# parent\n')
  assert.deepEqual(danglingLinks('[parent](../PARENT.md)', dir), [])
})

test("today's real index has no dangling link", () => {
  const docsDir = fileURLToPath(new URL('../docs/', import.meta.url))
  const index = readFileSync(join(docsDir, 'README.md'), 'utf8')
  assert.deepEqual(danglingLinks(index, docsDir), [])
})
