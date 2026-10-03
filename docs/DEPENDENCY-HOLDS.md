# Dependency holds — the full history

**In plain words:** The few outside packages we keep on an older version on purpose, and why.

Moved out of the root `CLAUDE.md` on 2026-08-29, when that file needed room under the
39,000-character gate. **The live rule stayed in `CLAUDE.md` → Traps.** What is here is
the evidence: every re-measurement, the bisect, and why the hold is as wide as it is.

Read this before changing the hold, and re-run the two steps at the bottom rather than
trusting the dates.

---

## RELEASED 2026-10-03 — `@cloudflare/workers-types` is one version everywhere again

The owner chose to fix the cause after Dependabot's pull request #126 proposed raising
`apps/shrink` to `5.20260926.1`. Measured that day, in a real worktree on that branch:

| step | result |
| --- | --- |
| `apps/shrink` typecheck on `5.20260926.1`, before the change | exit 1, the same four errors, `validate.ts` lines 48-51 |
| `tsc --explainFiles` on `apps/shrink` | `validate.ts` was in the program only because `container/report.ts` (a value and a type import) and `src/containerReport.test.ts` (a type-only import) named it |
| after the change | exit 0, and `validate.ts` is no longer in the program |
| one `import type { GlbReport } from '…/validate'` planted back | the same four errors return |

**What changed.** The report's shape (`GlbReport`), `SIZE_WARNING_BYTES` and
`describeSoftArtwork` moved into `tools/asset-pipeline/src/glb-report.ts`, which imports
nothing from Node; `validate.ts` re-exports all three, so the pipeline's own imports did not
change, and the Worker's report imports them from the new file. The fix written below on
2026-08-29 named only the constant and the type: `describeSoftArtwork` was imported from the
same file since, and a type-only import pulls the whole file into the typecheck too.

**What keeps it released.** `apps/cms/src/dependencyPolicy.test.ts` follows every relative
import `apps/shrink` typechecks and fails, naming the fix, if `validate.ts` is reached again
(three planted breaks: a direct type import, an import through `glb-report.ts`, and
`apps/shrink` pinned back to the old version, which its shared-version rule refuses). The
`explain-failure` hook names the same fix when the `readUInt32LE` error appears.

---

## NARROWED 2026-08-29 — the hold now covers `apps/shrink` only

It had been applied to all three workspaces that declare it. Measured that day:

| workspace | version | typecheck |
| --- | --- | --- |
| `apps/cms` | **5.20260827.1** | passes |
| `apps/viewer` | **5.20260827.1** | passes |
| `apps/shrink` | 5.20260804.1 (held) | passes — and fails on 5.20260827.1 |

**Re-measured 2026-09-26** with the procedure below, in a real worktree:

| workspace | version | typecheck |
| --- | --- | --- |
| `apps/cms` | **5.20260925.1** (raised that day) | passes |
| `apps/viewer` | **5.20260925.1** (raised that day) | passes |
| `apps/shrink` | 5.20260804.1 (held) | passes — and fails on 5.20260925.1 with the same four errors in `readGlbGenerator` |

**Re-measured 2026-10-03** on Dependabot's `needs-hand-sync` pull request (#121), which
raised all three:

| workspace | version | typecheck |
| --- | --- | --- |
| `apps/cms` | **5.20260926.1** (raised that day) | passes |
| `apps/viewer` | **5.20260926.1** (raised that day) | passes |
| `apps/shrink` | 5.20260804.1 (held) | passes — and failed on 5.20260926.1 in CI with the same four errors in `readGlbGenerator` |

Negative control run in both directions: bumping `apps/shrink` too produces exactly
four errors, all in `tools/asset-pipeline/src/validate.ts` lines 47-50, which is
`readGlbGenerator`. Restoring the hold clears them. So the break is real, and it is
confined to one function.

**Why only there.** `apps/shrink` sets `"types": ["@cloudflare/workers-types"]` with no
node types, and its tsconfig reaches `validate.ts` transitively because
`container/report.ts` imports `SIZE_WARNING_BYTES` from it as a **value**.
`tools/asset-pipeline` checks the same file under `"types": ["node"]` and passes.

**How to release it without waiting on Cloudflare** (done 2026-10-03, with one more
function than this names — see the top of this page). Move `SIZE_WARNING_BYTES` and the
`GlbReport` type into a module with no node imports. `report.ts` then imports types and
a constant only, `validate.ts` never enters the Worker's program, and
`readGlbGenerator` stops being typechecked under Worker types. Not done here because it
touches module boundaries the audit had not reviewed, and the narrowing already recovers
the value.

