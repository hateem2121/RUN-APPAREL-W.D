import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { after, test } from 'node:test'
import {
  checkKeptFiles,
  keepEarlierFiles,
  parseList,
  plan,
  refusal,
  safePath,
} from './keep-earlier-files.mjs'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-23T12:00:00Z')
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
const SHELL = '<!doctype html><title>RUN APPAREL</title><div id="root"></div>'

const scratch = mkdtempSync(join(tmpdir(), 'keep-earlier-'))
const servers = []
after(() => {
  for (const server of servers) server.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** A release folder with the given files under it. */
function release(name, files) {
  const dir = join(scratch, name)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

/**
 * Serves a folder the way production serves it. `missing: 'page'` is the viewer: a file that is
 * not there answers 200 with the page shell and the hashed files' one-year header, as
 * `/assets/index-CNj-M4ah.js` did on the live site on 23 Nov 2026. `missing: '404'` is the website.
 */
async function serve(dir, missing) {
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://x').pathname
    const file = join(dir, path)
    if (!path.includes('..') && existsSync(file) && extname(file)) {
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      })
      return response.end(readFileSync(file))
    }
    if (missing === 'page') {
      response.writeHead(200, {
        'content-type': 'text/html',
        'cache-control': 'public, max-age=31536000, immutable',
      })
      return response.end(SHELL)
    }
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    response.end('not found')
  })
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

const viewer = { prefix: '/assets/', listName: 'release-files.json' }

test('a path from the live list can never leave its folder', () => {
  assert.equal(safePath('/assets/index-BOe2iVVo.js', '/assets/'), true)
  assert.equal(safePath('/_next/static/chunks/3_y_jc6_gswl-.js', '/_next/static/'), true)
  for (const bad of [
    '/assets/../wrangler.jsonc',
    '/assets/./x.js',
    '/assets//x.js',
    '/assets/',
    '/index.html',
    '/assets/a b.js',
    '/assets/%2e%2e/x.js',
    42,
  ])
    assert.equal(safePath(bad, '/assets/'), false, String(bad))
})

test('the page shell, a broken answer and a wrong shape are not a list', () => {
  assert.equal(parseList(SHELL, '/assets/'), null)
  assert.equal(parseList('{"files":[{"path":"/assets/a.js"', '/assets/'), null)
  assert.equal(parseList('{"files":"all"}', '/assets/'), null)
  assert.equal(parseList('{"files":[{"path":"/assets/../x.js","bytes":3}]}', '/assets/'), null)
  assert.equal(parseList('{"files":[{"path":"/assets/a.js","bytes":0}]}', '/assets/'), null)
  assert.equal(
    parseList('{"files":[{"path":"/assets/a.js","bytes":3,"lastLive":"soon"}]}', '/assets/'),
    null,
  )
  assert.deepEqual(
    parseList('{"release":"abc","files":[{"path":"/assets/a.js","bytes":3}]}', '/assets/'),
    {
      release: 'abc',
      files: [{ path: '/assets/a.js', bytes: 3, lastLive: null }],
    },
  )
})

test('the plan skips what the build has, dates what was live until now, and drops what is old', () => {
  const outcome = plan({
    own: [{ path: '/assets/shared-1.js', bytes: 10 }],
    live: [
      { path: '/assets/shared-1.js', bytes: 10, lastLive: null },
      { path: '/assets/index-old.js', bytes: 20, lastLive: null },
      {
        path: '/assets/index-older.js',
        bytes: 30,
        lastLive: new Date(NOW - 6 * DAY).toISOString(),
      },
      {
        path: '/assets/index-oldest.js',
        bytes: 40,
        lastLive: new Date(NOW - 8 * DAY).toISOString(),
      },
    ],
    now: NOW,
  })
  assert.deepEqual(
    outcome.wanted.map((file) => [file.path, file.lastLive]),
    [
      ['/assets/index-old.js', new Date(NOW).toISOString()],
      ['/assets/index-older.js', new Date(NOW - 6 * DAY).toISOString()],
    ],
  )
  assert.deepEqual(outcome.tooOld, ['/assets/index-oldest.js'])
})

test('past the size cap the files longest out of use go first', () => {
  const outcome = plan({
    own: [],
    live: [
      { path: '/assets/a.js', bytes: 60, lastLive: new Date(NOW - 3 * DAY).toISOString() },
      { path: '/assets/b.js', bytes: 60, lastLive: null },
    ],
    now: NOW,
    maxKeptBytes: 100,
  })
  assert.deepEqual(
    outcome.wanted.map((file) => file.path),
    ['/assets/b.js'],
  )
  assert.deepEqual(outcome.overCap, ['/assets/a.js'])
})

