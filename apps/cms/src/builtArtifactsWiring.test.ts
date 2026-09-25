import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every test that reads `REQUIRE_BUILD_ARTIFACTS` must be named by a package script that
 * sets it, and CI must run that script AFTER `pnpm build`. Otherwise it skips forever.
 *
 * WHY. These tests `it.skipIf(...)` when `dist/` or `.next/` is absent, and CI runs
 * `pnpm test:coverage` BEFORE `pnpm build` (ci.yml, above "Bundle preload guard (needs
 * the build above)"). So inside the suite they ALWAYS skip on a clean checkout. The only
 * run that counts is the after-build one: a package script that sets
 * `REQUIRE_BUILD_ARTIFACTS=1` and names the file, called by a ci.yml step below the
 * build. Any one of those three links missing reads as green.
 *
 * MEASURED 2026-09-25, PR #46: `servedCssMotionProbe.test.ts` said in its own docblock
 * that `test:built-config` ran it. The script never listed it, so on CI it skipped on
 * every run and three motion checks (MO-05/15/16) guarded nothing. The docblock, the
 * script and the CI step were each correct on their own; only reading all three
 * together shows the gap. This is the second time: `preload.test.ts` skipped in CI until
 * 2026-08-29 for the same reason (the ⚠️ comment above that ci.yml step).
 *
 * WHY COMMENTS ARE STRIPPED FROM ci.yml FIRST. ci.yml explains each after-build step
 * at length and names the scripts in prose. A comment that says `test:built-config`
 * runs something is exactly the claim that turned out false, so it must never count
 * as the step.
 *
 * WHY IT LIVES IN apps/cms. Same reason as workflowHardening.test.ts: a repo-wide check
 * belonging to no app, and apps/cms is the workspace with vitest and node types.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const FLAG = 'REQUIRE_BUILD_ARTIFACTS'
const SELF = 'apps/cms/src/builtArtifactsWiring.test.ts'

type SourceFile = { path: string; text: string }
type Pkg = { dir: string; name: string; scripts: Record<string, string> }
type FlaggedScript = { pkg: Pkg; script: string; tests: string[] }

/**
 * Tracked AND untracked-but-not-ignored files, so a brand-new test is seen locally
 * before it is committed. `git ls-files` instead of a directory walk because it skips
 * node_modules, build output and the nested `.claude/worktrees/*` checkouts for free —
 * a walk run from the main checkout would find every test once per worktree.
 */
function repoFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
}

/** Test files that mention the flag. The guard itself is excluded: it names the flag throughout. */
function flagReaders(files: SourceFile[]): string[] {
  return files
    .filter((f) => /\.test\.tsx?$/.test(f.path) && f.path !== SELF && f.text.includes(FLAG))
    .map((f) => f.path)
    .sort()
}

/**
 * Package scripts whose command sets the flag, with the test files they name, as
 * repo-relative paths. A script that sets the flag but names no test file is returned
 * with `tests: []` so the caller can refuse it instead of guessing what it covers.
 */
function flaggedScripts(pkgs: Pkg[]): FlaggedScript[] {
  const out: FlaggedScript[] = []
  for (const pkg of pkgs) {
    for (const [script, command] of Object.entries(pkg.scripts)) {
      if (!new RegExp(`\\b${FLAG}=1\\b`).test(command)) continue
      const tests = command
        .split(/\s+/)
        .filter((token) => /\.test\.tsx?$/.test(token))
        .map((token) => posix.normalize(posix.join(pkg.dir, token)))
      out.push({ pkg, script, tests })
    }
  }
  return out
}

/**
 * Is `pkg`'s `script` invoked by a ci.yml line that sits in the same job as, and below,
 * a bare `pnpm build`? Line-based for the reason workflowHardening.test.ts gives: no
 * workspace depends on a YAML parser.
 *
 * "Same job" matters: the `deploy` job builds the viewer with a narrower command, and
 * `e2e` builds inside prepare.mjs, so a step in either would NOT be after a full build.
 */
function runAfterBuild(ciSource: string, pkg: Pkg, script: string): boolean {
  const lines = ciSource.split('\n').filter((line) => !/^\s*#/.test(line))
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const invocation =
    pkg.dir === '.'
      ? new RegExp(`\\bpnpm\\s+(run\\s+)?${escaped}(\\s|$)`)
      : new RegExp(
          `\\bpnpm\\s+(--filter|-F)\\s+${pkg.name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s+(run\\s+)?${escaped}(\\s|$)`,
        )
  let builtInThisJob = false
  for (const line of lines) {
    // A two-space-indented key under `jobs:` starts a new job; the build does not carry over.
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) builtInThisJob = false
    if (/^\s*(-\s+)?run:\s*pnpm build\s*$/.test(line)) builtInThisJob = true
    else if (builtInThisJob && invocation.test(line)) return true
  }
  return false
}

