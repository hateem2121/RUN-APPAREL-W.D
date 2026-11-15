import assert from 'node:assert/strict'
import { test } from 'node:test'
import { batches, cyrillicStrings } from './check-russian-text.mjs'

test('pulls only Cyrillic strings, from literals, templates and JSX text, with their lines', () => {
  const found = cyrillicStrings(
    "const a = 'Образец'\nconst b = 'English only'\nconst c = `Срок ${x} недель`\nconst d = <p>Привет</p>\n",
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