test('an answer is kept only when its status, its type and its size all fit', () => {
  const file = { path: '/assets/viewer-B.js', bytes: 11 }
  assert.equal(refusal(file, { status: 200, contentType: 'text/javascript', length: 11 }), null)
  assert.match(refusal(file, { status: 200, contentType: 'text/html', length: 11 }), /a page/)
  assert.match(refusal(file, { status: 404, contentType: 'text/html', length: 9 }), /404/)
  assert.match(
    refusal(file, { status: 200, contentType: 'text/javascript', length: 12 }),
    /12 bytes/,
  )
  assert.match(refusal(file, { status: 200, contentType: 'text/plain', length: 11 }), /text\/plain/)
  // A picture or a font file has no type rule of its own; it only must not be a page.
  const media = { path: '/_next/static/media/a.avif', bytes: 5 }
  assert.equal(refusal(media, { status: 200, contentType: 'image/avif', length: 5 }), null)
  assert.match(
    refusal(media, { status: 200, contentType: 'text/html; charset=utf-8', length: 5 }),
    /a page/,
  )
})

/*
 * THE PRODUCTION FAILURE, REPLAYED: an old page after a deploy. Release 1 is live and a visitor's
 * page holds the name of its lazily loaded 3D file. Release 2 renames that file. The control
 * serves release 2 as today's deploy would and gets the page shell back under the script's name;
 * with the keep step the same request gets the script, byte for byte.
 */
test('an old page after a deploy still gets its file (control: without the step it gets the page shell)', async () => {
  const first = release('viewer-1', {
    'assets/index-AAAA.js': 'entry one',
    'assets/viewer-BBBB.js': 'three-d one',
    'index.html': SHELL,
  })
  const nothingLive = await serve(release('viewer-0', { 'index.html': SHELL }), 'page')
  const started = await keepEarlierFiles({
    dir: first,
    ...viewer,
    origin: nothingLive,
    release: 'r1',
    now: NOW - DAY,
  })
  assert.equal(started.kept.length, 0)
  assert.match(started.note, /is not a list/)
  const live = await serve(first, 'page')

  const second = () => ({
    'assets/index-CCCC.js': 'entry two',
    'assets/viewer-DDDD.js': 'three-d two',
    'index.html': SHELL,
  })
  const oldPageAsks = async (origin) => {
    const response = await fetch(`${origin}/assets/viewer-BBBB.js`)
    return [response.status, response.headers.get('content-type'), await response.text()]
  }

  // CONTROL: release 2 as it is deployed today.
  const bare = await serve(release('viewer-2-bare', second()), 'page')
  assert.deepEqual(await oldPageAsks(bare), [200, 'text/html', SHELL])

  // WITH THE STEP.
  const kept = release('viewer-2', second())
  const result = await keepEarlierFiles({
    dir: kept,
    ...viewer,
    origin: live,
    release: 'r2',
    now: NOW,
  })
  assert.deepEqual(
    result.kept.map((file) => file.path),
    ['/assets/index-AAAA.js', '/assets/viewer-BBBB.js'],
  )
  assert.deepEqual(result.refused, [])
  const after2 = await serve(kept, 'page')
  assert.deepEqual(await oldPageAsks(after2), [200, 'text/javascript', 'three-d one'])
  assert.equal(result.list.release, 'r2')
  assert.deepEqual(
    result.list.files.map((file) => [file.path, file.lastLive]),
    [
      ['/assets/index-CCCC.js', null],
      ['/assets/viewer-DDDD.js', null],
      ['/assets/index-AAAA.js', new Date(NOW).toISOString()],
      ['/assets/viewer-BBBB.js', new Date(NOW).toISOString()],
    ],
  )

  // The check after the deploy agrees, and says so when a kept file is gone or the list is another release's.
  const saved = { ...viewer, list: result.list }
  assert.deepEqual(await checkKeptFiles({ saved, origin: after2 }), [])
  assert.deepEqual(await checkKeptFiles({ saved, origin: bare }), [
    '/assets/index-AAAA.js answered with a page (text/html), not the file',
    '/assets/viewer-BBBB.js answered with a page (text/html), not the file',
    `${bare}/assets/release-files.json is not a list (200 text/html)`,
  ])
  const other = { ...viewer, list: { ...result.list, release: 'r9' } }
  assert.deepEqual(await checkKeptFiles({ saved: other, origin: after2 }), [
    `${after2}/assets/release-files.json names release r2, not r9`,
  ])

  // Release 3, two days on: release 1's files are still carried, with the day they were LAST live.
  const third = release('viewer-3', { 'assets/index-EEEE.js': 'entry three', 'index.html': SHELL })
  const later = await keepEarlierFiles({
    dir: third,
    ...viewer,
    origin: after2,
    release: 'r3',
    now: NOW + 2 * DAY,
  })
  const lastLive = Object.fromEntries(later.kept.map((file) => [file.path, file.lastLive]))
  assert.equal(lastLive['/assets/viewer-BBBB.js'], new Date(NOW).toISOString())
  assert.equal(lastLive['/assets/viewer-DDDD.js'], new Date(NOW + 2 * DAY).toISOString())

  // Release 4, eight days after release 1 left: its files are let go, release 2's are not yet.
  const fourth = release('viewer-4', { 'assets/index-FFFF.js': 'entry four', 'index.html': SHELL })
  const after3 = await serve(third, 'page')
  const muchLater = await keepEarlierFiles({
    dir: fourth,
    ...viewer,
    origin: after3,
    release: 'r4',
    now: NOW + 8 * DAY,
  })
  assert.deepEqual(muchLater.tooOld, ['/assets/index-AAAA.js', '/assets/viewer-BBBB.js'])
  assert.equal(existsSync(join(fourth, 'assets/viewer-BBBB.js')), false)
  assert.equal(existsSync(join(fourth, 'assets/viewer-DDDD.js')), true)
})

