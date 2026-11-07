import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  judgeAnswer,
  judgeControl,
  liveVersion,
  overridesHeader,
  parsePairs,
  versionWithTag,
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
  assert.equal(judgeControl(200, { worker: 'run-apparel-viewer-cms', version: OLD }, 'run-apparel-viewer-cms', NEW, OLD), 'ok')
})

test('negative control: the NEW version answering without the header is caught', () => {
  // That is what an override applied to everyone (a version left at 100%) would look like.
  assert.equal(judgeControl(200, { worker: 'run-apparel-viewer-cms', version: NEW }, 'run-apparel-viewer-cms', NEW, OLD), 'wrong')
  assert.equal(judgeControl(200, { worker: 'run-apparel-viewer-cms', version: '11111111-1111-4111-8111-111111111111' }, 'run-apparel-viewer-cms', NEW, OLD), 'wrong')
  assert.equal(judgeControl(500, null, 'run-apparel-viewer-cms', NEW, OLD), 'wrong')
  assert.equal(judgeControl(403, null, 'run-apparel-viewer-cms', NEW, OLD), 'inconclusive')
})
