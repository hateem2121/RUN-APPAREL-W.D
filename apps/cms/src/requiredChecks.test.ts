import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACTIONS_INTEGRATION_ID,
  compareRequiredChecks,
  parseDeployNeeds,
  readBranchRules,
  requiredChecksFromBranchRules,
} from '../../../scripts/check-required-checks.mjs'

/**
 * scripts/check-required-checks.mjs compares the `main` ruleset's required checks with
 * ci.yml's `deploy.needs` (it runs in .github/workflows/required-checks.yml, because only
 * a workflow may reach the network). Everything it decides is tested here, offline, and
 * every rule is shown to FAIL on a planted fault as well as to pass on the real files.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

/** The branch-rules body GitHub returned on 2026-09-24 (anonymous GET), trimmed. */
const LIVE_RULES = [
  { type: 'deletion' },
  { type: 'non_fast_forward' },
  { type: 'pull_request', parameters: { required_approving_review_count: 0 } },
  {
    type: 'required_status_checks',
    parameters: {
      required_status_checks: [
        { context: 'verify', integration_id: 15368 },
        { context: 'e2e', integration_id: 15368 },
        { context: 'audit', integration_id: 15368 },
        { context: 'secrets', integration_id: 15368 },
        { context: 'artwork', integration_id: 15368 },
        { context: 'Socket Security: Pull Request Alerts', integration_id: 156372 },
      ],
    },
  },
  { type: 'code_scanning' },
]

describe('parseDeployNeeds', () => {
  it("reads the REAL ci.yml's deploy.needs: a non-empty list of declared jobs", async () => {
    // The shape, not a third copy of the list: adding a gating job must not mean
    // editing this test too. Every entry must be a job ci.yml actually declares.
    const source = await readFile(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
    const needs = parseDeployNeeds(source)
    const declared = [...source.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/gm)].map((m) => m[1])
    expect(needs.length).toBeGreaterThan(0)
    expect(new Set(needs).size).toBe(needs.length)
    for (const job of needs) expect(declared).toContain(job)
    expect(needs).not.toContain('deploy')
  })

  it('reads a job header with a trailing comment, past a column-0 comment', () => {
    const source = [
      'jobs:',
      '  verify:  # the big one',
      '    runs-on: ubuntu-latest',
      '# ---- release ----',
      '  deploy:',
      '    needs: [verify]',
      '',
    ].join('\n')
    expect(parseDeployNeeds(source)).toEqual(['verify'])
  })

  it('reads the block-list form and a job `name:`, which is what the check is called', () => {
    const source = [
      'jobs:',
      '  verify:',
      '    name: Verify everything',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: not the job name',
      '  deploy:',
      '    needs:',
      '      - verify',
      '      - e2e',
      '',
    ].join('\n')
    expect(parseDeployNeeds(source)).toEqual(['Verify everything', 'e2e'])
  })

  it('throws instead of returning an empty list (negative control)', () => {
    // An empty list would make every comparison "agree" about nothing.
    expect(() => parseDeployNeeds('jobs:\n  verify:\n    runs-on: x\n')).toThrow(/no `deploy` job/)
    expect(() => parseDeployNeeds('jobs:\n  deploy:\n    runs-on: x\n')).toThrow(
      /no readable `needs:`/,
    )
  })
})

describe('compareRequiredChecks', () => {
  const required = requiredChecksFromBranchRules(LIVE_RULES)
  const deployNeeds = ['verify', 'e2e', 'audit', 'secrets', 'artwork']

  it('agrees on the live lists, with Socket reported as merge-only, not as drift', () => {
    expect(compareRequiredChecks({ deployNeeds, required })).toEqual({
      missingFromRuleset: [],
      notInDeployNeeds: [],
      external: ['Socket Security: Pull Request Alerts'],
    })
  })

  it('fails when a gating job is not required on main (negative control)', () => {
    // A new job added to deploy.needs but not to the ruleset: red, it would not block a merge.
    const result = compareRequiredChecks({ deployNeeds: [...deployNeeds, 'lint-docs'], required })
    expect(result.missingFromRuleset).toEqual(['lint-docs'])
  })

  it('fails when the ruleset requires an Actions check no gating job posts (negative control)', () => {
    // `verify` renamed to `checks` in ci.yml but not in the ruleset: every PR waits forever.
    const renamed = deployNeeds.map((job) => (job === 'verify' ? 'checks' : job))
    const result = compareRequiredChecks({ deployNeeds: renamed, required })
    expect(result.notInDeployNeeds).toEqual(['verify'])
    expect(result.missingFromRuleset).toEqual(['checks'])
  })

  it('compares a required check with no app pinned, since a job could post it', () => {
    const loose = [...required, { context: 'lighthouse', integrationId: null }]
    expect(compareRequiredChecks({ deployNeeds, required: loose }).notInDeployNeeds).toEqual([
      'lighthouse',
    ])
  })

  it('pins the Actions app id the live rules carry', () => {
    expect(ACTIONS_INTEGRATION_ID).toBe(15368)
    expect(
      requiredChecksFromBranchRules(LIVE_RULES).filter((c) => c.integrationId === 15368),
    ).toHaveLength(5)
  })
})

