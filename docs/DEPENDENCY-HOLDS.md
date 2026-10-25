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
| `apps/shrink` | 5.20260804.1 (held then) | passes — and fails on 5.20260827.1 |

**Re-measured 2026-09-26** with the procedure below, in a real worktree:

| workspace | version | typecheck |
| --- | --- | --- |
| `apps/cms` | **5.20260925.1** (raised that day) | passes |
| `apps/viewer` | **5.20260925.1** (raised that day) | passes |
| `apps/shrink` | 5.20260804.1 (held then) | passes — and fails on 5.20260925.1 with the same four errors in `readGlbGenerator` |

**Re-measured 2026-10-03** on Dependabot's `needs-hand-sync` pull request (#121), which
raised all three:

| workspace | version | typecheck |
| --- | --- | --- |
| `apps/cms` | **5.20260926.1** (raised that day) | passes |
| `apps/viewer` | **5.20260926.1** (raised that day) | passes |
| `apps/shrink` | 5.20260804.1 (held then) | passes — and failed on 5.20260926.1 in CI with the same four errors in `readGlbGenerator` |

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

## HISTORY — `@cloudflare/workers-types` was held at 5.20260804.1 (released 2026-10-03)

> **Not a live hold.** It was released on 2026-10-03; see "RELEASED 2026-10-03" at the top of
> this page. What follows is the evidence from the time the hold stood, kept as history, and
> its present tense ("is HELD") describes then, not now.

- **`@cloudflare/workers-types` was HELD at `5.20260804.1` — the break began at
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

## How the hold was re-tested (history; the hold was released 2026-10-03)

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
| `graphql` (`apps/cms`) | 16.14.2, newest 16 | 17.0.2 | `payload` 3.92.0 and `@payloadcms/next` 3.92.0 both declare `graphql: ^16.8.1` (re-read 2026-10-24) | a Payload release widens that range to include 17 |
| `three` (`apps/viewer`, `tools/asset-pipeline`) | 0.183.2 | 0.186.1 | `@google/model-viewer` 4.4.0, its newest release (re-read 2026-10-24), declares `three: ^0.183.0` | a model-viewer release accepts a newer `three` |

To re-check either: `npm view payload peerDependencies.graphql` and
`npm view @google/model-viewer peerDependencies.three`, against the newest versions.

## `draco3dgltf` held at 1.5.7 (2026-10-23)

**In plain words:** the newest Draco (the 3D compression library) changed how it hands its
memory to other code, and the library we read 3D files with has not caught up, so we stay on
the previous Draco.

Dependabot's `needs-hand-sync` pull request #226 moved it 1.5.7 → 1.5.8 (published
2026-10-15). On CI one pipeline test failed: `tools/asset-pipeline/src/pipeline.test.ts`,
"applies Draco compression when requested and stays parseable with variants intact",
with `TypeError: Cannot read properties of undefined (reading 'buffer')` thrown in
`decodeAttribute` of `@gltf-transform/extensions` 4.5.1 while reading the file back.

The cause, read from both packages' published files on 2026-10-23 (nothing executed):
1.5.7's `draco_decoder_gltf_nodejs.js` assigns `a.HEAP8`, `a.HEAPU16`, `a.HEAPU32` and
`a.HEAPF32` onto the module; 1.5.8's contains none of the four names. glTF-Transform's
decoder (`khr-draco-mesh-compression/decoder.ts`) reads `decoderModule.HEAPF32.buffer`,
`HEAPU16.buffer` and `HEAPU32.buffer` to copy each decoded attribute out. 4.5.1 is the
newest glTF-Transform (2026-09-28), and no upstream issue named this on 2026-10-23.

`.github/dependabot.yml` ignores `draco3dgltf >= 1.5.8`. Release it when a glTF-Transform
release reads Draco 1.5.8: bump both, then run `pnpm --filter @run-apparel/asset-pipeline
test` — that Draco test is the check, and it fails on the pair that does not fit.

## `next` held below 16.4 — RELEASED 2026-10-23 (held from 2026-10-14)

**Released for security.** Next.js 16.0–16.4.0 carry two critical remote-code-execution
advisories and a Server Actions denial of service (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr,
GHSA-p3m5-59mp-jv5r; nextjs.org/blog/nextjs-security-update-october-14-2026, read 2026-10-23),
fixed only in 16.4.1, with no 16.3 backport. They failed `audit` on PR #223. OpenNext 1.20.12
(2026-10-15) names "support for Next.js 16.4" and 1.20.13 requires `next >=16.4.1`, so the
release condition below was met. Taken: `next` 16.4.2 and `@opennextjs/cloudflare` 1.20.13,
wrangler 4.148.0 unchanged.

