import assert from 'node:assert/strict'
import { test } from 'node:test'
import { outcomes } from './e2e-outcomes.mjs'
import { HOSTS, offersEch, render, summariseOutcomes, summariseRuns } from './gate-health.mjs'

/**
 * scripts/gate-health.mjs writes the weekly issue. Each finding it can raise is planted here and
 * must appear, and the same week without the plant must stay quiet: a report that cannot fail is
 * the thing it exists to replace.
 */

const run = (id, event, conclusion, startedAt, minutesLong, extra = {}) => ({
  id,
  event,
  conclusion,
  created_at: startedAt,
  run_started_at: startedAt,
  updated_at: new Date(Date.parse(startedAt) + minutesLong * 60000).toISOString(),
  ...extra,
})
const job = (name, conclusion, completedAt) => ({ name, conclusion, completed_at: completedAt })
const T = '2026-11-27T08:00:00Z'
const after = (min) => new Date(Date.parse(T) + min * 60000).toISOString()

/** A quiet week: two green pull requests, one merge that skipped on proof and deployed. */
function quietWeek() {
  return [
    { run: run(1, 'pull_request', 'success', T, 11) },
    { run: run(2, 'pull_request', 'success', T, 15) },
    {
      run: run(3, 'push', 'success', T, 18),
      jobs: [
        job('e2e (the unexpanded matrix name)', 'skipped', T),
        job('e2e', 'success', after(1)),
        job('verify', 'success', after(6)),
        job('deploy', 'success', after(12)),
      ],
    },
  ]
}
const echOff = HOSTS.map((host) => ({ host, resolver: 'r', offers: false }))
const week = (entries, ech = echOff, files = []) =>
  render({
    runs: summariseRuns(entries),
    outcomes: summariseOutcomes(files),
    ech,
    from: '2026-11-20',
    to: '2026-11-27',
  })

