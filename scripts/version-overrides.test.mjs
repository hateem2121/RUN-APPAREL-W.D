import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  isVersionNotFound,
  judgeAnswer,
  judgeControl,
  liveVersion,
  overridesHeader,
  parsePairs,
  versionWithTag,
  withRetries,
} from './version-overrides.mjs'

const OLD = '7cec6d39-4dfc-44d4-b020-485fb6e99c65'
const NEW = 'dc8dcd28-271b-4367-9840-6c244f84cb40'
const PRELOAD = join(import.meta.dirname, 'version-overrides-preload.mjs')

// Shapes captured from wrangler 4.153.0 on 2026-11-07 (`versions list --json`, `deployments status --json`).
const LIST = [
  {
    id: OLD,
    number: 393,
    annotations: { 'workers/message': '045535e main', 'workers/triggered_by': 'version_upload' },
  },
  {
    id: NEW,
    number: 394,
    annotations: { 'workers/tag': 'r1a1', 'workers/triggered_by': 'version_upload' },
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    number: 395,
    annotations: { 'workers/tag': 'r1a1', 'workers/triggered_by': 'secret' },
  },
]
const STATUS = {
  id: 'fbde34cb-a1e6-4551-8143-e2c4fd6c6878',
  versions: [{ version_id: OLD, percentage: 100 }],
}

test('the newest version with the tag wins (a secret added after the upload is the one to stage)', () => {
  assert.equal(versionWithTag(LIST, 'r1a1'), '11111111-1111-4111-8111-111111111111')
  assert.throws(() => versionWithTag(LIST, 'nope'), /no uploaded version carries/)
})

test('the live version is the single 100% one; an existing split is refused (negative control)', () => {
  assert.equal(liveVersion(STATUS), OLD)
  assert.throws(
    () =>
      liveVersion({
        versions: [
          { version_id: OLD, percentage: 90 },
          { version_id: NEW, percentage: 10 },
        ],
      }),
    /already split/,
  )
})

test('the header is the structured dictionary Cloudflare documents', () => {
  assert.equal(
    overridesHeader(parsePairs(`run-apparel-viewer-cms=${NEW},run-apparel-viewer-site=${OLD}`)),
    `run-apparel-viewer-cms="${NEW}", run-apparel-viewer-site="${OLD}"`,
  )
  assert.throws(() => parsePairs('run-apparel-viewer-cms=not-a-uuid'), /not a worker=version pair/)
})

test('an answer from the old version is WRONG, a Bot Fight Mode 403 only inconclusive', () => {
  const w = 'run-apparel-viewer-cms'
  assert.equal(judgeAnswer(200, { worker: w, version: NEW }, w, NEW), 'ok')
  assert.equal(judgeAnswer(200, { worker: w, version: OLD }, w, NEW), 'wrong')
  assert.equal(
    judgeAnswer(200, { worker: 'run-apparel-viewer-site', version: NEW }, w, NEW),
    'wrong',
  )
  assert.equal(judgeAnswer(404, null, w, NEW), 'wrong')
  assert.equal(judgeAnswer(403, null, w, NEW), 'inconclusive')
})