/** Every flag-reading test that no after-build CI step actually runs, with the reason. */
function uncovered(readers: string[], scripts: FlaggedScript[], ciSource: string): string[] {
  const problems: string[] = []
  for (const s of scripts) {
    if (s.tests.length === 0) {
      problems.push(
        `${s.pkg.dir}/package.json "${s.script}" sets ${FLAG}=1 but names no *.test.ts file`,
      )
    }
  }
  const live = scripts.filter((s) => runAfterBuild(ciSource, s.pkg, s.script))
  for (const file of readers) {
    const naming = scripts.filter((s) => s.tests.includes(file))
    if (naming.length === 0) {
      problems.push(
        `${file}: no package script sets ${FLAG}=1 and names it, so it skips on every CI run`,
      )
    } else if (!live.some((s) => s.tests.includes(file))) {
      const names = naming.map((s) => `${s.pkg.name} ${s.script}`).join(', ')
      problems.push(
        `${file}: named by ${names}, but no ci.yml step runs that after \`pnpm build\` in the same job`,
      )
    }
  }
  return problems
}

function loadRepo(): { readers: string[]; scripts: FlaggedScript[]; ci: string } {
  const files = repoFiles()
  const sources = files
    .filter((p) => /\.test\.tsx?$/.test(p))
    .map((path) => ({ path, text: readFileSync(join(REPO_ROOT, path), 'utf8') }))
  const pkgs = files
    .filter((p) => p === 'package.json' || p.endsWith('/package.json'))
    .map((p) => {
      const json = JSON.parse(readFileSync(join(REPO_ROOT, p), 'utf8')) as {
        name?: string
        scripts?: Record<string, string>
      }
      return { dir: dirname(p), name: json.name ?? '', scripts: json.scripts ?? {} }
    })
  const ci = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  return { readers: flagReaders(sources), scripts: flaggedScripts(pkgs), ci }
}

describe('REQUIRE_BUILD_ARTIFACTS tests are run by CI after the build', () => {
  const repo = loadRepo()

  it('every test that reads the flag is named by a script CI runs after `pnpm build`', () => {
    expect(uncovered(repo.readers, repo.scripts, repo.ci)).toEqual([])
  })

  /**
   * An empty discovery would make the check above pass vacuously — "a control that did
   * not apply". The floor is the count measured 2026-09-25 (7 readers, 3 scripts); a
   * deliberate deletion lowers it by hand, a broken search trips it.
   */
  it('actually found the flag readers and the scripts (the check above is not vacuous)', () => {
    expect(repo.readers).toContain('apps/cms/src/servedCssMotionProbe.test.ts')
    expect(repo.readers).toContain('apps/viewer/scripts/preload.test.ts')
    expect(repo.readers.length).toBeGreaterThanOrEqual(7)
    expect(repo.scripts.map((s) => s.script).sort()).toEqual(
      expect.arrayContaining(['test:built-config', 'test:preload', 'test:routes']),
    )
  })
})

describe('negative control: the wiring check fails on each broken link', () => {
  const cms: Pkg = {
    dir: 'apps/cms',
    name: '@run-apparel/cms',
    scripts: { 'test:built-config': `${FLAG}=1 vitest run src/a.test.ts` },
  }
  const readers = ['apps/cms/src/a.test.ts', 'apps/cms/src/b.test.ts']
  const good = [
    'jobs:',
    '  verify:',
    '    steps:',
    '      - run: pnpm build',
    '      - name: Built-config guards',
    '        run: pnpm --filter @run-apparel/cms test:built-config',
  ].join('\n')

  it('passes the complete wiring (so the failures below are about the break, not the fixture)', () => {
    const full: Pkg = {
      ...cms,
      scripts: { 'test:built-config': `${FLAG}=1 vitest run src/a.test.ts src/b.test.ts` },
    }
    expect(uncovered(readers, flaggedScripts([full]), good)).toEqual([])
  })

  it('fails naming the file a script leaves out — the 2026-09-25 incident', () => {
    const problems = uncovered(readers, flaggedScripts([cms]), good)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('apps/cms/src/b.test.ts')
    expect(problems[0]).toContain('no package script')
  })

  it('fails when the step runs BEFORE the build', () => {
    const before = good.replace(
      '      - run: pnpm build\n      - name: Built-config guards\n        run: pnpm --filter @run-apparel/cms test:built-config',
      '      - run: pnpm --filter @run-apparel/cms test:built-config\n      - run: pnpm build',
    )
    expect(before).not.toBe(good)
    expect(uncovered(['apps/cms/src/a.test.ts'], flaggedScripts([cms]), before)[0]).toContain(
      'no ci.yml step runs that',
    )
  })

  it('fails when only a COMMENT names the script', () => {
    const commented = good.replace(
      '        run: pnpm --filter @run-apparel/cms test:built-config',
      '        # run: pnpm --filter @run-apparel/cms test:built-config',
    )
    expect(commented).not.toBe(good)
    expect(uncovered(['apps/cms/src/a.test.ts'], flaggedScripts([cms]), commented)).toHaveLength(1)
  })

  it('fails when the step is in a different job from the build', () => {
    const otherJob = good.replace(
      '      - name: Built-config guards',
      '  e2e:\n    steps:\n      - name: Built-config guards',
    )
    expect(otherJob).not.toBe(good)
    expect(uncovered(['apps/cms/src/a.test.ts'], flaggedScripts([cms]), otherJob)).toHaveLength(1)
  })

  it('refuses a script that sets the flag but names no test file', () => {
    const bare: Pkg = { ...cms, scripts: { 'test:all-built': `${FLAG}=1 vitest run` } }
    expect(uncovered([], flaggedScripts([bare]), good)[0]).toContain('names no *.test.ts file')
  })
})
