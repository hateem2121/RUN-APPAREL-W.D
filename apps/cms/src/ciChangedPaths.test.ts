import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  baseFor,
  browserPaths,
  browserTestsChanged,
  lastDeployedSha,
  latestSuccessfulSha,
  shrinkChanged,
  siteChanged,
  touchesBrowserTests,
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
      // only the root skills-lock.json is exempt, by exact path: look-alikes are still code
      'apps/cms/skills-lock.json',
      'skills-lock.jsonc',
      'my-skills-lock.json',
      // only the two measuring scripts are exempt: the deploy job runs most of scripts/
      'scripts/warm-regions.mjs',
      'scripts/perf-probe.mjs.bak',
      'apps/cms/scripts/perf-probe.mjs',
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
      // The two workflows' own tools (25 Nov 2026): out of .github/ so Dependabot can update
      // them, and still nothing a Worker is built from.
      'ci-installs/guidepup/package-lock.json',
      'ci-installs/puppeteer-browsers/package.json',
      'apps/cms/src/ciChangedPaths.test.ts',
      'apps/viewer/src/lib/sentry.test.ts',
      'scripts/check-required-checks.test.mjs',
      'apps/cms/e2e/fontSwap.spec.ts',
      'apps/viewer/e2e/fixtures/garment.json',
      // #309 (5 Nov 2026): the robot's weekly skills PR. Its fingerprint file sits at the root,
      // so it counted as shipping and a full deploy ran for skill text no Worker reads
      'skills-lock.json',
      // #459 (23 Nov 2026): one number in the speed guard's probe, and a full deploy ran for it
      'scripts/perf-probe.mjs',
      'scripts/first-visit-burst.mjs',
    ]) {
      expect(touchesSite(file), file).toBe(false)
    }
  })
})

describe('which files a browser test can read', () => {
  it('counts app code, styles, config, and the tests themselves', () => {
    for (const file of [
      'apps/viewer/src/App.tsx',
      'apps/cms/src/components/site/SiteFooter.tsx',
      'packages/ui/src/tokens.css',
      'packages/shared/src/media.ts',
      'tools/asset-pipeline/src/optimize.ts',
      'pnpm-lock.yaml',
      'package.json',
      'scripts/seed-assets.mjs',
      '.github/workflows/ci.yml',
      // Never shipped to a Worker, so `touchesSite` says false: but they ARE the browser tests.
      'apps/cms/e2e/fontSwap.spec.ts',
      'apps/viewer/e2e/fixtures/garment.json',
      'apps/viewer/playwright.config.ts',
      'apps/viewer/src/lib/sentry.test.ts',
    ]) {
      expect(touchesBrowserTests(file), file).toBe(true)
    }
  })

  it('does not count what no build, test server or spec reads (negative control)', () => {
    for (const file of [
      'docs/RUNBOOK.md',
      'docs/assets/reference/cards.png',
      'CLAUDE.md',
      'apps/cms/CLAUDE.md',
      '.claude/rules/cms-site.md',
      '.claude/skills/gates/run-gates.mjs',
      '.agents/skills/pick-ui-library/SKILL.md',
      '.github/workflows/uptime.yml',
      '.github/CLAUDE.md',
      'ci-installs/guidepup/package-lock.json',
      'skills-lock.json',
      'scripts/perf-probe.mjs',
    ]) {
      expect(touchesBrowserTests(file), file).toBe(false)
    }
  })

  it('skips only when every changed file is one of those, and runs on any doubt', () => {
    const pull = { eventName: 'pull_request', baseSha: 'abc' }
    expect(browserTestsChanged(pull, () => ['docs/RUNBOOK.md', 'CLAUDE.md'])).toBe(false)
    // One file a test can read, riding along with docs, runs everything.
    expect(browserTestsChanged(pull, () => ['docs/RUNBOOK.md', 'apps/cms/e2e/x.spec.ts'])).toBe(
      true,
    )
    // No base (a by-hand run), a base git cannot see, and a diff that found nothing all run.
    expect(browserTestsChanged({ eventName: 'workflow_dispatch' }, () => ['docs/a.md'])).toBe(true)
    expect(browserTestsChanged(pull, () => null)).toBe(true)
    expect(browserTestsChanged(pull, () => [])).toBe(true)
  })
})

describe('the answer handed to the browser-test machines', () => {
  it('skips a notes-only pull request, and a notes-only push with nothing waiting to deploy', () => {
    expect(browserPaths({ onMainPush: false, site: true, changed: false })).toBe('skip')
    expect(browserPaths({ onMainPush: true, site: false, changed: false })).toBe('skip')
  })

  it('runs on main while anything is waiting to deploy, whatever this push changed (negative control)', () => {
    // The hole the reviewer found: code whose browser tests failed on main is still undeployed,
    // so `site` is true; a notes-only push must not let `e2e` pass and `deploy` run over it.
    expect(browserPaths({ onMainPush: true, site: true, changed: false })).toBe('run')
    expect(browserPaths({ onMainPush: true, site: true, changed: true })).toBe('run')
    expect(browserPaths({ onMainPush: true, site: false, changed: true })).toBe('run')
    expect(browserPaths({ onMainPush: false, site: true, changed: true })).toBe('run')
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

  it("skips the robot's weekly skills refresh, and still deploys if one code file rides along", () => {
    // The shape of #309: skill text under .claude/ and .agents/, plus the root fingerprint file.
    const skillsRefresh = [
      '.agents/skills/animate/SKILL.md',
      '.claude/skills/README.md',
      '.claude/skills/ai-seo/evals/evals.json',
      '.claude/skills/ai-seo/references/agent-readiness.md',
      'skills-lock.json',
    ]
    expect(siteChanged(push, 'abc', () => skillsRefresh)).toBe(false)
    expect(siteChanged(push, 'abc', () => [...skillsRefresh, 'apps/cms/worker.mjs'])).toBe(true)
  })

  it('skips a change to the speed guard alone, as #459 was, and deploys if a deploy script rides along', () => {
    const speedGuard = ['scripts/perf-probe.mjs', 'apps/cms/src/perfProbe.test.ts']
    expect(siteChanged(push, 'abc', () => speedGuard)).toBe(false)
    expect(siteChanged(push, 'abc', () => [...speedGuard, 'scripts/beacon-probe.mjs'])).toBe(true)
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
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: first })).toBe(
      'shrink=false\nsite=true\nbrowser_paths=run',
    )

    commit('packages/shared/src/media.ts')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: first })).toBe(
      'shrink=true\nsite=true\nbrowser_paths=run',
    )
  })

  it('says true when the base commit is not in the checkout', () => {
    const { dir, commit } = repo()
    commit('apps/viewer/src/App.tsx')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: 'f'.repeat(40) })).toBe(
      'shrink=true\nsite=true\nbrowser_paths=run',
    )
  })

  it('deploys on a main push when it cannot read the deploy records (no token here)', () => {
    // The docs-only diff alone would skip. Without the records it must not.
    const { dir, commit } = repo()
    const first = commit('apps/viewer/src/App.tsx')
    commit('docs/RUNBOOK.md')
    const env = { EVENT_NAME: 'push', BEFORE: first, REF: 'refs/heads/main', GH_TOKEN: '' }
    // And with something possibly waiting to deploy, the browser tests run too.
    expect(run(dir, env)).toBe('shrink=false\nsite=true\nbrowser_paths=run')
    // The same notes-only change as a pull request is judged by its own files.
    expect(run(dir, { EVENT_NAME: 'pull_request', BASE_SHA: first })).toBe(
      'shrink=false\nsite=true\nbrowser_paths=skip',
    )
  })
})
