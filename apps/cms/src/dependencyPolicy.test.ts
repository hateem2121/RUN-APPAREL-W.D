import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The repo's dependency policy, made self-checking.
 *
 * TWO THINGS ROT HERE, and both are invisible.
 *
 * 1. VERSION DIVERGENCE. Five workspaces each declare their own `typescript`,
 *    `vitest`, `wrangler`, `@types/node`. README says "TypeScript is 7.0.2 in all
 *    five workspaces" — a claim that was TRUE when written and that nothing keeps
 *    true. Divergence here is not cosmetic: apps/cms was pinned to TypeScript 6 for
 *    weeks because Next 16.2.12 rejected the TS7 compiler API, and the lesson root
 *    CLAUDE.md draws from it is that `tsc --noEmit` passed the entire time — only
 *    `pnpm build` failed. A silent split is the state that produced that.
 *
 * 2. A DELIBERATE HOLD BEING SILENTLY LIFTED. `@cloudflare/workers-types` was held at
 *    5.20260804.1 in apps/shrink from 2026-08-12 to 2026-10-03, because every release
 *    from 5.20260808.1 on broke that package's typecheck — and, critically, broke it
 *    NOWHERE ELSE: tools/asset-pipeline typechecks the same file and passes, because it
 *    sets `types: ["node"]` while the Worker sets `types: ["@cloudflare/workers-types"]`.
 *    So a well-meaning bump looked fine in four workspaces out of five, and root
 *    CLAUDE.md's advice — "Bisect; do not revert the plausible one" — was earned across
 *    four releases. It was released by fixing the cause; the last describe block below
 *    keeps it released.
 *
 * The holds below are the ones the repo documents in prose. Restating them as an
 * assertion is what makes the prose checkable; the reason string is required so an
 * entry can never become a bare version number nobody dares touch.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const WORKSPACES = [
  'apps/viewer',
  'apps/cms',
  'apps/shrink',
  'packages/shared',
  'tools/asset-pipeline',
]

const readPkg = (rel: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, rel, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    packageManager?: string
    engines?: Record<string, string>
  }

const allDeps = (rel: string) => {
  const pkg = readPkg(rel)
  return { ...pkg.dependencies, ...pkg.devDependencies }
}

interface Hold {
  dep: string
  version: string
  /** The only workspaces held. */
  scope: readonly string[]
  /** What the unaffected workspaces run, asserted so a narrow hold cannot quietly widen. */
  elsewhere: string
  why: string
  releaseWhen: string
}

/**
 * Deliberate holds. Each MUST carry the reason and the condition that would release
 * it — an entry without one is indistinguishable from a version nobody has updated.
 *
 * NONE SINCE 2026-10-03. The last held `@cloudflare/workers-types` at 5.20260804.1 in
 * apps/shrink (narrowed to that package on 2026-08-29) and ended when its cause did: the
 * shrink report stopped importing tools/asset-pipeline/src/validate.ts. Its measurements
 * are in docs/DEPENDENCY-HOLDS.md; the last describe block below keeps it released.
 */
const HOLDS: readonly Hold[] = []