test('a quiet week says so, with its numbers', () => {
  const body = week(quietWeek())
  assert.match(body, /## Nothing needs attention/)
  assert.match(body, /Pull request checks, median \(2 green runs\) \| 13\.0 min \| 21\.3 min/)
  assert.match(body, /Merge until live, median \(1 deploys\) \| 12\.0 min \| 33\.9 min/)
  assert.match(body, /of which 1 skipped the browser tests/)
  assert.match(body, /Off for all 4 hostnames/)
})

test('a re-run is timed from when it began, not from the first attempt', () => {
  const entries = quietWeek()
  entries[2].run.created_at = '2026-11-26T18:00:00Z'
  assert.equal(summariseRuns(entries).main.medianToLiveMin, 12)
})

test('planted: ECH offered again for one hostname is the first finding', () => {
  const ech = echOff.map((e) => (e.host === 'media.wear-run.com' ? { ...e, offers: true } : e))
  const body = week(quietWeek(), ech)
  assert.match(body, /## Look at this/)
  assert.match(body, /Encrypted Client Hello is offered again\*\* for media\.wear-run\.com/)
  assert.match(body, /Offered for: media\.wear-run\.com/)
})

test('a resolver that did not answer is "not checked", never "off"', () => {
  const none = HOSTS.map((host) => ({ host, resolver: 'r', offers: null }))
  const body = week(quietWeek(), none)
  assert.match(body, /No resolver answered, so this was not checked/)
  assert.doesNotMatch(body, /Off for all/)
  const some = [...echOff, { host: HOSTS[0], resolver: 'r2', offers: null }]
  assert.match(week(quietWeek(), some), /1 of 5 lookups got no answer/)
})

test('reading a DNS answer: with ECH, without, unparsed, and unreadable', () => {
  const answer = (data) => ({ Status: 0, Answer: [{ type: 65, data }] })
  assert.equal(offersEch(answer('1 . alpn=h3,h2 ipv4hint=104.21.72.189')), false)
  assert.equal(offersEch(answer('1 . alpn=h2 ech=AEX+DQBB0wAgACAg ipv6hint=2606:4700::1')), true)
  // A resolver that does not parse the record returns hex; the name inside it is the tell.
  assert.equal(
    offersEch(answer('\\# 133 00010000 0500470045FE0D 636C6F7564666C6172652D 6563682E636F6D 0000')),
    true,
  )
  assert.equal(offersEch({ Status: 0 }), false)
  assert.equal(offersEch({ Status: 2 }), null)
  assert.equal(offersEch({ Status: 0, Answer: 'nope' }), null)
  assert.equal(offersEch(null), null)
})

test('planted: the 27 Nov fault, tests skipped on proof and nothing deployed all week', () => {
  const entries = quietWeek()
  entries[2].jobs[3] = job('deploy', 'skipped', after(6))
  const body = week(entries)
  assert.match(body, /Merges passed their tests and nothing deployed all week\*\* \(runs 3;/)
  assert.match(body, /Merge until live, median \(0 deploys\) \| none/)
})

test('a docs-only merge beside a real deploy is not a finding', () => {
  const entries = quietWeek()
  entries.push({
    run: run(4, 'push', 'success', T, 6),
    jobs: [
      job('e2e (the unexpanded matrix name)', 'skipped', T),
      job('e2e', 'success', after(1)),
      job('deploy', 'skipped', after(6)),
    ],
  })
  assert.match(week(entries), /## Nothing needs attention/)
})

test('failed pull requests are counted by gate, the browser-test machines as one', () => {
  const entries = quietWeek()
  entries.push({
    run: run(5, 'pull_request', 'failure', T, 14),
    jobs: [
      job('e2e (site webkit 1/2)', 'failure', T),
      job('e2e (site webkit 2/2)', 'failure', T),
      job('e2e', 'failure', T),
      job('verify', 'success', T),
    ],
  })
  entries.push({
    run: run(6, 'pull_request', 'failure', T, 9),
    jobs: [job('verify', 'failure', T)],
  })
  // Since the split of 28 Nov 2026 a failed half fails the verdict job too: one gate, named by its half.
  entries.push({
    run: run(8, 'pull_request', 'failure', T, 9),
    jobs: [
      job('verify-build', 'failure', T),
      job('verify-tests', 'success', T),
      job('verify', 'failure', T),
    ],
  })
  entries.push({ run: run(7, 'pull_request', 'cancelled', T, 2) })
  const summary = summariseRuns(entries)
  assert.deepEqual(summary.pulls.failedBy, { 'browser tests': 1, verify: 1, 'verify-build': 1 })
  assert.equal(summary.pulls.cancelled, 1)
  // A failed or cancelled run does not pull the median: it is the time a green check takes.
  assert.equal(summary.pulls.medianMin, 13)
})

const flakyFile = (suite, title, status = 'flaky') => ({
  suite,
  tests: [{ status, project: 'webkit', file: 'languageNote.spec.ts', title }],
})

test('planted: a test that needed its retry in two runs is a finding; once is only listed', () => {
  const once = week(quietWeek(), echOff, [flakyFile('site', 'moves nothing')])
  assert.match(once, /## Nothing needs attention/)
  assert.match(once, /`site · webkit · languageNote\.spec\.ts › moves nothing` \| 1 \| 0 \|/)
  const twice = week(quietWeek(), echOff, [
    flakyFile('site', 'moves nothing'),
    flakyFile('site', 'moves nothing', 'unexpected'),
    flakyFile('viewer', 'moves nothing'),
  ])
  assert.match(twice, /\*\*1 browser test failed or needed a retry in two or more runs/)
  assert.match(twice, /`site · webkit · languageNote\.spec\.ts › moves nothing` \| 1 \| 1 \|/)
})

test('no report at all is "not checked", never "none"', () => {
  assert.match(week(quietWeek()), /No report was found for this week, so this was not checked/)
  assert.match(week(quietWeek(), echOff, [{ suite: 'site', tests: [] }]), /None, in 1 reports/)
})

test('planted: a hostile test name reaches the issue as inert code text', () => {
  const hostile =
    'x | y <img src=x onerror=1> [click](https://evil.example) @someone #1 `tick` **bold** _it_ ![i](u)\n## Heading\n- [ ] task'
  const body = week(quietWeek(), echOff, [flakyFile('site', hostile)])
  const rows = body.split('\n').filter((line) => line.includes('languageNote.spec.ts'))
  // One row: a line break in a name cannot start a heading or a task list of its own.
  assert.equal(rows.length, 1)
  assert.doesNotMatch(body, /^## Heading/m)
  const [row] = rows
  // Four pipes: the table's own. One code span: the name cannot close it and start another.
  assert.equal(row.split('|').length, 5)
  assert.equal(row.split('`').length, 3)
  const name = row.split('`')[1]
  assert.doesNotMatch(name, /[<>[\]@#*_!|`\n]/)
  assert.match(name, /evil\.example/) // kept as plain words inside the code span, not a link
})

test('a name made only of marks still fills its cell', () => {
  const body = week(quietWeek(), echOff, [
    { suite: '@@', tests: [{ status: 'flaky', project: '##', file: '**', title: '__' }] },
  ])
  assert.match(body, /\| `· · ›` \| 1 \| 0 \|/)
})

/** scripts/e2e-outcomes.mjs: Playwright's JSON report down to the tests that did not simply pass. */
const report = (stats) => ({
  stats: { expected: 3, skipped: 1, unexpected: 0, flaky: 0, ...stats },
  suites: [
    {
      title: 'a.spec.ts',
      file: 'a.spec.ts',
      specs: [
        { title: 'top', file: 'a.spec.ts', tests: [{ projectName: 'webkit', status: 'expected' }] },
      ],
      suites: [
        {
          title: 'a group',
          specs: [
            {
              title: 'needs a retry',
              file: 'a.spec.ts',
              tests: [{ projectName: 'webkit', status: 'flaky' }],
            },
            {
              title: 'is skipped',
              file: 'a.spec.ts',
              tests: [{ projectName: 'webkit', status: 'skipped' }],
            },
          ],
          suites: [
            {
              title: 'deeper',
              specs: [
                {
                  title: 'fails',
                  file: 'a.spec.ts',
                  tests: [{ projectName: 'firefox', status: 'unexpected' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
})

test('outcomes: flaky and failed tests are named with their group path, at any depth', () => {
  const result = outcomes(report({ flaky: 1, unexpected: 1 }), 'site')
  assert.deepEqual(result.tests, [
    { status: 'flaky', project: 'webkit', file: 'a.spec.ts', title: 'a group › needs a retry' },
    {
      status: 'unexpected',
      project: 'firefox',
      file: 'a.spec.ts',
      title: 'a group › deeper › fails',
    },
  ])
  assert.deepEqual(result.stats, { expected: 3, skipped: 1, unexpected: 1, flaky: 1 })
})

test('outcomes: a list that disagrees with the totals is an error, not a short list', () => {
  assert.throws(() => outcomes(report({ flaky: 2, unexpected: 1 }), 'site'), /totals say 2 and 1/)
  assert.throws(() => outcomes({ suites: [] }, 'site'), /not a Playwright JSON report/)
  assert.throws(() => outcomes(report({ flaky: undefined }), 'site'), /no "flaky" total/)
})
