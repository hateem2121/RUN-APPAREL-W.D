import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * FA-O-72 — "the HIGH-severity advisory never reaches a visitor".
 *
 * ⚠️ WHAT THAT SENTENCE ACTUALLY MEANT, AND WHY IT NEEDED A GATE. Measured 2026-09-07,
 * `pnpm audit` on this tree returns exactly two advisories:
 *
 *   HIGH      extract-zip <=2.0.1   GHSA-jmr9-qjv8-65gv / CVE-2026-56876, CVSS 8.1
 *             unvalidated symlink path traversal on extract; `patched_versions: <0.0.0`,
 *             i.e. there is no fix to take.
 *             ONE path: `.` > @lhci/cli > lighthouse > puppeteer-core >
 *             @puppeteer/browsers > extract-zip
 *   MODERATE  payload <=3.88.0      GHSA-jg8r-5jh2-v2xj — the account-unlock flaw,
 *             audit row FA-O-71, also unpatched. That one IS in a deployed app and is
 *             tracked as an open finding; it is not what this file is about.
 *
 * The HIGH one is harmless HERE and only here: `@lhci/cli` is a Lighthouse runner
 * declared once, in the ROOT workspace, as a devDependency. It never enters the CMS
 * Worker, the viewer bundle or the shrink container, and nothing it unzips comes from a
 * visitor. That is a property of where the dependency sits — and a dependency moves.
 * Adding Lighthouse to `apps/cms` to script an audit, or any package in a deployed
 * workspace picking up `extract-zip`, turns a documented non-issue into a shipped
 * CVSS 8.1 with no patch available and no gate anywhere that would say so.
 *
 * ⚠️ THIS READS THE LOCKFILE, NOT `npm audit`. A test that shells out to the advisory
 * API needs the network, and this repo has already recorded what a runner's 403 does to
 * a gate that treats an unreachable service as a failed assertion. The lockfile is the
 * same fact offline: it is what `pnpm install --frozen-lockfile` builds from.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const LOCKFILE = join(REPO_ROOT, 'pnpm-lock.yaml')

/** The package the HIGH advisory is against. */
const ADVISORY_PACKAGE = 'extract-zip'
/** The only root it is allowed to hang from — a root-level devDependency. */
const ALLOWED_TOOL = '@lhci/cli'
/** Everything that is built and shipped. `.` is the repo root and ships nothing. */
const DEPLOYED_WORKSPACES = [
  'apps/cms',
  'apps/viewer',
  'apps/shrink',
  'packages/shared',
  'packages/ui',
  'tools/asset-pipeline',
]

type Lock = {
  /** workspace path -> { dependencies: names, devDependencies: names } */
  importers: Map<string, { dependencies: string[]; devDependencies: string[] }>
  /** package name -> names it depends on */
  edges: Map<string, Set<string>>
}

/**
 * A line parser, not a YAML parser — there is none resolvable from this workspace, and
 * `workflowHardening.test.ts` already carries the account of why a half-parser that
 * silently returns nothing is worse than no gate. Every assumption it makes about the
 * file's shape is asserted in `the parser found a real tree` below, so a lockfile format
 * change fails here loudly instead of emptying the graph and passing.
 *
 * The two sections it reads, in lockfileVersion 9:
 *
 *   importers:            snapshots:
 *     apps/cms:             extract-zip@2.0.1:
 *       dependencies:         dependencies:
 *         payload:              debug: 4.4.3
 *           specifier: …
 */
function parseLock(source: string): Lock {
  const importers = new Map<string, { dependencies: string[]; devDependencies: string[] }>()
  const edges = new Map<string, Set<string>>()

  let section: 'importers' | 'snapshots' | null = null
  let importer: string | null = null
  let bucket: 'dependencies' | 'devDependencies' | null = null
  let snapshot: string | null = null

  for (const raw of source.split('\n')) {
    if (/^[a-zA-Z]/.test(raw)) {
      const head = raw.replace(/:.*$/, '')
      section = head === 'importers' ? 'importers' : head === 'snapshots' ? 'snapshots' : null
      importer = null
      snapshot = null
      continue
    }
    if (!section || !raw.trim()) continue
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()

    if (section === 'importers') {
      // ⚠️ `packages/ui: {}` — a workspace with no dependencies is written as an INLINE
      // empty map, not as a bare key. The first draft of this parser matched only
      // `name:` and silently dropped it; the negative control below caught it.
      const importerHead = /^(.+?):(?: \{\})?$/.exec(line)
      if (indent === 2 && importerHead) {
        importer = importerHead[1] as string
        bucket = null
        importers.set(importer, { dependencies: [], devDependencies: [] })
        continue
      }
      if (indent === 4 && (line === 'dependencies:' || line === 'devDependencies:')) {
        bucket = line.slice(0, -1) as 'dependencies' | 'devDependencies'
        continue
      }
      if (indent === 6 && line.endsWith(':') && importer && bucket) {
        importers.get(importer)?.[bucket].push(unquote(line.slice(0, -1)))
      }
      continue
    }

    // snapshots
    if (indent === 2 && line.endsWith(':')) {
      snapshot = packageNameOf(unquote(line.replace(/:( \{\})?$/, '')))
      if (!edges.has(snapshot)) edges.set(snapshot, new Set())
      continue
    }
    if (indent === 6 && snapshot && line.includes(': ')) {
      edges.get(snapshot)?.add(unquote(line.slice(0, line.indexOf(': '))))
    }
  }

  return { importers, edges }
}