test('the preload adds the header to fetch only for our own hosts', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const seen = []
       globalThis.fetch = async (input, init) => { seen.push([String(input), new Headers(init?.headers).get('cloudflare-workers-version-overrides')]); return new Response('') }
       await import(${JSON.stringify(PRELOAD)})
       await fetch('https://wear-run.com/products/rxps/wine')
       await fetch('https://cms.wear-run.help/api/health', { headers: { accept: 'application/json' } })
       await fetch('https://media.wear-run.com/x.glb')
       console.log(JSON.stringify(seen))`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, CF_VERSION_PAIRS: `run-apparel-viewer-cms=${NEW}` },
    },
  )
  assert.equal(child.status, 0, child.stderr)
  const header = `run-apparel-viewer-cms="${NEW}"`
  assert.deepEqual(JSON.parse(child.stdout), [
    ['https://wear-run.com/products/rxps/wine', header],
    ['https://cms.wear-run.help/api/health', header],
    ['https://media.wear-run.com/x.glb', null],
  ])
})

test('the preload adds the header to node:https-style requests too (the preview check uses them)', async () => {
  const got = []
  const server = createServer((req, res) => {
    got.push(req.headers['cloudflare-workers-version-overrides'] ?? null)
    res.end('ok')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  // `lookup` sends the request for wear-run.com to this local server, so the HOST check is real.
  const script = `import http from 'node:http'
    await import(${JSON.stringify(PRELOAD)})
    const lookup = (_h, o, cb) => o?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)
    for (const hostname of ['wear-run.com', 'example.org']) {
      await new Promise((ok, bad) => http.request({ hostname, port: ${port}, path: '/', lookup }, (r) => { r.resume(); r.on('end', ok) }).on('error', bad).end())
    }`
  // ASYNC spawn: spawnSync would block this process, so the local server could never answer.
  const child = await new Promise((resolve) => {
    const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, CF_VERSION_PAIRS: `run-apparel-viewer-site=${NEW}` },
    })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d
    })
    proc.on('close', (status) => resolve({ status, stderr }))
  })
  server.close()
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(got, [`run-apparel-viewer-site="${NEW}"`, null])
})

test('with CF_VERSION_PAIRS unset the preload changes nothing (a normal deploy step is untouched)', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const f = globalThis.fetch; await import(${JSON.stringify(PRELOAD)}); console.log(globalThis.fetch === f)`,
    ],
    { encoding: 'utf8', env: { ...process.env, CF_VERSION_PAIRS: '' } },
  )
  assert.equal(child.stdout.trim(), 'true')
})

test('the negative control passes on the answers the FIRST deploy really got (run 42359271801)', () => {
  // Neither live version had the address yet: the CMS answered 404, the viewer its page shell.
  assert.equal(judgeControl(404, null, 'run-apparel-viewer-cms', NEW, OLD), 'ok')
  assert.equal(judgeControl(200, null, 'run-apparel-viewer-site', NEW, OLD), 'ok')
  // From the second deploy on, the live version reports its own id.
  assert.equal(
    judgeControl(
      200,
      { worker: 'run-apparel-viewer-cms', version: OLD },
      'run-apparel-viewer-cms',
      NEW,
      OLD,
    ),
    'ok',
  )
})

test('negative control: the NEW version answering without the header is caught', () => {
  // That is what an override applied to everyone (a version left at 100%) would look like.
  assert.equal(
    judgeControl(
      200,
      { worker: 'run-apparel-viewer-cms', version: NEW },
      'run-apparel-viewer-cms',
      NEW,
      OLD,
    ),
    'wrong',
  )
  assert.equal(
    judgeControl(
      200,
      { worker: 'run-apparel-viewer-cms', version: '11111111-1111-4111-8111-111111111111' },
      'run-apparel-viewer-cms',
      NEW,
      OLD,
    ),
    'wrong',
  )
  assert.equal(judgeControl(500, null, 'run-apparel-viewer-cms', NEW, OLD), 'wrong')
  assert.equal(judgeControl(403, null, 'run-apparel-viewer-cms', NEW, OLD), 'inconclusive')
})

// ── a version Cloudflare does not know yet (16 Nov 2026, main run 43879164061) ──────────────────

const NOT_FOUND =
  'wrangler versions deploy failed: ✘ [ERROR] A request to the Cloudflare API (/accounts/x/workers/scripts/run-apparel-viewer-cms/versions/ef436e53-5c32-4ad6-aaff-f0f1664ec79b) failed.\n\n  The requested Worker version could not be found, please check the ID being passed and try again. [code: 100146]'

test('the "version could not be found" failure is recognised, and other failures are not', () => {
  assert.equal(isVersionNotFound(NOT_FOUND), true)
  assert.equal(isVersionNotFound('… [code: 100146]'), true)
  // Negative controls: a refused token and a split deployment must stop the deploy at once.
  assert.equal(isVersionNotFound('Authentication error [code: 10000]'), false)
  assert.equal(isVersionNotFound('the live deployment is already split'), false)
  assert.equal(isVersionNotFound(undefined), false)
})

