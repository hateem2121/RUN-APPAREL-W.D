import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { droppedConnection, withOneRetry } from './smoke-retry.mjs'

/*
 * 11 Nov 2026, run 43065365716: rxps/wine's link-preview smoke died on `Error: read ECONNRESET`
 * after its checks had passed, the deploy job went red after the release, and the apex, security,
 * IndexNow and region warm-up steps were skipped. The same smoke passed for all 20 garments by hand
 * minutes later. A dropped connection earns ONE more try; a failed check never does.
 */
const CRASH = `   404 triad: the same nonexistent product, asked for by a crawler -> 404
node:internal/modules/run_main:111
    triggerUncaughtException(
    ^
Error: read ECONNRESET
    at TLSWrap.onStreamRead (node:internal/stream_base_commons:221:20) {
  errno: -104,
  code: 'ECONNRESET',
  syscall: 'read'
}`

test('names the crash from run 43065365716 a dropped connection', () => {
  assert.equal(droppedConnection(CRASH), true)
})

test('names the other ways a connection drops', () => {
  for (const text of [
    'Error: connect ETIMEDOUT 104.21.0.1:443',
    'TypeError: fetch failed',
    'getaddrinfo EAI_AGAIN wear-run.com',
    "code: 'UND_ERR_SOCKET'",
    'Error: write EPIPE',
  ]) {
    assert.equal(droppedConnection(text), true, text)
  }
})

test('never names a failed check a dropped connection', () => {
  for (const text of [
    '::error::og:image answered 404',
    'FAIL  the card is missing: expected image/jpeg, got text/html',
    'canonical https://wear-run.com/products/x/y does not match',
  ]) {
    assert.equal(droppedConnection(text), false, text)
  }
})

/** A fake garment run: answers from the list in turn, and counts the calls. */
function runs(...answers) {
  const calls = []
  const run = async () => {
    calls.push(1)
    return answers[calls.length - 1]
  }
  return { run, calls }
}

test('a dropped connection is tried once more, and its second answer is the result', async () => {
  const { run, calls } = runs({ code: 1, output: CRASH }, { code: 0, output: 'OK' })
  const result = await withOneRetry(run)
  assert.equal(calls.length, 2)
  assert.equal(result.code, 0)
  assert.match(result.output, /dropped connection, tried once more/)
  assert.match(result.output, /ECONNRESET/, 'the first attempt stays in the log')
})

test('a connection that drops twice still fails', async () => {
  const { run, calls } = runs({ code: 1, output: CRASH }, { code: 1, output: CRASH })
  const result = await withOneRetry(run)
  assert.equal(calls.length, 2)
  assert.equal(result.code, 1)
})

test('a failed check is never tried again', async () => {
  const { run, calls } = runs({ code: 1, output: '::error::og:image answered 404' })
  const result = await withOneRetry(run)
  assert.equal(calls.length, 1)
  assert.equal(result.code, 1)
})

test('a pass is never tried again', async () => {
  const { run, calls } = runs({ code: 0, output: 'OK' })
  await withOneRetry(run)
  assert.equal(calls.length, 1)
})

/*
 * Both post-deploy runners take the one retry (owner, 11 Nov 2026). The payload runner used to
 * stream each garment straight to the log (`stdio: 'inherit'`), so it could not read the output
 * it would need to tell a dropped connection from a failed check. The two are read as text: each
 * is a top-level script that would run against production on import.
 */
for (const runner of ['smoke-live-previews.mjs', 'smoke-live-products.mjs']) {
  test(`${runner} runs every garment through withOneRetry`, () => {
    const source = readFileSync(join(import.meta.dirname, runner), 'utf8')
    assert.match(source, /import \{ withOneRetry \} from '\.\/smoke-retry\.mjs'/)
    assert.match(source, /await withOneRetry\(\(\) => smokeOnce\(/)
    assert.doesNotMatch(
      source,
      /stdio: 'inherit'/,
      'a streamed run cannot be read for a dropped connection',
    )
  })
}
