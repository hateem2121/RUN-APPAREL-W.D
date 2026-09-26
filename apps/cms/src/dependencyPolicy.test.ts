import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * 2. A DELIBERATE HOLD BEING SILENTLY LIFTED. `@cloudflare/workers-types` is held at
 *    5.20260804.1 because every release from 5.20260808.1 on breaks the apps/shrink
 *    typecheck — and, critically, breaks it NOWHERE ELSE: tools/asset-pipeline
 *    typechecks the same file and passes, because it sets `types: ["node"]` while the
 *    Worker sets `types: ["@cloudflare/workers-types"]`. So a well-meaning bump looks
 *    fine in four workspaces out of five, and root CLAUDE.md's advice —
 *    "Bisect; do not revert the plausible one" — was earned across four releases.
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

/**
 * Deliberate holds. Each MUST carry the reason and the condition that would release
 * it — an entry without one is indistinguishable from a version nobody has updated.
 */
const HOLDS = [
  {
    dep: '@cloudflare/workers-types',
    version: '5.20260804.1',
    /**
     * NARROWED 2026-08-29 from every workspace to apps/shrink alone.
     *
     * The break is real but it is not general: all four errors are in ONE 15-line
     * function, readGlbGenerator (tools/asset-pipeline/src/validate.ts:44-52). It
     * surfaces only in apps/shrink because that package sets
     * types: ["@cloudflare/workers-types"] with no node types, and its tsconfig pulls
     * validate.ts in transitively - container/report.ts imports SIZE_WARNING_BYTES
     * from it as a VALUE. tools/asset-pipeline typechecks the same file and passes,
     * because it sets types: ["node"].
     *
     * So holding three packages froze 24 days of updates across apps/cms and
     * apps/viewer for a fault neither of them has. Both ran 5.20260827.1 from 2026-08-29
     * and 5.20260925.1 from 2026-09-26; each time all five workspaces typechecked clean -
     * measured, not assumed.
     */
    scope: ['apps/shrink'],
    /** What the unaffected workspaces run, asserted so the narrowing cannot un-narrow. */
    elsewhere: '5.20260925.1',
    why: 'every release from 5.20260808.1 on fails the apps/shrink typecheck with "Property readUInt32LE does not exist on type NonSharedBuffer" x3 plus one arity error, ALL in readGlbGenerator (validate.ts:44-52). Bisected 2026-08-12 across 0804/0808/0809/0810; re-measured 2026-08-18 on 5.20260817.1 and again 2026-08-29 on 5.20260827.1 and 2026-09-26 on 5.20260925.1, still broken. It surfaces ONLY in apps/shrink, which sets types:["@cloudflare/workers-types"] with no node types.',
    releaseWhen:
      'either the Buffer typings settle upstream, or readGlbGenerator stops being reachable from the apps/shrink program. container/report.ts imports SIZE_WARNING_BYTES from validate.ts as a VALUE, so moving that constant and the GlbReport type into a node-free module would release the hold without waiting on Cloudflare. Retry with the apps/shrink typecheck specifically, never pnpm typecheck alone.',
  },
] as const

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