**The split is enforced.** `apps/cms/src/dependencyPolicy.test.ts` asserts the held
version in `apps/shrink` **and** asserts every other workspace is on `elsewhere` — so
the hold cannot quietly widen again, which is what it had done. The shared-version
divergence rule exempts a dep only when a HOLD explains it; an unexplained split still
fails. Both directions have controls.

---

## `@cloudflare/workers-types` — held at 5.20260804.1

- **`@cloudflare/workers-types` is HELD at `5.20260804.1` — the break begins at
  `5.20260808.1`.** Bisected 2026-08-12 across 0804/0808/0809/0810: 0804.1 passes,
  every release from 0808.1 on fails `apps/shrink` typecheck with
  `Property 'readUInt32LE' does not exist on type 'NonSharedBuffer'` ×3 plus one
  arity error, all in `tools/asset-pipeline/src/validate.ts`. Note **where it does
  not surface**: `tools/asset-pipeline` typechecks that same file and passes,
  because it sets `"types": ["node"]` while `apps/shrink/tsconfig.json` sets
  `"types": ["@cloudflare/workers-types"]` and no node types — so the Worker
  resolves `readFile`'s Buffer against workers-types' own definitions, and only the
  Worker sees the change. `@types/node` looks like the culprit and is not: it was
  reverted first, the failure persisted, and 26.2.0 was restored once
  workers-types was isolated. **Bisect; do not revert the plausible one.**
  ⚠️ **RE-MEASURED 2026-08-18: THE BREAK PERSISTS. The hold stands.** Tested
  `5.20260817.1` (the newest release the 24h cooldown allows; `5.20260818.1` was
  8h old and would have been refused SILENTLY): `apps/shrink` typecheck exits **1**
  with the documented signature exactly — `readUInt32LE does not exist on type
  'NonSharedBuffer'` ×3 plus one `Expected 0 arguments, but got 3`, all in
  `tools/asset-pipeline/src/validate.ts`. **The negative control passed first**:
  the same worktree at the held `5.20260804.1` exits **0**. That step is not
  optional — the 2026-08-17 audit's attempt at this used an isolated synthetic
  harness, could not reproduce the passing baseline, and correctly discarded its
  own result as untrustworthy. Use a real `git worktree`, so `apps/shrink`'s own
  `tsconfig.json` is what resolves the types. Next candidate: whatever is newest
  and older than 24h; re-run the same two steps and replace this measurement.
  `5.20260804.1` was not an arbitrary floor: it was also exactly the peer minimum
  `wrangler` asked for, so holding any lower — 0726.1 was the first guess — traded
  a typecheck failure for a permanent unmet-peer warning.
  ⚠️ **That convenient coincidence ENDED on 2026-08-12 and this paragraph used to
  say the two versions "happen to be the same one".** Measured: 4.120.1 and 4.121.0
  both ask `^5.20260804.1`; **4.122.0 asks `^5.20260811.1`**, which the hold cannot
  satisfy. The repo took 4.122.0 anyway, by owner decision, so it now carries that
  unmet-peer warning permanently and on purpose. It is **cosmetic** — verified with
  4.122.0 installed against 5.20260804.1: lint, typecheck 5/5, 621 tests, build and
  the container typecheck all exit 0. **Do not "fix" the warning by raising
  workers-types** — that trades a cosmetic warning for the real `readUInt32LE`
  break above, i.e. the same bad trade in the opposite direction.
  ✅ **wrangler 4.137.0 raised the peer to `^5.20260921.1`, 4.140.0 to `^5.20260923.1` and 4.141.0 (2026-10-03) to `^5.20260925.1`,
  which briefly put the same cosmetic warning on `apps/cms` and `apps/viewer`.** Both were
  raised to `5.20260925.1` on 2026-09-26, so the warning is back to `apps/shrink` alone —
  the real hold.

---

## How to re-test the hold

1. **Negative control first.** In a real `git worktree` at the held version, run
   `npx --yes pnpm@12.6.0 --filter @run-apparel/shrink typecheck` and confirm it exits 0.
   A synthetic harness is not good enough — the 2026-08-17 audit built one, could not
   reproduce the passing baseline, and correctly discarded its own result.
2. Then bump to the newest release older than 24h and run the same command.
3. Replace the measurement above with what you got, and say which version you tested.

---