test('a retryable failure is tried again after each wait, then succeeds', async () => {
  const waited = []
  let calls = 0
  const result = await withRetries(
    () => {
      calls++
      if (calls < 3) throw new Error(NOT_FOUND)
      return 'staged'
    },
    isVersionNotFound,
    [5, 15],
    async (ms) => void waited.push(ms),
  )
  assert.equal(result, 'staged')
  assert.equal(calls, 3)
  assert.deepEqual(waited, [5, 15])
})

test('it gives up after the last wait, with the real error (no endless loop)', async () => {
  let calls = 0
  await assert.rejects(
    withRetries(
      () => {
        calls++
        throw new Error(NOT_FOUND)
      },
      isVersionNotFound,
      [1, 1],
      async () => {},
    ),
    /100146/,
  )
  assert.equal(calls, 3)
})

test('negative control: any other failure is NOT tried again', async () => {
  let calls = 0
  await assert.rejects(
    withRetries(
      () => {
        calls++
        throw new Error('Authentication error [code: 10000]')
      },
      isVersionNotFound,
      [1, 1],
      async () => {},
    ),
    /10000/,
  )
  assert.equal(calls, 1)
})

/**
 * The whole `stage` command against a stand-in wrangler (WRANGLER_BIN), as ci.yml runs it. The
 * stand-in answers `versions list` and `deployments status` with the shapes above, and fails
 * `versions deploy` with Cloudflare's 100146 the first `failures` times.
 */
function stageWithFakeWrangler(failures) {
  const dir = mkdtempSync(join(tmpdir(), 'version-overrides-'))
  const counter = join(dir, 'count')
  const fake = join(dir, 'wrangler.mjs')
  writeFileSync(counter, '0')
  writeFileSync(
    fake,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2).join(' ')
if (args.startsWith('versions list')) console.log(${JSON.stringify(JSON.stringify(LIST))})
else if (args.startsWith('deployments status')) console.log(${JSON.stringify(JSON.stringify(STATUS))})
else if (args.startsWith('versions deploy')) {
  const n = Number(readFileSync(${JSON.stringify(counter)}, 'utf8')) + 1
  writeFileSync(${JSON.stringify(counter)}, String(n))
  if (n <= ${failures}) {
    console.error('\\u001b[31m✘ \\u001b[41;31m[\\u001b[41;97mERROR\\u001b[41;31m]\\u001b[0m A request to the Cloudflare API failed.\\n\\n  The requested Worker version could not be found, please check the ID being passed and try again. [code: 100146]\\n')
    process.exit(1)
  }
  console.log('deployed')
} else process.exit(3)
`,
  )
  chmodSync(fake, 0o755)
  const run = spawnSync(
    process.execPath,
    [
      join(import.meta.dirname, 'version-overrides.mjs'),
      'stage',
      'run-apparel-viewer-cms',
      dir,
      'r1a1',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_BIN: fake, CF_VERSION_RETRY_WAITS_MS: '1,1' },
    },
  )
  return { ...run, deployCalls: Number(readFileSync(counter, 'utf8')) }
}

test('stage succeeds when Cloudflare finds the version on the second try', () => {
  const run = stageWithFakeWrangler(1)
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.deployCalls, 2)
  // Exactly what ci.yml pipes into $GITHUB_OUTPUT: two key=value lines and nothing else.
  assert.equal(run.stdout, `old=${OLD}\nnew=${versionWithTag(LIST, 'r1a1')}\n`)
  assert.match(run.stderr, /::warning::Cloudflare did not know the version yet \(try 1\)/)
})

test('stage fails after three tries, and its error never reaches stdout ($GITHUB_OUTPUT)', () => {
  const run = stageWithFakeWrangler(99)
  assert.equal(run.status, 1)
  assert.equal(run.deployCalls, 3)
  assert.equal(run.stdout, '', 'error text on stdout would be written into $GITHUB_OUTPUT')
  const errorLines = run.stderr.split('\n').filter((line) => line.startsWith('::error::'))
  assert.equal(errorLines.length, 1, 'the error must be one line')
  assert.match(errorLines[0], /100146/)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: looking for terminal colour codes is the point
  assert.doesNotMatch(errorLines[0], /\u001b/, 'colour codes in the annotation')
})