describe('shared dependency versions', () => {
  /**
   * Every dependency declared by two or more workspaces must be declared at the SAME
   * version. Measured 2026-08-13: 15 dependencies are shared and all 15 already agree,
   * so this pins an existing property rather than demanding a cleanup.
   */
  it('never diverge between workspaces', () => {
    const byDep = new Map<string, Map<string, string[]>>()

    for (const workspace of WORKSPACES) {
      for (const [dep, version] of Object.entries(allDeps(workspace))) {
        if (version.startsWith('workspace:')) continue
        const versions = byDep.get(dep) ?? new Map<string, string[]>()
        versions.set(version, [...(versions.get(version) ?? []), workspace])
        byDep.set(dep, versions)
      }
    }

    const divergent: string[] = []
    for (const [dep, versions] of byDep) {
      if (versions.size <= 1) continue
      const detail = [...versions]
        .map(([version, workspaces]) => `${version} (${workspaces.join(', ')})`)
        .join(' vs ')
      divergent.push(`${dep}: ${detail}`)
    }

    /*
     * A split a HOLD explains is not drift. `@cloudflare/workers-types` is deliberately
     * on two versions since 2026-08-29 — held in apps/shrink, current everywhere else —
     * and the two tests below pin BOTH ends of that, so removing this exemption without
     * removing the hold makes those fail rather than letting anything slide.
     */
    const explained = new Set<string>(HOLDS.map((hold) => hold.dep))
    const unexplained = divergent.filter((line) => !explained.has(line.split(':')[0] as string))

    expect(
      unexplained,
      'Two workspaces declare different versions of the same dependency. apps/cms sat on\n' +
        'TypeScript 6 while everything else was on 7, and `tsc --noEmit` passed the whole\n' +
        'time — only `pnpm build` failed. If a split is deliberate, it belongs in HOLDS\n' +
        'in this file with its reason.',
    ).toEqual([])
  })

  it('checks a meaningful number of shared dependencies (the guard must not pass by finding nothing)', () => {
    const counts = new Map<string, number>()
    for (const workspace of WORKSPACES) {
      for (const dep of Object.keys(allDeps(workspace))) {
        counts.set(dep, (counts.get(dep) ?? 0) + 1)
      }
    }
    const shared = [...counts.values()].filter((n) => n >= 2).length
    expect(shared).toBeGreaterThanOrEqual(10)
  })
})

describe('deliberate version holds', () => {
  it.each(HOLDS)('$dep is held at $version in $scope', ({ dep, version, scope }) => {
    const wrong: string[] = []
    for (const workspace of scope) {
      const declared = allDeps(workspace)[dep]
      if (declared !== version) wrong.push(`${workspace} declares ${declared ?? 'nothing'}`)
    }

    expect(
      wrong,
      `${dep} is HELD at ${version} in ${scope.join(', ')}. Raising it there is not a ` +
        'routine bump — read the reason in HOLDS in this file first.',
    ).toEqual([])
  })

  it.each(HOLDS)(
    '$dep is NOT held outside $scope — the hold stays as narrow as it should be',
    ({ dep, scope, elsewhere }) => {
      /*
       * The half that stops a narrow hold quietly widening again. Until 2026-08-29 this
       * one was applied to all three workspaces that declare it, freezing 24 days of
       * updates across apps/cms and apps/viewer for a fault neither of them has. A hold
       * with no upper bound looks identical to a version nobody dares touch.
       */
      const stuck: string[] = []
      for (const workspace of WORKSPACES) {
        if ((scope as readonly string[]).includes(workspace)) continue
        const declared = allDeps(workspace)[dep]
        if (declared !== undefined && declared !== elsewhere)
          stuck.push(`${workspace} declares ${declared}, expected ${elsewhere}`)
      }

      expect(
        stuck,
        `${dep} is held only in ${scope.join(', ')}. Everywhere else should be on ` +
          `${elsewhere}. If the break has spread, widen \`scope\` and say why.`,
      ).toEqual([])
    },
  )

  it('every hold states why it exists and what would release it', () => {
    for (const hold of HOLDS) {
      expect(hold.why.length, `${hold.dep} has no reason`).toBeGreaterThan(40)
      expect(hold.releaseWhen.length, `${hold.dep} has no release condition`).toBeGreaterThan(20)
    }
  })

  it('is still documented in prose where a human would look', () => {
    // Belt and braces with the assertion above: the machine-readable hold and the
    // human-readable explanation must both exist. Deleting one silently leaves the
    // other looking authoritative.
    const claudeMd = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8')
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')

    for (const { dep, version } of HOLDS) {
      expect(
        claudeMd + readme,
        `${dep} is held but neither CLAUDE.md nor README says so`,
      ).toContain(version)
      expect(claudeMd + readme).toContain(dep)
    }
  })
})

