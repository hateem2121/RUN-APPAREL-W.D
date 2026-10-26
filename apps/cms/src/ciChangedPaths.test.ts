import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  baseFor,
  lastDeployedSha,
  latestSuccessfulSha,
  shrinkChanged,
  siteChanged,
  touchesShrink,
  touchesSite,
} from '../../../scripts/ci-changed-paths.mjs'

/**
 * scripts/ci-changed-paths.mjs decides whether ci.yml builds and deploys the shrink
 * service. Every rule is shown firing AND not firing, and the CLI is run against a real
 * git history, because a filter that answers `false` for everything looks exactly like
 * a quiet week — and would ship a pipeline fix to nothing.
 */

const SCRIPT = join(import.meta.dirname, '..', '..', '..', 'scripts', 'ci-changed-paths.mjs')

describe('which files the shrink service is built from', () => {
  it('counts the shrink app, the pipeline, the shared package, the pnpm files and ci.yml', () => {
    for (const file of [
      'apps/shrink/src/index.ts',
      'apps/shrink/container/server.ts',
      'apps/shrink/Dockerfile',
      'tools/asset-pipeline/src/optimize.ts',
      'tools/asset-pipeline/package-lock.json',
      // The gap in the old paths filter: apps/shrink/src imports these, wrangler bundles them.
      'packages/shared/src/media.ts',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.github/workflows/ci.yml',
      // The base image's waivers: PR #207 renewed them and CI never scanned the image.
      '.trivyignore',
    ]) {
      expect(touchesShrink(file), file).toBe(true)
    }
  })

  it('does not count what the shrink service never ships (negative control)', () => {
    for (const file of [
      // c0a6728 built and pushed a Docker image for a docs-only commit.
      'tools/asset-pipeline/README.md',
      'tools/asset-pipeline/CLAUDE.md',
      'apps/viewer/src/App.tsx',
      'apps/cms/src/collections/Products.ts',
      'docs/RUNBOOK.md',
      '.github/workflows/uptime.yml',
      'packages/ui/src/tokens.css',
      // a prefix that merely LOOKS like one of the real ones
      'apps/shrinkwrap/x.ts',
    ]) {
      expect(touchesShrink(file), file).toBe(false)
    }
  })
})

/** Every file the shrink counts, from the test above: the site must count each one too. */
const SHRINK_FILES = [
  'apps/shrink/src/index.ts',
  'apps/shrink/container/server.ts',
  'apps/shrink/Dockerfile',
  'tools/asset-pipeline/src/optimize.ts',
  'tools/asset-pipeline/package-lock.json',
  'packages/shared/src/media.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github/workflows/ci.yml',
  '.trivyignore',
]

describe('which files the deployed Workers are built from', () => {
  it('counts app code, styles, config, scripts the deploy runs, and ci.yml', () => {
    for (const file of [
      'apps/cms/src/collections/Products.ts',
      'apps/cms/worker.mjs',
      'apps/cms/wrangler.jsonc',
      'apps/viewer/src/App.tsx',
      'apps/viewer/worker/index.ts',
      'packages/ui/src/tokens.css',
      'infra/apex-404/src/index.ts',
      'package.json',
      // the deploy job runs these after it ships, so a change must be proven on a deploy
      'scripts/warm-shared-store.mjs',
      'scripts/smoke-live-products.mjs',
      '.github/workflows/ci.yml',
      // a name that merely CONTAINS a skipped word is still code
      'apps/cms/src/lib/docsLinks.ts',
      'apps/viewer/src/e2eHelpers.ts',
    ]) {
      expect(touchesSite(file), file).toBe(true)
    }
  })

  it('counts everything the shrink counts, or deploy-shrink would be skipped with deploy', () => {
    for (const file of SHRINK_FILES) {
      expect(touchesShrink(file), file).toBe(true)
      expect(touchesSite(file), file).toBe(true)
    }
  })

  it('does not count what never reaches a Worker (negative control)', () => {
    for (const file of [
      // #265, the docs commit that emptied the store 26 minutes after #264 filled it
      'docs/DEPLOY-CHECKLIST.md',
      'docs/assets/reference/cards.png',
      'CLAUDE.md',
      'apps/cms/CLAUDE.md',
      'README.md',
      '.claude/hooks/guard-bare-pnpm.mjs',
      '.claude/rules/cms-site.md',
      '.agents/skills/pick-ui-library/SKILL.md',
      '.github/workflows/uptime.yml',
      '.github/dependabot.yml',
      '.github/CLAUDE.md',
      'apps/cms/src/ciChangedPaths.test.ts',
      'apps/viewer/src/lib/sentry.test.ts',
      'scripts/check-required-checks.test.mjs',
      'apps/cms/e2e/fontSwap.spec.ts',
      'apps/viewer/e2e/fixtures/garment.json',
    ]) {
      expect(touchesSite(file), file).toBe(false)
    }
  })
})