/*
 * PLANTED FAULT: the live list names a file the live site no longer has, so the viewer answers
 * 200 with the page shell. Keeping it would save HTML as `viewer-GONE.js` for a week.
 */
test('the page shell answered under a script name is refused and never written', async () => {
  const liveDir = release('viewer-fault-live', {
    'assets/index-AAAA.js': 'entry one',
    'assets/release-files.json': JSON.stringify({
      release: 'r1',
      files: [
        { path: '/assets/index-AAAA.js', bytes: 9, lastLive: null },
        { path: '/assets/viewer-GONE.js', bytes: SHELL.length, lastLive: null },
        { path: '/assets/index-SIZE.js', bytes: 4, lastLive: null },
      ],
    }),
    'assets/index-SIZE.js': 'five!',
  })
  const next = release('viewer-fault-next', { 'assets/index-CCCC.js': 'entry two' })
  const result = await keepEarlierFiles({
    dir: next,
    ...viewer,
    origin: await serve(liveDir, 'page'),
    now: NOW,
  })
  assert.deepEqual(
    result.kept.map((file) => file.path),
    ['/assets/index-AAAA.js'],
  )
  assert.deepEqual(result.refused.sort(), [
    '/assets/index-SIZE.js is 5 bytes, the list says 4',
    '/assets/viewer-GONE.js answered with a page (text/html), not the file',
  ])
  assert.equal(existsSync(join(next, 'assets/viewer-GONE.js')), false)
  assert.equal(existsSync(join(next, 'assets/index-SIZE.js')), false)
})

test('the website keeps nested files, and a 404 for its list keeps nothing and stops nothing', async () => {
  const site = { prefix: '/_next/static/', listName: 'release-files.whole.json' }
  const first = release('site-1', {
    '_next/static/chunks/0la5u2-qn7xuu.js': 'chunk one',
    '_next/static/chunks/37olm_ng060c5.css': 'style one',
    '_next/static/build1/_buildManifest.js': 'manifest one',
  })
  const empty = await serve(release('site-0', { 'robots.txt': 'x' }), '404')
  const started = await keepEarlierFiles({
    dir: first,
    ...site,
    origin: empty,
    release: 's1',
    now: NOW - DAY,
  })
  assert.match(started.note, /answered 404/)
  assert.equal(started.own, 3)

  const second = release('site-2', { '_next/static/chunks/1y67n4h2v3yyq.js': 'chunk two' })
  const result = await keepEarlierFiles({
    dir: second,
    ...site,
    origin: await serve(first, '404'),
    release: 's2',
    now: NOW,
  })
  assert.equal(result.kept.length, 3)
  assert.equal(
    readFileSync(join(second, '_next/static/chunks/37olm_ng060c5.css'), 'utf8'),
    'style one',
  )
  assert.equal(
    readFileSync(join(second, '_next/static/build1/_buildManifest.js'), 'utf8'),
    'manifest one',
  )
})

test('a live site that cannot be reached keeps nothing, writes the list and does not throw', async () => {
  const dir = release('viewer-offline', { 'assets/index-AAAA.js': 'entry one' })
  const result = await keepEarlierFiles({ dir, ...viewer, origin: 'http://127.0.0.1:9', now: NOW })
  assert.match(result.note, /could not be read/)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'assets/release-files.json'), 'utf8')).files, [
    { path: '/assets/index-AAAA.js', bytes: 9, lastLive: null },
  ])
})