describe('toolchain pins', () => {
  it('pins pnpm and Node at the root, where every documented command assumes them', () => {
    const root = readPkg('.')

    // Root CLAUDE.md: bare `pnpm` fails with exit 127 on the owner's machine, and
    // every documented `pnpm <script>` means `npx --yes pnpm@<this version>`. The
    // literal version appears in .claude/settings.json's allowlist too, so a bump
    // here without one there silently re-introduces permission prompts.
    expect(root.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(root.engines?.node).toBeDefined()
  })

  it('agrees with the pnpm version .claude/settings.json allowlists', () => {
    const root = readPkg('.')
    const pinned = root.packageManager?.split('@')[1]
    const settings = readFileSync(join(REPO_ROOT, '.claude', 'settings.json'), 'utf8')

    expect(pinned).toBeDefined()
    expect(
      settings,
      `package.json pins pnpm@${pinned} but .claude/settings.json allowlists a different ` +
        'version — every allowed command would start prompting again.',
    ).toContain(`pnpm@${pinned}`)
  })
})

/**
 * Every .ts file the entry files reach through RELATIVE imports, type-only ones included:
 * what tsc puts in a program, packages aside. `import type` counts because tsc still loads
 * and checks the file it names (measured 2026-10-03 with `tsc --explainFiles`).
 */
function reachableFiles(entries: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = entries.map((entry) => join(REPO_ROOT, entry))
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(
      /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g,
    )) {
      const spec = match[1]
      if (!spec) continue
      const base = join(dirname(file), spec)
      const target = [
        base,
        base.replace(/\.js$/, '.ts'),
        `${base}.ts`,
        join(base, 'index.ts'),
      ].find((candidate) => candidate.endsWith('.ts') && existsSync(candidate))
      if (target) queue.push(target)
    }
  }
  return seen
}

describe('the @cloudflare/workers-types hold stays released (2026-10-03)', () => {
  /*
   * apps/shrink typechecks src/ and container/report.ts under Cloudflare's Worker types and
   * no Node types (apps/shrink/tsconfig.json). Until 2026-10-03 the report imported
   * tools/asset-pipeline/src/validate.ts, and every workers-types release from 5.20260808.1 on
   * failed there on readGlbGenerator's Node Buffer calls, so apps/shrink was held at
   * 5.20260804.1. Reaching validate.ts again, directly or through another file, even with
   * `import type`, brings the failure back (one planted `import type` returned all four
   * errors), and tsc's message names neither the import nor the fix. This names both.
   */
  const shrinkSrc = join(REPO_ROOT, 'apps', 'shrink', 'src')
  const entries = [
    'apps/shrink/container/report.ts',
    ...readdirSync(shrinkSrc, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => join('apps', 'shrink', 'src', file)),
  ]
  const reached = reachableFiles(entries)
  const pipeline = (file: string) => join(REPO_ROOT, 'tools', 'asset-pipeline', 'src', file)

  it("nothing apps/shrink typechecks reaches the pipeline's validate.ts", () => {
    expect(
      reached.has(pipeline('validate.ts')),
      'apps/shrink reaches tools/asset-pipeline/src/validate.ts. Under Worker types its\n' +
        'readGlbGenerator fails ("readUInt32LE does not exist on type NonSharedBuffer"). Import\n' +
        "the report's shape, SIZE_WARNING_BYTES and describeSoftArtwork from glb-report.ts.",
    ).toBe(false)
  })

  it('follows the imports it guards (the guard must not pass by finding nothing)', () => {
    expect(entries.length).toBeGreaterThan(5)
    // The report imports glb-report.ts, and glb-report.ts imports texture-artwork.ts.
    expect(reached.has(pipeline('glb-report.ts'))).toBe(true)
    expect(reached.has(pipeline('texture-artwork.ts'))).toBe(true)
  })
})