## Held because another package's own range forbids the newer one (2026-09-26)

Not faults of ours: in each case a package we depend on declares a version range, and the
newest release sits outside it. Installing past it would trade a stale package for a broken
one. Measured from the installed `package.json` files on 2026-09-26.

| held | at | newest | why | release it when |
| --- | --- | --- | --- | --- |
| `graphql` (`apps/cms`) | 16.14.2, newest 16 | 17.0.2 | `payload` 3.90.2 and `@payloadcms/next` 3.90.2 both declare `graphql: ^16.8.1` | a Payload release widens that range to include 17 |
| `three` (`apps/viewer`, `tools/asset-pipeline`) | 0.183.2 | 0.186.1 | `@google/model-viewer` 4.3.1, its newest release, declares `three: ^0.183.0` | a model-viewer release accepts a newer `three` |

To re-check either: `npm view payload peerDependencies.graphql` and
`npm view @google/model-viewer peerDependencies.three`, against the newest versions.

---

## A package we patch: `@google/model-viewer` 4.3.1 (2026-10-02)

Not a hold, but it changes what upgrading that package means, so it is written down here.
`pnpm-workspace.yaml` carries one `patchedDependencies` entry, and
`patches/@google__model-viewer@4.3.1.patch` is its file.

**What it does.** The library calls `console.log` nine times in its own source (four in
`lib/model-viewer-base.js`, three in `lib/features/ar.js`, one each in
`lib/three-components/Renderer.js` and `lib/three-components/ARRenderer.js`: "[$updateSource]
BAILING OUT EARLY!" and the like), and a garment page printed six of them on every visit (visual
audit VA-10). The patch turns those nine statements, and only those, into one-line comments. No
line moves, so the library's shipped source maps stay aligned. Its `console.warn` and
`console.error` calls, which are real problem reports, and everything of `three` are untouched.

**Why a patch and not a bundler rule.** Read 2026-10-02:

| way | verdict |
| --- | --- |
| Next.js `compiler.removeConsole` | documented for "application code (not `node_modules`)", with `exclude` as its only option (nextjs.org/docs/architecture/nextjs-compiler, v16.3.8, page updated 2025-05-19). No per-package form, and it would delete the site's own `console.log` calls too |
| a Turbopack `rules` loader | documented, and `condition.path` can aim at one package (nextjs.org/docs/app/api-reference/config/next-config-js/turbopack, v16.3.8, page updated 2026-08-25), but it is custom loader code that reaches the website only; the garment pages build with Vite |
| a Vite plugin | reaches the garment pages only |
| a pnpm patch (pnpm.io/cli/patch) | nine one-line changes; reaches every bundler, both apps and `tools/asset-pipeline` |

**Measured 2026-10-02.** The website's build (Next.js 16.3.6, Turbopack): each of the nine
messages stood once in the client files and once in the server files, 18 in all. With the patch: 0
of 18, while the library's own warning text is still in both, so the scan was reading the library.
The garment pages' build: the model-viewer chunk went from 1,024,019 to 1,023,362 bytes, "BAILING
OUT EARLY" from 1 to 0, `console.log` from 13 to 4 (the four left are not model-viewer's: three.js's
own `log()` helper and others), `console.warn` stayed 84 and `console.error` stayed 24.

**It cannot be lost quietly.** With the entry taken out of `pnpm-workspace.yaml`,
`pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. Installing another
version of the package fails with `ERR_PNPM_UNUSED_PATCH`. Both were measured with pnpm 12.6.0.
`apps/cms/src/modelViewerQuiet.test.ts` reads the installed library for a `console.log`, the patch
for anything but those nine lines, and, in CI's built-config step, the website build for the nine
messages.

**When model-viewer is upgraded.** pnpm refuses until the entry is dealt with:

1. Change the version in `apps/cms`, `apps/viewer` and `tools/asset-pipeline`, delete the entry and
   the patch file, run `pnpm install`.
2. Run `apps/cms/src/modelViewerQuiet.test.ts`. If the new version no longer prints through
   `console.log`, nothing is left to patch: delete that test and stop.
3. If it still prints: `pnpm patch @google/model-viewer@<new version>`, turn each `console.log(...)`
   line in the folder's `lib/` (not `lib/test/`) into a one-line comment, then
   `pnpm patch-commit '<the folder it printed>'`. Update the test's list of messages if they changed.

The pipeline's own npm lockfile, which only Docker reads, lists model-viewer as a development
dependency and is not patched.