**The build still failed at first, for a reason of ours.** Next 16.4's minifier folds
`['wr', 'angler'].join('')` in `apps/cms/src/payload.config.ts` into a literal
`import("wrangler")`, which 16.3 left alone, and OpenNext's esbuild pass then bundled wrangler
and Miniflare (476 mentions, dry run `Could not resolve "sqlite"`): the same signature as the
table below, so the 2026-10-14 failure was very likely this too. The join now takes its
separator from `process.env.PAYLOAD_LOCAL_D1`, which no build can know. Measured after:

| next | OpenNext | wrangler | literal `import("wrangler")` | Miniflare code in the Worker | dry run |
| --- | --- | --- | --- | --- | --- |
| 16.4.2 | 1.20.13 | 4.148.0 | 0 | 0 (2 mentions: a library's error message) | 42,221 KiB |

`handler.mjs` is now a 49-byte stub that re-exports the real handler in a folder beside it, so its byte count
no longer compares with the rows below; the dry run is the figure to compare.

**Re-measured 2026-10-24** on `next` 16.4.3, `@opennextjs/cloudflare` 1.20.13 (still the newest; its
peer is `next >=15.5.28 <16 || >=16.4.1`), wrangler 4.152.0, Payload 3.92.0, with
`opennextjs-cloudflare build` and `scripts/check-cms-worker-size.mjs`: literal `import("wrangler")`
in `.open-next`: 0 files; Miniflare in the Worker: only the drizzle-kit error-message text
("If you are using Miniflare 2, please update…", 3 files); dry run **42,070 KiB** against 42,289 KiB
on the same machine one step earlier (`next` 16.4.2, Payload 3.91.0, wrangler 4.151.1).

### The hold as it stood (2026-10-14)

Not a declared range this time: `@opennextjs/cloudflare` declares `next: >=15.5.27 <16 || >=16.3.8`,
which admits 16.4. Its release notes name 16.3.8 as the newest required version (1.20.8,
2026-10-02) and no release up to 1.20.11 (2026-10-13) mentions 16.4. Measured on Dependabot's
PR #173 with `opennextjs-cloudflare build` and `scripts/check-cms-worker-size.mjs`:

| next | OpenNext | wrangler | handler.mjs | Miniflare in it | dry run |
| --- | --- | --- | --- | --- | --- |
| 16.3.8 (main) | 1.20.6 | 4.143.0 | 30,721,252 B | 0 | 43,290 KiB |
| 16.4.0 | 1.20.9 | 4.143.0 | 44,952,572 B | 186 mentions | fails: `Could not resolve "sqlite"`, `import()` with attributes |
| 16.4.0 | 1.20.9 | 4.148.0 | — | — | fails the same way |
| 16.3.8 | 1.20.9 | 4.143.0 | 30,717,499 B | 0 | 43,296 KiB |

OpenNext 1.20.11 + wrangler 4.148.0 could not be tried that day: it was younger than
`minimumReleaseAge` (1 day). Release the hold (the `next` ignore in `.github/dependabot.yml`)
when an OpenNext release names Next 16.4, and only after `opennextjs-cloudflare build` on it
shows no Miniflare in `handler.mjs` and a dry-run size within a few KiB of the row above.

---

## A package we patch: `@google/model-viewer` 4.4.0 (2026-10-02; cut to one line 2026-10-24)

Not a hold, but it changes what upgrading that package means, so it is written down here.
`pnpm-workspace.yaml` carries one `patchedDependencies` entry, and
`patches/@google__model-viewer@4.4.0.patch` is its file.

**Since 2026-10-24 the patch is ONE line, not nine.** model-viewer 4.4.0 (2026-10-09, its #5182,
"Removed leftover debug console logs") deleted eight of the nine calls itself. Read from the
installed 4.4.0 files that day: `lib/model-viewer-base.js`, `lib/features/ar.js` and
`lib/three-components/ARRenderer.js` have no `console.log`; `lib/three-components/Renderer.js` still
has one, `console.log('could not acquire 2d context')` in `copyPixels` (line 319), and that is the
statement the patch now turns into a comment. The rest of this section is how it stood on 4.3.1.

**What it did on 4.3.1.** The library called `console.log` nine times in its own source (four in
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
for anything but the console.log lines it removes (one now), and, in CI's built-config step, the
website build for the message.

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
