import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import {
  classify,
  confirm,
  GUIDE_FILES,
  issueBody,
  parseSources,
  planChecks,
  toHtml,
} from './guide-source-links.mjs'

const TODAY = '2026-11-16'

const SAMPLE = `
export const GUIDES = [
  {
    path: '/guides/one',
    sections: [{ links: [{ url: '/not-a-source' }] }],
    sources: [
      { name: 'A', url: 'https://a.example.org/x', date: '2026-11-05', kind: 'read' },
      {
        name: 'B',
        url: 'https://oeil.europarl.europa.eu/x?reference=2023/0085(COD)',
        date: '2026-11-05',
        kind: 'read',
      },
    ],
  },
  {
    path: '/guides/two',
    sections: [{ url: 'https://not-a-source.example/' }],
    sources: [
      {
        name: 'C',
        url: "https://c.example.org/it's",
        date: '2026-11-05',
        kind: 'read',
      },
    ],
  },
]
`

test('parseSources reads only the sources list of each guide, with the guide that cites it', () => {
  assert.deepEqual(parseSources(SAMPLE), [
    { url: 'https://a.example.org/x', guide: '/guides/one' },
    { url: 'https://oeil.europarl.europa.eu/x?reference=2023/0085(COD)', guide: '/guides/one' },
    { url: "https://c.example.org/it's", guide: '/guides/two' },
  ])
})

