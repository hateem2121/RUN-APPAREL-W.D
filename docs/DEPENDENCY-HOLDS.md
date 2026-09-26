# Dependency holds — the full history

**In plain words:** The few outside packages we keep on an older version on purpose, and why.

Moved out of the root `CLAUDE.md` on 2026-08-29, when that file needed room under the
39,000-character gate. **The live rule stayed in `CLAUDE.md` → Traps.** What is here is
the evidence: every re-measurement, the bisect, and why the hold is as wide as it is.

Read this before changing the hold, and re-run the two steps at the bottom rather than
trusting the dates.

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

Negative control run in both directions: bumping `apps/shrink` too produces exactly
four errors, all in `tools/asset-pipeline/src/validate.ts` lines 47-50, which is
`readGlbGenerator`. Restoring the hold clears them. So the break is real, and it is
confined to one function.

**Why only there.** `apps/shrink` sets `"types": ["@cloudflare/workers-types"]` with no
node types, and its tsconfig reaches `validate.ts` transitively because
`container/report.ts` imports `SIZE_WARNING_BYTES` from it as a **value**.
`tools/asset-pipeline` checks the same file under `"types": ["node"]` and passes.

**How to release it without waiting on Cloudflare.** Move `SIZE_WARNING_BYTES` and the
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
  ✅ **wrangler 4.137.0 raised the peer to `^5.20260921.1` and 4.140.0 to `^5.20260923.1`,
  which briefly put the same cosmetic warning on `apps/cms` and `apps/viewer`.** Both were
  raised to `5.20260925.1` on 2026-09-26, so the warning is back to `apps/shrink` alone —
  the real hold.

---

## How to re-test the hold

1. **Negative control first.** In a real `git worktree` at the held version, run
   `npx --yes pnpm@10.34.5 --filter @run-apparel/shrink typecheck` and confirm it exits 0.
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
