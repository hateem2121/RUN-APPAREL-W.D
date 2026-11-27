import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { alreadyTested, verdict } from './ci-already-tested.mjs'
import { jobBlocks, jobNeeds } from './check-required-checks.mjs'

/**
 * scripts/ci-already-tested.mjs lets a push to `main` skip the browser tests. A wrong `proven`
 * ships pages no browser opened, so each condition has its own control here: the good case is
 * proven, and the same records with ONE thing wrong are not.
 */

const REPO = 'owner/repo'
const SHA = 'a'.repeat(40)
const PARENT = 'b'.repeat(40)
const HEAD = 'c'.repeat(40)
const TREE = 'd'.repeat(40)

/** GitHub's records for a pull request that was up to date, tested green and squash-merged. */
function goodRecords() {
  return {
    [`commits/${SHA}/pulls?per_page=100`]: [
      {
        number: 7,
        merged_at: '2026-11-27T05:40:00Z',
        merge_commit_sha: SHA,
        base: { ref: 'main' },
        head: { sha: HEAD, repo: { full_name: REPO } },
      },
    ],
    [`git/commits/${SHA}`]: { tree: { sha: TREE }, parents: [{ sha: PARENT }] },
    [`git/commits/${HEAD}`]: { tree: { sha: TREE }, parents: [{ sha: PARENT }] },
    [`compare/${PARENT}...${HEAD}`]: { behind_by: 0, ahead_by: 1 },
    [`actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=100`]: {
      workflow_runs: [{ id: 11, head_sha: HEAD, conclusion: 'success' }],
    },
    'actions/runs/11/jobs?filter=latest&per_page=100': {
      total_count: 4,
      jobs: [
        { name: 'verify', conclusion: 'success' },
        { name: 'e2e (viewer chromium 1/2)', conclusion: 'success' },
        { name: 'e2e (site webkit 1/2)', conclusion: 'success' },
        { name: 'e2e', conclusion: 'success' },
      ],
    },
  }
}

function fakeFetch(records) {
  const asked = []
  const fetchImpl = async (url) => {
    const path = String(url).replace(`https://api.github.com/repos/${REPO}/`, '')
    asked.push(path)
    if (!(path in records)) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => records[path] }
  }
  return { fetchImpl, asked }
}

const ask = (records, over = {}) =>
  alreadyTested({
    eventName: 'push',
    ref: 'refs/heads/main',
    sha: SHA,
    repository: REPO,
    token: 't',
    fetchImpl: fakeFetch(records).fetchImpl,
    ...over,
  })

