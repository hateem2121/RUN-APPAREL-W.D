import { describe, expect, it } from 'vitest'
import { NPM_LOCKED, check, compare } from '../../../scripts/check-lockfile-sync.mjs'

/**
 * Guard for the two-lockfile trap — the one that cost a deploy on 2026-08-12 and that
 * no other gate in this repo can see.
 *
 * THE REAL ASSERTION IS THE LAST BLOCK: the repository as it stands right now must be
 * in sync. Everything above it is negative controls, because a checker that cannot
 * fail is the exact thing that let this through the first time — `lint`, `typecheck`,
 * 621 tests, `build` and the container typecheck were all green while the image build
 * was already broken.
 */

const target = { name: 'pkg', consumer: 'a Dockerfile' }

const lockOf = (deps: Record<string, string>, devDeps: Record<string, string> = {}) => ({
  packages: { '': { dependencies: deps, devDependencies: devDeps } },
})

describe('npm lockfile sync — negative controls', () => {
  it('passes when declared ranges match the lockfile exactly', () => {
    const pkg = { dependencies: { sharp: '0.35.3' }, devDependencies: { tsx: '4.23.12' } }
    expect(compare(target, pkg, lockOf({ sharp: '0.35.3' }, { tsx: '4.23.12' }))).toEqual([])
  })

  it('fails when a dependency was added to package.json only', () => {
    // The exact shape of this session's own change: a devDependency added in the
    // workspace, lockfile untouched.
    const pkg = { devDependencies: { tsx: '4.23.12', '@vitest/coverage-v8': '4.1.10' } }
    const problems = compare(target, pkg, lockOf({}, { tsx: '4.23.12' }))

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('@vitest/coverage-v8')
    expect(problems[0]).toContain('not in the lockfile')
  })

  it('fails when a version drifts, which is how the 2026-08-12 break presented', () => {
    const pkg = { devDependencies: { '@playwright/test': '1.62.1' } }
    const problems = compare(target, pkg, lockOf({}, { '@playwright/test': '1.62.0' }))

    expect(problems[0]).toContain('"1.62.1" in package.json but "1.62.0" in the lockfile')
  })

  it('fails when a dependency lingers in the lockfile after being removed', () => {
    const problems = compare(target, { dependencies: {} }, lockOf({ 'old-dep': '1.0.0' }))
    expect(problems[0]).toContain('in the lockfile but not in package.json')
  })

  it('fails on a lockfile regenerated inside the pnpm workspace', () => {
    // pnpm's symlinked node_modules makes npm write `file:` paths that do not exist
    // inside the image. The build fails there, complaining about a missing tarball —
    // a message that points nowhere near the cause.
    const lock = {
      packages: {
        '': { dependencies: { sharp: '0.35.3' } },
        'node_modules/sharp': { resolved: 'file:../../node_modules/.pnpm/sharp' },
      },
    }
    const problems = compare(target, { dependencies: { sharp: '0.35.3' } }, lock)

    expect(problems.join(' ')).toContain('file:')
    expect(problems.join(' ')).toContain('temp dir')
  })

  it.each([
    ['a missing lockfile', { dependencies: {} }, null],
    ['a missing package.json', null, lockOf({})],
    ['a lockfile with no root entry', { dependencies: {} }, { packages: {} }],
  ])('fails on %s rather than passing vacuously', (_label, pkg, lock) => {
    expect(compare(target, pkg, lock).length).toBeGreaterThan(0)
  })
})

describe('this repository', () => {
  it('lists at least one npm-locked package (the guard must not pass by finding nothing)', () => {
    expect((NPM_LOCKED as unknown[]).length).toBeGreaterThan(0)
  })

  it('has every npm lockfile in sync with its package.json', () => {
    const problems = check() as string[]

    expect(
      problems,
      'Regenerate in a temp dir per tools/asset-pipeline/CLAUDE.md. Left unfixed this\n' +
        'next surfaces as a FAILED CONTAINER BUILD on main, after every local gate passed.',
    ).toEqual([])
  })
})