test('the real guide files yield a few hundred addresses, each tied to a guide', () => {
  const all = GUIDE_FILES.flatMap((f) => parseSources(readFileSync(f, 'utf8')))
  assert.ok(all.length > 400, `only ${all.length} citations read`)
  assert.ok(all.every((s) => s.guide.startsWith('/guides/') && /^https?:\/\//.test(s.url)))
})

test('planChecks sets apart a blocked host and its subdomains, not a look-alike', () => {
  const config = { blockedHosts: [{ host: 'ftc.gov', reason: 'x' }] }
  const sources = [
    'https://www.ftc.gov/a',
    'https://ftc.gov/b',
    'https://notftc.gov/c',
    'https://ftc.gov.evil.example/d',
  ].map((url) => ({ url, guide: '/guides/g' }))
  const { toCheck, skipped } = planChecks(sources, config)
  assert.deepEqual(
    skipped.map((s) => s.url),
    ['https://www.ftc.gov/a', 'https://ftc.gov/b'],
  )
  assert.equal(toCheck.length, 2)
})

test('toHtml keeps brackets and ampersands exactly', () => {
  const html = toHtml(['https://x.example/a?b=1&c=2(COD)', 'https://x.example/a?b=1&c=2(COD)'])
  assert.equal(html, '<a href="https://x.example/a?b=1&amp;c=2(COD)">source</a>\n')
})

/** A lychee report shaped like the real one (0.24.2, measured 2026-11-15). */
const entry = (url, status) => ({ url, status, span: { line: 1, column: 1 } })
const report = (errors, extra = {}) => ({
  total: 10,
  error_map: { 'guide-sources.html': errors },
  timeout_map: {},
  excluded_map: {},
  ...extra,
})
const SOURCES = Array.from({ length: 10 }, (_, i) => ({
  url: `https://s${i}.example.org/`,
  guide: '/guides/g',
}))
const u = (i) => `https://s${i}.example.org/`

test('NEGATIVE CONTROL, way 1: a 404, a 410, a 500, a TLS failure and a timeout are all reported', () => {
  const verdict = classify(
    report(
      [
        entry(u(0), { text: 'Rejected status code: 404 Not Found', code: 404 }),
        entry(u(1), { text: 'Rejected status code: 410 Gone', code: 410 }),
        entry(u(2), { text: 'Rejected status code: 500', code: 500 }),
        entry(u(3), {
          text: 'Network error: SSL certificate expired.',
          details: 'SSL certificate expired',
        }),
        entry(u(4), { text: 'Network error: dns error', details: 'failed to lookup address' }),
      ],
      { timeout_map: { 'guide-sources.html': [entry(u(5), { text: 'Timeout' })] } },
    ),
    SOURCES,
    {},
    TODAY,
  )
  assert.deepEqual(verdict.broken.map((b) => b.url).sort(), [0, 1, 2, 3, 4, 5].map(u))
  assert.match(issueBody(verdict, TODAY), /HTTP 404/)
  assert.match(issueBody(verdict, TODAY), /cited by `\/guides\/g`/)
})

test('NEGATIVE CONTROL, way 2: a 403, a 429 and an accepted address are NOT reported', () => {
  const verdict = classify(
    report([
      entry(u(0), { text: 'Rejected status code: 403 Forbidden', code: 403 }),
      entry(u(1), { text: 'Rejected status code: 429', code: 429 }),
      entry(u(2), { text: 'Network error: SSL certificate expired.' }),
    ]),
    SOURCES,
    { knownBroken: [{ url: u(2), until: '2026-12-15', reason: 'expired certificate' }] },
    TODAY,
  )
  assert.deepEqual(verdict.broken, [])
  assert.equal(verdict.blocked.length, 2)
  assert.equal(verdict.accepted.length, 1)
  assert.equal(issueBody(verdict, TODAY), '')
})

test('an accepted address is reported again the day after its date', () => {
  const config = { knownBroken: [{ url: u(2), until: '2026-11-15', reason: 'r' }] }
  const verdict = classify(
    report([entry(u(2), { text: 'Rejected status code: 404', code: 404 })]),
    SOURCES,
    config,
    TODAY,
  )
  assert.equal(verdict.broken.length, 1)
  assert.match(issueBody(verdict, TODAY), /accepted-until date 2026-11-15 has passed/)
})

test('a run that checked nothing, or garbage, cannot pass as clean', () => {
  assert.throws(
    () => classify(report([], { total: 0 }), SOURCES, {}, TODAY),
    /nothing was verified/,
  )
  assert.throws(() => classify(report([], { total: 3 }), SOURCES, {}, TODAY), /3 of 10/)
  assert.throws(() => classify({}, SOURCES, {}, TODAY), /unreadable/)
  assert.throws(() => classify(null, SOURCES, {}, TODAY), /unreadable/)
})

test('text from outside cannot break the issue into extra lines', () => {
  const verdict = classify(
    report([entry(u(0), { text: 'x', details: 'bad\n- <https://evil.example> injected\u0000' })]),
    SOURCES,
    {},
    TODAY,
  )
  const line = issueBody(verdict, TODAY)
    .split('\n')
    .find((l) => l.includes(u(0)))
  assert.ok(line?.includes('bad - <https://evil.example> injected'))
})

test('a break is reported only when the second look fails too', () => {
  const first = classify(
    report([
      entry(u(0), { text: 'Rejected status code: 500', code: 500 }),
      entry(u(1), { text: 'Rejected status code: 404', code: 404 }),
      entry(u(2), { text: 'Network error: connection reset' }),
    ]),
    SOURCES,
    {},
    TODAY,
  )
  const again = SOURCES.slice(0, 3)
  // u(0) loads the second time, u(1) is still gone, u(2) now answers 403 (a refusal, not a break).
  const second = classify(
    {
      total: 3,
      error_map: {
        x: [
          entry(u(1), { text: 'Rejected status code: 404', code: 404 }),
          entry(u(2), { text: 'Rejected status code: 403', code: 403 }),
        ],
      },
    },
    again,
    {},
    TODAY,
  )
  const verdict = confirm(first, second)
  assert.deepEqual(
    verdict.broken.map((b) => b.url),
    [u(1)],
  )
  assert.deepEqual(verdict.recovered.map((b) => b.url).sort(), [u(0), u(2)])
})

/** The same two ways against a real lychee and a real local server, when lychee is installed. */
function lycheeOrNull() {
  try {
    execFileSync('lychee', ['--version'], { stdio: 'ignore' })
    return 'lychee'
  } catch {
    return null
  }
}

test('END TO END with lychee against a local server: 404 and 500 reported; 403, 429 and 200 not', async (t) => {
  if (!lycheeOrNull()) return t.skip('lychee is not installed here; CI installs it')
  const answers = { '/gone': 404, '/boom': 500, '/robots': 403, '/slow-down': 429, '/fine': 200 }
  const server = createServer((req, res) => {
    res.statusCode = answers[req.url] ?? 404
    res.end('x')
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  const dir = mkdtempSync(join(tmpdir(), 'gsl-'))
  try {
    const urls = Object.keys(answers).map((p) => `${base}${p}`)
    const page = join(dir, 'guide-sources.html')
    writeFileSync(page, toHtml(urls))
    // Async on purpose: a blocking call would freeze this process's own server and every request would time out.
    let out = ''
    try {
      out = (
        await promisify(execFile)(
          'lychee',
          ['--format', 'json', '--max-retries', '0', '--timeout', '10', '--no-progress', page],
          { encoding: 'utf8' },
        )
      ).stdout
    } catch (error) {
      out = error.stdout // lychee exits 2 when it finds errors; the report is still on stdout
    }
    const sources = urls.map((url) => ({ url, guide: '/guides/g' }))
    const verdict = classify(JSON.parse(out), sources, {}, TODAY)
    assert.deepEqual(verdict.broken.map((b) => b.url.replace(base, '')).sort(), ['/boom', '/gone'])
    assert.deepEqual(verdict.blocked.map((b) => b.url.replace(base, '')).sort(), [
      '/robots',
      '/slow-down',
    ])
  } finally {
    server.close()
  }
})

// The first live issue (#394, 2026-11-15) signed itself "guide-source-links.yml", a workflow that does
// not exist (it is guide-sources.yml), and said "1 are accepted". Whoever reads the issue follows that
// name to the workflow, so it must be a real file.
test('the issue names the workflow that opens it, and counts in plain grammar', () => {
  const verdict = {
    total: 3,
    blocked: [],
    accepted: [{ url: 'https://accepted.example/x' }],
    broken: [{ url: 'https://gone.example/x', reason: 'HTTP 404', guides: ['/guides/g'] }],
  }
  const body = issueBody(verdict, TODAY)
  const named = body.match(/_Opened by ([\w.-]+\.yml)/)?.[1]
  assert.ok(
    named && existsSync(join(import.meta.dirname, '..', '.github', 'workflows', named)),
    `the issue says it was opened by ${named}, which is not a workflow in .github/workflows`,
  )
  assert.match(body, /\b1 is accepted\b/)
  assert.match(issueBody({ ...verdict, accepted: [{}, {}] }, TODAY), /\b2 are accepted\b/)
})
