import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  batches,
  cyrillicStrings,
  OutageError,
  postWithRetry,
  russianFiles,
} from './check-russian-text.mjs'

/** A throwaway repo root holding the given files (path → text). */
function fakeRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'ru-text-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

test('reads the shared and viewer Russian words files, and the site chrome, as well as the CMS', () => {
  const root = fakeRoot({
    'apps/cms/src/lib/a.ru.ts': "export const a = 'Привет'",
    'packages/shared/src/siteChrome.ts': "export const b = 'Меню'",
    'packages/shared/src/words.ru.ts': "export const c = 'Слово'",
    'packages/shared/src/other.ts': "export const d = 'Чужое'",
    'apps/viewer/src/deep/garment.ru.ts': "export const e = 'Изделие'",
    'apps/viewer/src/App.tsx': "export const f = 'Чужое'",
  })
  try {
    const found = russianFiles(root)
      .map((file) => file.slice(root.length + 1))
      .sort()
    assert.deepEqual(found, [
      'apps/cms/src/lib/a.ru.ts',
      'apps/viewer/src/deep/garment.ru.ts',
      'packages/shared/src/siteChrome.ts',
      'packages/shared/src/words.ru.ts',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a repo with none of the shared or viewer files is no error', () => {
  const root = fakeRoot({ 'apps/cms/src/lib/a.ru.ts': "export const a = 'Привет'" })
  try {
    assert.equal(russianFiles(root).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a service that never answers is an outage after three tries, not a pass or a crash', async () => {
  let calls = 0
  const send = async () => {
    calls++
    throw new Error('connect ETIMEDOUT')
  }
  await assert.rejects(
    postWithRetry('https://speller.yandex.net/x', new URLSearchParams(), { send, wait: 0 }),
    OutageError,
  )
  assert.equal(calls, 3)
})

test('a 5xx or a 429 is tried again, and a later good answer is used', async () => {
  const answers = [503, 429, 200]
  const send = async () => new Response('[]', { status: answers.shift() })
  const res = await postWithRetry('https://api.languagetool.org/v2/check', 'x', { send, wait: 0 })
  assert.equal(res.status, 200)
})

test('a 400 is a real answer and is not retried', async () => {
  let calls = 0
  const send = async () => {
    calls++
    return new Response('bad', { status: 400 })
  }
  const res = await postWithRetry('https://api.languagetool.org/v2/check', 'x', { send, wait: 0 })
  assert.equal(res.status, 400)
  assert.equal(calls, 1)
})

test('pulls only Cyrillic strings, from literals, templates and JSX text, with their lines', () => {
  const found = cyrillicStrings(
    // The scanned source holds a template placeholder; its $ is joined on so lint does not read it as
    // a mistake in this test.
    "const a = 'Образец'\nconst b = 'English only'\nconst c = `Срок " +
      '$' +
      '{x} недель`\nconst d = <p>Привет</p>\n',
  )
  assert.deepEqual(
    found.map((item) => [item.text, item.line]),
    [
      ['Образец', 1],
      ['Срок', 3],
      ['недель', 3],
      ['Привет', 4],
    ],
  )
})

test('never puts more than the limit in one request, and loses no string', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ text: 'слово'.repeat(i + 1) }))
  const groups = batches(items, 200)
  assert.equal(groups.flat().length, 50)
  for (const group of groups) {
    if (group.length > 1)
      assert.ok(group.reduce((sum, item) => sum + item.text.length + 1, 0) <= 200)
  }
})