describe('the last commit that deployed', () => {
  const at = (minute: number) => `2026-10-26T05:${String(minute).padStart(2, '0')}:00Z`

  it('is the newest record whose latest status is success, in any listed order', () => {
    expect(
      latestSuccessfulSha([
        { sha: 'old', created_at: at(10), statuses: [{ state: 'success', created_at: at(11) }] },
        {
          sha: 'new',
          created_at: at(30),
          statuses: [
            { state: 'in_progress', created_at: at(30) },
            { state: 'success', created_at: at(40) },
          ],
        },
      ]),
    ).toBe('new')
  })

  it('passes over a failed or unfinished deploy, so its code is diffed again', () => {
    // 25 Oct: three records of 40 ended `failure` or `error`.
    expect(
      latestSuccessfulSha([
        { sha: 'good', created_at: at(10), statuses: [{ state: 'success', created_at: at(12) }] },
        {
          sha: 'failed',
          created_at: at(20),
          statuses: [
            { state: 'failure', created_at: at(25) },
            { state: 'in_progress', created_at: at(20) },
          ],
        },
        { sha: 'running', created_at: at(30), statuses: [] },
      ]),
    ).toBe('good')
    expect(latestSuccessfulSha([])).toBeNull()
  })

  it('reads the records through the API, and answers null on any failure (negative control)', async () => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    const fetchImpl = (async (url: string) =>
      url.includes('/statuses')
        ? ok([{ state: url.includes('/7/') ? 'success' : 'failure', created_at: at(9) }])
        : ok([
            { id: 7, sha: 'deployed', created_at: at(1) },
            { id: 8, sha: 'broken', created_at: at(2) },
          ])) as unknown as typeof fetch
    const opts = { repository: 'o/r', token: 't', fetchImpl }
    expect(await lastDeployedSha(opts)).toBe('deployed')

    const refused = (async () => new Response('', { status: 403 })) as unknown as typeof fetch
    expect(await lastDeployedSha({ ...opts, fetchImpl: refused })).toBeNull()
    const offline = (async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch
    expect(await lastDeployedSha({ ...opts, fetchImpl: offline })).toBeNull()
    expect(await lastDeployedSha({ repository: 'o/r', fetchImpl })).toBeNull()
  })
})

describe('whether the deploy has anything to ship', () => {
  const push = { eventName: 'push', ref: 'refs/heads/main' }

  it('skips only a push to main whose changes since the last deploy never reach a Worker', () => {
    expect(siteChanged(push, 'abc', () => ['docs/RUNBOOK.md', '.claude/rules/x.md'])).toBe(false)
    expect(siteChanged(push, 'abc', () => ['docs/RUNBOOK.md', 'apps/cms/worker.mjs'])).toBe(true)
  })

  it('deploys whenever it cannot be sure (negative control)', () => {
    const docsOnly = () => ['docs/RUNBOOK.md']
    expect(siteChanged(push, null, docsOnly)).toBe(true) // no record or the API failed
    expect(siteChanged(push, 'abc', () => null)).toBe(true) // that commit is not in the checkout
    expect(siteChanged({ eventName: 'workflow_dispatch', ref: push.ref }, 'abc', docsOnly)).toBe(
      true,
    )
    expect(siteChanged({ eventName: 'push', ref: 'refs/heads/other' }, 'abc', docsOnly)).toBe(true)
    expect(siteChanged({ eventName: 'pull_request' }, 'abc', docsOnly)).toBe(true)
  })
})

describe('what to diff against', () => {
  it('uses the pull request base, and the previous tip on a push', () => {
    expect(baseFor({ eventName: 'pull_request', baseSha: 'abc123' })).toBe('abc123')
    expect(baseFor({ eventName: 'push', before: 'def456' })).toBe('def456')
  })

  it('has no base for a by-hand run, a first push or a missing value — so it rebuilds', () => {
    expect(baseFor({ eventName: 'workflow_dispatch' })).toBeNull()
    expect(baseFor({ eventName: 'push', before: '0'.repeat(40) })).toBeNull()
    expect(baseFor({ eventName: 'push' })).toBeNull()
    expect(baseFor({ eventName: 'pull_request' })).toBeNull()
    expect(shrinkChanged({ eventName: 'workflow_dispatch' }, () => [])).toBe(true)
  })

  it('rebuilds when git cannot see the base commit', () => {
    expect(shrinkChanged({ eventName: 'push', before: 'abc' }, () => null)).toBe(true)
  })

  it('follows the files when it can see them, both ways', () => {
    const push = { eventName: 'push', before: 'abc' }
    expect(shrinkChanged(push, () => ['apps/viewer/src/App.tsx'])).toBe(false)
    expect(shrinkChanged(push, () => ['apps/viewer/src/App.tsx', 'packages/shared/src/x.ts'])).toBe(
      true,
    )
  })
})

describe('the CLI against a real git history', () => {
  function repo(): { dir: string; commit: (file: string) => string } {
    const dir = mkdtempSync(join(tmpdir(), 'ci-changed-paths-'))
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
    git('init', '-q', '-b', 'main')
    const commit = (file: string) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), `${Math.random()}\n`)
      git('add', '-A')
      git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', file)
      return git('rev-parse', 'HEAD')
    }
    return { dir, commit }
  }

  function run(dir: string, env: Record<string, string>): string {
    const result = spawnSync('node', [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, EVENT_NAME: '', BEFORE: '', BASE_SHA: '', ...env },
    })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }

  it('says false for a viewer-only push and true once packages/shared changes', () => {
    const { dir, commit } = repo()
    const first = commit('apps/viewer/src/App.tsx')
    commit('apps/viewer/src/Stage.tsx')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: first })).toBe('shrink=false\nsite=true')

    commit('packages/shared/src/media.ts')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: first })).toBe('shrink=true\nsite=true')
  })

  it('says true when the base commit is not in the checkout', () => {
    const { dir, commit } = repo()
    commit('apps/viewer/src/App.tsx')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: 'f'.repeat(40) })).toBe('shrink=true\nsite=true')
  })

  it('deploys on a main push when it cannot read the deploy records (no token here)', () => {
    // The docs-only diff alone would skip. Without the records it must not.
    const { dir, commit } = repo()
    const first = commit('apps/viewer/src/App.tsx')
    commit('docs/RUNBOOK.md')
    const env = { EVENT_NAME: 'push', BEFORE: first, REF: 'refs/heads/main', GH_TOKEN: '' }
    expect(run(dir, env)).toBe('shrink=false\nsite=true')
  })
})