test('proven: the same files passed on the pull request', async () => {
  const result = await ask(goodRecords())
  assert.equal(result.proven, true)
  assert.match(result.reason, /#7: run 11 passed 2 browser-test machines/)
})

test('a pull request, a by-hand run and another branch always test', async () => {
  for (const over of [
    { eventName: 'pull_request' },
    { eventName: 'workflow_dispatch' },
    { ref: 'refs/heads/other' },
    { token: '' },
  ]) {
    const { fetchImpl, asked } = fakeFetch(goodRecords())
    const result = await ask(goodRecords(), { ...over, fetchImpl })
    assert.equal(result.proven, false, JSON.stringify(over))
    assert.deepEqual(asked, [], 'nothing is asked of GitHub')
  }
})

/** Each entry breaks exactly one condition of the good records. */
const CONTROLS = {
  'no pull request names the commit': (r) => {
    r[`commits/${SHA}/pulls?per_page=100`] = []
  },
  'two pull requests name the commit': (r) => {
    const key = `commits/${SHA}/pulls?per_page=100`
    r[key] = [r[key][0], { ...r[key][0], number: 8 }]
  },
  'the pull request was not merged': (r) => {
    r[`commits/${SHA}/pulls?per_page=100`][0].merged_at = null
  },
  'its merge commit is another commit': (r) => {
    r[`commits/${SHA}/pulls?per_page=100`][0].merge_commit_sha = 'e'.repeat(40)
  },
  'it came from another repository': (r) => {
    r[`commits/${SHA}/pulls?per_page=100`][0].head.repo.full_name = 'someone/fork'
  },
  'the files differ': (r) => {
    r[`git/commits/${HEAD}`].tree.sha = 'f'.repeat(40)
  },
  'the commit is a merge of two parents': (r) => {
    r[`git/commits/${SHA}`].parents.push({ sha: HEAD })
  },
  'the head did not hold the newest main': (r) => {
    r[`compare/${PARENT}...${HEAD}`].behind_by = 1
  },
  'the pull-request run failed': (r) => {
    r[
      `actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=100`
    ].workflow_runs[0].conclusion = 'failure'
  },
  'the run was for another commit': (r) => {
    r[
      `actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=100`
    ].workflow_runs[0].head_sha = 'e'.repeat(40)
  },
  'one shard failed': (r) => {
    r['actions/runs/11/jobs?filter=latest&per_page=100'].jobs[2].conclusion = 'failure'
  },
  'one shard was skipped': (r) => {
    r['actions/runs/11/jobs?filter=latest&per_page=100'].jobs[1].conclusion = 'skipped'
  },
  'no shard ran at all': (r) => {
    const page = r['actions/runs/11/jobs?filter=latest&per_page=100']
    page.jobs = page.jobs.filter((job) => !job.name.startsWith('e2e ('))
    page.total_count = page.jobs.length
  },
  'the e2e job did not succeed': (r) => {
    r['actions/runs/11/jobs?filter=latest&per_page=100'].jobs[3].conclusion = 'skipped'
  },
  'the job list was cut short': (r) => {
    r['actions/runs/11/jobs?filter=latest&per_page=100'].total_count = 120
  },
  'GitHub does not answer': (r) => {
    delete r[`compare/${PARENT}...${HEAD}`]
  },
}

for (const [name, breakIt] of Object.entries(CONTROLS)) {
  test(`not proven when ${name}`, async () => {
    const records = goodRecords()
    breakIt(records)
    const result = await ask(records)
    assert.equal(result.proven, false, result.reason)
  })
}

test('a failed run does not hide a later green one on the same head', async () => {
  const records = goodRecords()
  records[
    `actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=100`
  ].workflow_runs.unshift({ id: 10, head_sha: HEAD, conclusion: 'failure' })
  assert.equal((await ask(records)).proven, true)
})

test('the gate: passes on green shards, or on skipped shards WITH the proof', () => {
  assert.equal(verdict({ shards: 'success', changes: 'success', browserTests: 'run' }).ok, true)
  assert.equal(verdict({ shards: 'skipped', changes: 'success', browserTests: 'proven' }).ok, true)
})

test('the gate: every other way of not running fails', () => {
  for (const results of [
    { shards: 'skipped', changes: 'success', browserTests: 'run' },
    { shards: 'skipped', changes: 'success', browserTests: '' },
    { shards: 'skipped', changes: 'failure', browserTests: 'proven' },
    { shards: 'skipped', changes: 'skipped', browserTests: 'proven' },
    { shards: 'failure', changes: 'success', browserTests: 'proven' },
    { shards: 'cancelled', changes: 'success', browserTests: 'proven' },
    { shards: '', changes: '', browserTests: '' },
    {},
  ]) {
    assert.equal(verdict(results).ok, false, JSON.stringify(results))
  }
})

/**
 * A JOB DOWNSTREAM OF THE SHARDS MUST NAME EVERY NEED'S RESULT (27 Nov 2026). `e2e-shard` may be
 * skipped on proof, and GitHub skips every job further down the chain unless its `if:` replaces
 * the unwritten `success()`: the merge of #494 passed `e2e` and then skipped `deploy` (run
 * 45959048828). With `!cancelled()` in its place each need must be named, or a red gate deploys.
 */
// The opening of a GitHub expression, spelled apart so that no string here reads as a template.
const OPEN = '$' + '{{'

function unguardedJobs(source) {
  const blocks = jobBlocks(source)
  const downstream = new Set(['e2e-shard'])
  for (let grew = true; grew; ) {
    grew = false
    for (const [id, text] of blocks) {
      if (!downstream.has(id) && jobNeeds(text).some((need) => downstream.has(need))) {
        downstream.add(id)
        grew = true
      }
    }
  }
  const problems = []
  for (const id of downstream) {
    // `e2e-shard` is the job that skips; `e2e` decides with `verdict` above, not with an `if:`.
    if (id === 'e2e-shard' || id === 'e2e') continue
    const text = blocks.get(id) ?? ''
    const condition = (text.match(/^ {4}if:[ \t]*(>-\n(?: {6}.*\n?)+|.*)/m)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    )
    if (!condition.includes('!cancelled()')) problems.push(`${id}: no !cancelled()`)
    for (const need of jobNeeds(text)) {
      if (!condition.includes(`needs.${need}.result == 'success'`)) {
        problems.push(`${id}: does not check needs.${need}.result`)
      }
    }
  }
  return problems
}

test('ci.yml: every job downstream of the shards names each need it waits for', () => {
  const source = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.deepEqual(unguardedJobs(source), [])
  // The check found jobs to judge: an empty list from an unparsed file would prove nothing.
  assert.ok(jobBlocks(source).has('deploy') && jobBlocks(source).has('deploy-shrink'))
})

test('control: the conditions that skipped the deploy on 27 Nov are reported', () => {
  const shape = (deployIf) => `jobs:
  changes:
    runs-on: x
  e2e-shard:
    needs: [changes]
    if: needs.changes.outputs.browser_tests != 'proven'
  e2e:
    needs: [e2e-shard, changes]
    if: \${{ !cancelled() }}
  deploy:
    needs: [e2e, changes]
${deployIf}
`
  assert.deepEqual(unguardedJobs(shape("    if: github.ref == 'refs/heads/main'")), [
    'deploy: no !cancelled()',
    'deploy: does not check needs.e2e.result',
    'deploy: does not check needs.changes.result',
  ])
  // One need left out of an otherwise right condition is still reported.
  assert.deepEqual(
    unguardedJobs(
      shape(
        '    if: >-\n      ' +
          OPEN +
          " !cancelled()\n      && needs.e2e.result == 'success'\n      && github.ref == 'refs/heads/main' }}",
      ),
    ),
    ['deploy: does not check needs.changes.result'],
  )
  assert.deepEqual(
    unguardedJobs(
      shape(
        '    if: >-\n      ' +
          OPEN +
          " !cancelled()\n      && needs.e2e.result == 'success'\n      && needs.changes.result == 'success' }}",
      ),
    ),
    [],
  )
})
