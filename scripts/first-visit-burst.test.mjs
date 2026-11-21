import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  BURST,
  FIRST_BYTE_P90_MS,
  judgeBurst,
  KINDS,
  MIN_ANSWERS,
  quantile,
  runVerdict,
} from './first-visit-burst.mjs'

/**
 * The first-visit guard's judge, held to the numbers production gave. The two fixtures are real:
 * the first ten answers of the 20 Nov 2026 baseline (run3, before the front door: every one slow)
 * and the first ten of 21 Nov (run6, through the door). A judge that passed the first set, or
 * failed the second, would be measuring something else.
 */
const BEFORE_THE_DOOR = [1085, 932, 1469, 1009, 1012, 1479, 949, 1498, 1504, 1467]
const THROUGH_THE_DOOR = [194, 116, 101, 49, 132, 212, 130, 103, 117, 98]

const burstOf = (timings, status = 200) =>
  Array.from({ length: BURST }, (_, i) => ({ status, firstByte: timings[i % timings.length] }))

test('the pass mark is the owner’s: the first byte under 800 ms at p90', () => {
  assert.equal(FIRST_BYTE_P90_MS, 800)
})

test('the answers measured through the front door pass', () => {
  const judged = judgeBurst(burstOf(THROUGH_THE_DOOR))
  assert.equal(judged.verdict, 'pass')
  assert.equal(judged.answered, BURST)
  assert.equal(judged.slow, 0)
  assert.equal(judged.p90, 212)
})

test('negative control: the answers measured BEFORE the door fail, on the same judge', () => {
  const judged = judgeBurst(burstOf(BEFORE_THE_DOOR))
  assert.equal(judged.verdict, 'fail')
  assert.equal(judged.slow, BURST)
  assert.match(judged.why, /is not under 800 ms/)
})

test('a slow tail fails even when the middle is fast: p90, not the median', () => {
  // 26 fast answers and 4 slow ones: the median is fast, the 27th of 30 is not.
  const rows = [...burstOf(THROUGH_THE_DOOR).slice(0, 26), ...burstOf(BEFORE_THE_DOOR).slice(0, 4)]
  const judged = judgeBurst(rows)
  assert.ok(judged.p50 < 800)
  assert.equal(judged.verdict, 'fail')
  // One slow answer in thirty is under the tail p90 reads: a pass, by the mark as written.
  const one = [...burstOf(THROUGH_THE_DOOR).slice(0, 29), { status: 200, firstByte: 1500 }]
  assert.equal(judgeBurst(one).verdict, 'pass')
})

test('exactly at the mark is a miss: "under 800 ms" means under', () => {
  assert.equal(judgeBurst(burstOf([800])).verdict, 'fail')
  assert.equal(judgeBurst(burstOf([799])).verdict, 'pass')
})

test('refusals and errors are inconclusive, never a pass and never a failed site', () => {
  for (const status of [403, 429, 503]) {
    const judged = judgeBurst(burstOf([10], status))
    assert.equal(judged.verdict, 'inconclusive', String(status))
    assert.equal(judged.refused, BURST)
  }
  const down = Array.from({ length: BURST }, () => ({ error: 'Globalping limit reached (429)' }))
  assert.equal(judgeBurst(down).verdict, 'inconclusive')
  // Too few answers to be a measurement, however fast they were.
  const few = [...burstOf([50]).slice(0, MIN_ANSWERS - 1), ...down.slice(0, 11)]
  assert.equal(judgeBurst(few).verdict, 'inconclusive')
  // Enough answers, with a few refusals among them, is judged on the answers.
  const enough = [...burstOf([50]).slice(0, MIN_ANSWERS), ...burstOf([10], 403).slice(0, 10)]
  assert.equal(judgeBurst(enough).verdict, 'pass')
})

test('negative control: a page that answers 404 or 500 fast is not a fast first visit', () => {
  assert.equal(judgeBurst(burstOf([20], 404)).verdict, 'inconclusive')
  assert.equal(judgeBurst(burstOf([20], 500)).verdict, 'inconclusive')
})

test('the run fails on a judged miss, warns on an inconclusive kind, and never fails on an unjudged one', () => {
  const k = (verdict, judged = true) => ({ kind: 'x', judged, verdict })
  assert.deepEqual(runVerdict([k('pass'), k('pass')]), { exitCode: 0, state: 'pass' })
  assert.deepEqual(runVerdict([k('pass'), k('fail')]), { exitCode: 1, state: 'fail' })
  assert.deepEqual(runVerdict([k('pass'), k('inconclusive')]), {
    exitCode: 0,
    state: 'inconclusive',
  })
  assert.deepEqual(runVerdict([k('pass'), k('fail', false)]), { exitCode: 0, state: 'pass' })
  // A judged miss is not hidden by another kind being inconclusive.
  assert.deepEqual(runVerdict([k('inconclusive'), k('fail')]), { exitCode: 1, state: 'fail' })
})

test('quantile is the nearest rank the baseline’s summary used', () => {
  assert.equal(quantile([], 0.9), null)
  assert.equal(quantile([5], 0.9), 5)
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 10)
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 6)
})

test('what is asked: the garment data, garment pages and website pages, on the hosts visitors use', () => {
  assert.deepEqual(
    KINDS.map((k) => [k.kind, k.host]),
    [
      ['garment data', 'cms.wear-run.help'],
      ['garment page', 'wear-run.com'],
      ['website page', 'wear-run.com'],
    ],
  )
  for (const kind of KINDS) {
    assert.ok(kind.paths.length >= 5, kind.kind)
    for (const path of kind.paths) assert.match(path, /^\/[a-z0-9/-]+$/, path)
  }
  // The live product is `rxps` (renames have broken two gates: .claude/rules/deploy-and-live-checks.md).
  assert.ok(KINDS[0].paths.includes('/api/public/viewer/rxps/wine'))
  assert.ok(KINDS[1].paths.includes('/products/rxps/wine'))
  // The contact page is READ here, never posted to (every live post emails the team).
  const source = readFileSync(join(import.meta.dirname, 'first-visit-burst.mjs'), 'utf8')
  assert.match(source, /request: \{ method: 'GET'/)
  assert.doesNotMatch(source, /method: 'POST',\s+path/)
})

test('it runs first in perf-watch.yml’s job: a burst after other traffic is fast for the wrong reason', () => {
  const workflow = readFileSync(
    join(import.meta.dirname, '..', '.github', 'workflows', 'perf-watch.yml'),
    'utf8',
  )
  const burst = workflow.indexOf('node scripts/first-visit-burst.mjs')
  assert.notEqual(burst, -1, 'perf-watch.yml does not run the guard')
  for (const later of [
    'node scripts/perf-probe.mjs',
    'node scripts/glb-provenance-probe.mjs',
    'node scripts/poster-sizes.mjs',
  ]) {
    assert.ok(burst < workflow.indexOf(later), `the guard must run before ${later}`)
  }
})