describe('readBranchRules', () => {
  /** A fake fetch that answers from a script of responses, recording who asked. */
  function fakeFetch(
    answers: { status: number; body?: unknown; headers?: Record<string, string> }[],
  ) {
    const calls: { authorized: boolean }[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ authorized: 'Authorization' in headers })
      const answer = answers.shift() ?? { status: 500 }
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: answer.headers,
      })
    }) as typeof fetch
    return { fetchImpl, calls }
  }
  const base = { repository: 'o/r', branch: 'main', delays: [0, 0] }

  it('falls back to an anonymous read when the token is refused, and says so', async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 403 }, { status: 200, body: LIVE_RULES }])
    const read = await readBranchRules({ ...base, token: 't', fetchImpl })
    expect(read).toMatchObject({ ok: true, via: 'anonymous' })
    expect(calls).toEqual([{ authorized: true }, { authorized: false }])
  })

  it('reports the token as the reader when the token works', async () => {
    const { fetchImpl } = fakeFetch([{ status: 200, body: LIVE_RULES }])
    expect(await readBranchRules({ ...base, token: 't', fetchImpl })).toMatchObject({
      ok: true,
      via: 'token',
    })
  })

  it('reports a refusal by BOTH as permanent — never as green (negative control)', async () => {
    const { fetchImpl } = fakeFetch([{ status: 403 }, { status: 404 }])
    const read = await readBranchRules({ ...base, token: 't', fetchImpl })
    expect(read).toMatchObject({ ok: false, permanent: true })
  })

  it('treats server errors and rate limits as transient, never as permanent', async () => {
    const fiveHundreds = fakeFetch([{ status: 502 }, { status: 502 }, { status: 502 }])
    expect(await readBranchRules({ ...base, fetchImpl: fiveHundreds.fetchImpl })).toMatchObject({
      ok: false,
      permanent: false,
    })
    const limited = fakeFetch([
      { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
      { status: 429 },
      { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    ])
    expect(await readBranchRules({ ...base, fetchImpl: limited.fetchImpl })).toMatchObject({
      ok: false,
      permanent: false,
    })
  })

  it("treats GitHub's SECONDARY rate limit as transient, on its own", async () => {
    // A 403 with retry-after while requests still remain. Alone in the sequence, so a
    // version that read it as a refusal would report `permanent: true` and fail here.
    const secondary = {
      status: 403,
      headers: { 'retry-after': '60', 'x-ratelimit-remaining': '41' },
    }
    const { fetchImpl } = fakeFetch([secondary, secondary, secondary])
    expect(await readBranchRules({ ...base, fetchImpl })).toMatchObject({
      ok: false,
      permanent: false,
    })
  })
})

describe('the command', () => {
  it('exits 2, never 1, when ci.yml cannot be parsed — even from a path with a space', async () => {
    // Two failures at once: a main() guard written as `file://${argv[1]}` never matches a
    // path a URL must encode, so the script exited 0 having compared nothing; and a
    // parse error escaping main() exited 1, the "lists disagree" code. It fails here
    // before any network read.
    const dir = await mkdtemp(join(tmpdir(), 'rc probe '))
    try {
      const script = join(dir, 'check-required-checks.mjs')
      await copyFile(join(REPO_ROOT, 'scripts', 'check-required-checks.mjs'), script)
      await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
      await writeFile(join(dir, '.github', 'workflows', 'ci.yml'), 'jobs:\n  verify:\n    x: 1\n')
      const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' })
      expect(run.stderr).toContain('COULD NOT COMPARE')
      expect(run.status).toBe(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
