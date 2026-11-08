import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Whether `.next` describes the code that would be tested, and how the build-artifact
 * tests must treat it.
 *
 * WHY (gates run, 9 Nov 2026): `node .claude/skills/gates/run-gates.mjs` failed its `test`
 * gate on a clean tree at 6d81c4d3 while CI was green on the same commit. Both
 * src/hostRulesManifest.test.ts and src/notFoundCsp.test.ts read
 * `.next/routes-manifest.json`, and their skip guard — `it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)`
 * — skips only when artifacts are ABSENT. Artifacts present but built from an older commit
 * (this Mac's `.next` carried `site-e8b47f260a16e393b211`, a redirect wave behind) ran the
 * assertions and failed them: 79 built redirects against 82 source rules, and no built rule
 * for `/guides/aql-inspection`. CI never sees this — a fresh checkout has no `.next` at all,
 * so there the tests skip. The failure is local-only, which is the worst kind: it teaches
 * the developer to distrust a green gate.
 *
 * The freshness oracle is the build's own fingerprint. next.config.mjs hands
 * `siteSourceBuildId()` (siteBuild.mjs) to Next as the build ID, so `.next/BUILD_ID` names
 * the exact committed source tree the artifacts were made from. Equal ids mean fresh;
 * anything else — no BUILD_ID file, an older commit, uncommitted source, an unfingerprinted
 * dev build — cannot be proven fresh and must not read as fresh.
 *
 * Decision table, applied by the two consumers:
 * - fresh   → run the assertions (they compare like against like).
 * - stale   → skip locally (a false failure proves nothing); FAIL under
 *             REQUIRE_BUILD_ARTIFACTS=1, where the flag means "I just built, this must
 *             match" (CI's post-build guard steps, the `routes` and `built-config` gates).
 * - missing → as before: skip locally, fail under the flag.
 */
export type BuildArtifactState =
  | { kind: 'fresh' }
  | { kind: 'missing' }
  | { kind: 'stale'; built: string; current: string | null }

export function classifyBuildArtifacts(
  hasManifest: boolean,
  builtId: string | null,
  currentId: string | null,
): BuildArtifactState {
  if (!hasManifest) return { kind: 'missing' }
  if (builtId !== null && currentId !== null && builtId === currentId) return { kind: 'fresh' }
  return { kind: 'stale', built: builtId ?? '', current: currentId }
}

/**
 * The build ID the artifacts in `<cmsRoot>/.next` were made from; null when there is none.
 * This is the dev-tree `.next/BUILD_ID` that `next build` stamps — not siteBuild.mjs's
 * BUILD_ID_FILE, which is the OpenNext output the deploy reads.
 */
export function readBuiltBuildId(cmsRoot: string): string | null {
  const file = join(cmsRoot, '.next', 'BUILD_ID')
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8').trim() || null
}
