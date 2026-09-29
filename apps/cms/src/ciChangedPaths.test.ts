import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseFor, shrinkChanged, touchesShrink } from '../../../scripts/ci-changed-paths.mjs'

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
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: first })).toBe('shrink=false')

    commit('packages/shared/src/media.ts')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: first })).toBe('shrink=true')
  })

  it('says true when the base commit is not in the checkout', () => {
    const { dir, commit } = repo()
    commit('apps/viewer/src/App.tsx')
    expect(run(dir, { EVENT_NAME: 'push', BEFORE: 'f'.repeat(40) })).toBe('shrink=true')
  })
})