const unquote = (value: string) => value.replace(/^['"]|['"]$/g, '')

/** `@scope/name@1.2.3(peer@4)` -> `@scope/name`. */
function packageNameOf(key: string): string {
  const withoutPeers = key.replace(/\(.*$/, '')
  const at = withoutPeers.lastIndexOf('@')
  return at > 0 ? withoutPeers.slice(0, at) : withoutPeers
}

/** Every package name reachable from `roots`, following the snapshot graph. */
function closureOf(lock: Lock, roots: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.pop() as string
    if (seen.has(name)) continue
    seen.add(name)
    for (const next of lock.edges.get(name) ?? []) queue.push(next)
  }
  return seen
}

const lock = parseLock(readFileSync(LOCKFILE, 'utf8'))

describe('FA-O-72 — the HIGH advisory is confined to a root build tool', () => {
  it('the parser found a real tree, so nothing below compares empty to empty', () => {
    // The negative control for the whole file. Every assertion here is "X is NOT in
    // set Y", and an empty Y satisfies all of them.
    expect(lock.importers.size, 'no importers parsed out of pnpm-lock.yaml').toBeGreaterThan(5)
    expect(lock.edges.size, 'no dependency edges parsed out of pnpm-lock.yaml').toBeGreaterThan(500)
    for (const workspace of DEPLOYED_WORKSPACES) {
      expect(lock.importers.has(workspace), `${workspace} is not an importer any more`).toBe(true)
    }
    // and the one edge this file is entirely about is really in the graph
    expect(
      lock.edges.get('@puppeteer/browsers')?.has(ADVISORY_PACKAGE),
      'the @puppeteer/browsers -> extract-zip edge is gone; re-read pnpm audit before ' +
        'trusting anything in this file',
    ).toBe(true)
  })

  it('and the closure walk really reaches things, proved on a package we ship', () => {
    // Second negative control, on the direction that matters: `closureOf` must return a
    // deep transitive, not just the roots it was handed. `payload` is a direct CMS
    // dependency and `drizzle-orm` is underneath it.
    const cms = lock.importers.get('apps/cms')
    const closure = closureOf(lock, [...(cms?.dependencies ?? []), ...(cms?.devDependencies ?? [])])
    expect(closure.has('payload')).toBe(true)
    expect(closure.size, 'the CMS closure is implausibly small').toBeGreaterThan(200)
  })

  it('is declared once, at the repo root, as a devDependency', () => {
    const root = lock.importers.get('.')
    expect(root?.devDependencies, `${ALLOWED_TOOL} left the root devDependencies`).toContain(
      ALLOWED_TOOL,
    )
    expect(
      root?.dependencies ?? [],
      `${ALLOWED_TOOL} became a root RUNTIME dependency`,
    ).not.toContain(ALLOWED_TOOL)

    const elsewhere = [...lock.importers.entries()]
      .filter(([name]) => name !== '.')
      .filter(([, deps]) => [...deps.dependencies, ...deps.devDependencies].includes(ALLOWED_TOOL))
      .map(([name]) => name)
    expect(
      elsewhere,
      `${ALLOWED_TOOL} is now declared in a workspace of its own. It carries an unpatched ` +
        'CVSS 8.1 (extract-zip, GHSA-jmr9-qjv8-65gv) and the only reason that is acceptable ' +
        'is that it lives at the root and is never built into anything.',
    ).toEqual([])
  })

  it('cannot be reached from anything that is built and shipped', () => {
    const offenders: string[] = []
    for (const workspace of DEPLOYED_WORKSPACES) {
      const deps = lock.importers.get(workspace)
      if (!deps) continue
      // devDependencies included on purpose: a build-time dependency of a deployed app
      // runs on a machine holding this repo's deploy credentials, which is a worse place
      // to unzip a hostile archive than a Lighthouse run on a throwaway runner.
      const closure = closureOf(lock, [...deps.dependencies, ...deps.devDependencies])
      if (closure.has(ADVISORY_PACKAGE)) offenders.push(workspace)
    }
    expect(
      offenders,
      `${ADVISORY_PACKAGE} is now reachable from a deployed workspace. The advisory is ` +
        'HIGH (CVSS 8.1) with no patched version, so this cannot be closed by an upgrade — ' +
        'the dependency that pulled it in has to go, or the risk has to be accepted in ' +
        'writing in docs/DEPENDENCY-HOLDS.md.',
    ).toEqual([])
  })
})
