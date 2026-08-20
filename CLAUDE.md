# CLAUDE.md — working notes for AI sessions on this repo

Read this before changing anything. It is short on purpose: it holds only the
things that have *actually* caused production incidents here, and the traps that
have already cost more than one session each.

Full history is in `docs/HARDENING-LOG.md`; per-session detail in
`docs/SESSION-*.md`; operational how-tos in `docs/RUNBOOK.md`.

## What this is

A QR-deep-linkable 3D apparel viewer. A CLO 3D export goes in, a compressed GLB
comes out, and a customer scans a tag and looks at the garment. **For a B2B
garment reference the printed artwork IS the product** — "the 3D loads" is not
success.

```
apps/viewer   Public 3D viewer (React + <model-viewer>, Cloudflare Worker + Static
              Assets; the Pages project was DELETED 2026-07-22 and survives only
              as the VIEWER_DEPLOY_TARGET=pages rollback)
apps/cms      Payload CMS on Cloudflare Workers + D1 + R2
apps/shrink   Queue-consumer Worker driving a Container that runs the pipeline
tools/asset-pipeline   The GLB pipeline (merge / optimize / validate / diagnostics)
packages/shared        Types + constants both sides must agree on
```

**The path a garment takes**, because no single directory shows it: CLO export →
CMS `RawUploads` → R2 **ingest** bucket → queue → `apps/shrink` → Container runs
`tools/asset-pipeline` → GLB + posters to R2 **media** (`media.wear-run.help`) →
written back onto the product → the viewer reads
`GET /api/public/viewer/:product/:colourway` from `cms.wear-run.help` and renders at
`viewer.wear-run.help`. The two buckets are not interchangeable: **ingest** carries a
14-day expiry rule and is in no backup, **media** is the one `scripts/backup-r2.mjs`
mirrors. That asymmetry is why the raw CLO export is a local artifact — see
`tools/asset-pipeline/CLAUDE.md`.

**The gates, in CI's order** — `pnpm` below means `npx --yes pnpm@10.33.0`:

```bash
pnpm install --frozen-lockfile   # after every merge; the lockfile moves often here
pnpm lint                        # biome check .
pnpm typecheck                   # 5 workspaces
pnpm test:coverage               # the full suite + the coverage floors (see below)
bash scripts/test-alert-shell.sh # the alert branch nothing else exercises
pnpm seed:assets && pnpm build   # build is the one that catches dependency breaks
node scripts/check-bundle-budget.mjs  # deterministic shell weight; needs the build above
pnpm eval:artwork                # separate CI job — gates the deploy
```

Three of these are invisible from the workspace, and that is why "it passed
locally" has failed twice: `apps/shrink/container` is not a pnpm member and gets
its own `npm install --no-audit --no-fund && npx tsc --noEmit` step in CI,
`eval:artwork` runs in a job of its own, and `check-bundle-budget` reads
`apps/viewer/dist` so it exits 1 unless `pnpm build` has already run.
⚠️ Until 2026-08-13 this paragraph claimed README's "Local development" list omits
some of these. It does not, and had not for some time — caught by running the
commands rather than re-reading the sentence (same lesson as
`eval:artwork:real -- raw/x.glb` below).

**`pnpm` is not on `PATH` on the owner's machine — use `npx --yes pnpm@10.33.0`.**
Every documented `pnpm <script>` in this repo means that. Bare `pnpm` fails with
exit **127**, and the failure is worth naming because of *where* it surfaces:
`apps/viewer/e2e/prepare.mjs` shells out to `pnpm build`, so the whole e2e suite
dies as `Timed out waiting 120000ms from config.webServer` with the real
`status: 127` buried inside a child process. `.claude/settings.json` and
`.claude/launch.json` already use the `npx` form; this line is why.

**`NODE_ENV=development` in the environment broke `next build` in a way that
named nothing.** Found 2026-08-09. The CMS build died with
`Error occurred prerendering page "/_global-error"` and
`TypeError: Cannot read properties of null (reading 'useContext')` — which reads
as a React-version or duplicate-copy problem, and was first blamed on an unused
`import React` that a linter had just removed. It was neither: Next prints only a
mild "non-standard NODE_ENV" warning twenty lines earlier, and the same tree
built cleanly the moment `NODE_ENV=production` was set. **Fixed at the source,
exactly as `PORT` was:** `apps/cms`'s build script is now
`NODE_ENV=production next build`, so the environment cannot reach it. Verified
with `NODE_ENV=development` still exported.

⚠️ **Where these variables come from is NOT settled — it has measured BOTH ways,
so assume neither.** 2026-08-09 both *were* set in the session environment
(`NODE_ENV=development`, `PORT=5002`) while appearing in none of `~/.zshrc`,
`~/.zshenv`, `~/.zprofile`, `~/.bash_profile` or `~/.profile`. 2026-08-13 and
again 2026-08-17, same machine, `env | grep -E '^(NODE_ENV|PORT)='` returned
nothing and a full gate run passed with no workaround. So the harness supplies
them *sometimes*. The consequence is the point: the owner's own terminal and any
two sessions can each see a different environment, so **"it works for me" proves
nothing about the other.** Both are fixed at the source anyway. **If a build or a
test server fails in a way that makes no sense, run
`env | grep -E 'NODE_ENV|PORT'` before reading any code** — three times now.

**A `PORT` set for another project produces the IDENTICAL error, and did on
2026-08-08.** `e2e/serve.mjs` reads `process.env.PORT ?? 4173` and inherits your
shell, so a global `PORT=5002` exported for a different repo binds the e2e server
to 5002 while Playwright polls 4173 — same two-minute wait, same
`Timed out waiting 120000ms from config.webServer`, same silence about the cause.
Two dead-end runs went by before anyone ran `echo $PORT`. **Fixed at the source:**
`playwright.config.ts` now owns the port and passes it via `webServer.env`, so the
environment cannot move the server. Verified with `PORT=5002` still set. If you
ever see that timeout again, the two candidates are these; check both before
believing the suite is broken.

**Running the CMS dev server DIRTIES the working tree and then `pnpm lint` fails.**
Found 2026-08-09. `next dev` rewrites two committed generated files —
`apps/cms/src/app/(payload)/admin/importMap.js` (Payload regenerates it, in its
own formatting, not Biome's) and `apps/cms/next-env.d.ts` (`./.next/types/…` →
`./.next/dev/types/…`). The import map's *content* is unchanged — same 27 keys,
verified — but the quote style and line wrapping are not, so `biome check .`
fails on formatting alone and the diff looks alarming. **Stop the dev server
first, then `git checkout --` both files**; restoring while it is still running
just loses the race, which is how this cost a cycle. Do not "fix" it by
reformatting the generated file into the repo.

**`admin.hidden` on a collection gates the admin ROUTES, not just the sidebar
entry.** Measured 2026-08-09 on payload 3.86.0: with `hidden: true`,
`/admin/collections/raw-uploads` renders the "Nothing found" page; with the
admin-only function it renders the normal list — same URL, same user. The REST
API is unaffected (`/api/raw-uploads` → 200), so a robot is never at risk, but
`docs/RUNBOOK.md` → "Re-processing a garment" links straight to
`/admin/collections/raw-uploads/<id>` and calls it *"the only way to start a
re-run"*. Hiding that collection removes the documented recovery path while
reading as a tidy-up. See the comment in `RawUploads.ts`.

**Four gates were added 2026-08-13 and each will stop you before CI does.**

- **Coverage floors are MEASURED, not chosen** (`vitest.coverage.mjs`, a
  `thresholds:` block per package, `scripts/check-coverage.mjs` for the repo).
  **Never lower one to go green.** `apps/viewer` is deliberately the lowest at 42%
  — do NOT "fix" it by excluding `App.tsx`/`Stage.tsx`; most of its uncovered
  lines are in those two, so dropping them reports a far higher number while
  testing identically. (`RenderPage.tsx` was the third until it was deleted on
  2026-08-17 with the poster-capture job; the floor was deliberately NOT raised
  to match — a threshold is a measurement, and a number a deletion happened to
  produce is one nobody measured.) They are covered by `apps/viewer/e2e/` in a
  real browser, because
  `<model-viewer>` under jsdom asserts against a stub. Every `include` is explicit
  on purpose: v8 without one omits untested files entirely, so coverage *rises*
  when you add untested code.
- **Module boundaries are lint-enforced** (`biome.jsonc` → `overrides` →
  `noRestrictedImports`): no node builtins in `packages/shared/src`,
  `apps/shrink/src`, `apps/viewer/src` or `apps/viewer/worker`, and no cross-app
  imports. Test files are exempt. `apps/shrink/container/` is plain Node and is
  not covered.
- **Every document is citation-checked, not just CLAUDE.md** — README, CONTRIBUTING,
  SECURITY and all of `docs/`. A genuinely-gone path goes in `ALLOWED_ABSENT`
  **with the reason**; `file.ts:42` and extension-less citations resolve fine.
  ⚠️ **`scripts/doc-citations.mjs` WAS a module with no `main` — that was fixed, and
  this paragraph said otherwise until 2026-08-19.** It told you the bare command
  "prints nothing and exits 0 having checked nothing", which cost a session that
  believed it. Measured 2026-08-19: `node scripts/doc-citations.mjs` prints a line per
  unresolved citation, then `570 citations checked across 43 documents`, and exits **1**
  when any fails. It is a usable command now. `apps/cms/src/claudeMd.test.ts` is still
  the CI gate, and `pnpm --filter @run-apparel/cms test` still the authority, because
  only the test enforces the recursive walk and the negative control — but the bare
  command is the fast local check, not a trap. Trusting the OLD claim is now the
  failure mode: it talks you out of a check that works.
  ⚠️ **Line RANGES resolve too, since 2026-08-18 — this said the opposite.** The
  extractor's regex is `/:\d+(?:[:-]\d+)?$/` (`scripts/doc-citations.mjs:151`), which
  strips `:42`, `:42:7` and `:42-80` alike; the hyphen branch was added the same day the
  seven-broken-citation failure was fixed. Verified 2026-08-19 by reading the regex.
  Single-line citations are still the better habit — they are what the harness renders
  as a clickable link — but a range is no longer a silent failure.
- **`pnpm test` now also checks** the npm lockfile sync (above), the SBOM licence
  policy, that no two workspaces declare different versions of a shared dependency,
  and that `docs/RUNBOOK.md`'s rollback commands name the real Workers and the
  installed wrangler. That last one found the runbook pinned `wrangler@4.114.0`
  while the repo ran 4.122.0.

⚠️ **`node:sqlite` is built into the pinned Node 24** — `scripts/verify-backup.mjs`
uses it to replay a D1 dump with foreign keys ON. Reach for it before adding a
SQLite dependency.

## The one pattern that keeps causing incidents

**Three production bugs in three consecutive sessions were invisible for the same
reason: the test fixtures could not exhibit the failure.**

- Seeded placeholders had no geometry compression → *no production model could
  render at all*, and 177 tests were green.
- Same gap → *every* production garment tripped a CSP violation on load.
- Seeded placeholders had no textures and no UVs → the entire artwork path was
  untested.

**If production compresses, seed compressed. If production prints, seed a
print.** Before adding a test, ask what would have to break for it to fail. If
the answer is "nothing that happens in production", it is not a test.

## Traps — each of these has already cost a session

- **Never run the pipeline on its own output.** Meshopt quantizes vertex
  attributes; `simplify-textured.ts` bails to a position-only fallback when it
  sees them, so a second pass *silently* loses artwork protection and blames the
  wrong stage. Always start from the raw CLO export.
- **`PRAGMA foreign_keys=OFF` is a no-op on D1** (SQLite ignores it inside a
  transaction; D1 wraps statements in one). `defer_foreign_keys` defers *checks*,
  not **cascades** — so neither pragma makes a table rebuild safe. **Ordering
  does**: stage or drop referencing tables first. A `DROP TABLE` runs an implicit
  `DELETE`, and that cascades.
- **`apps/shrink/container` is not a workspace member.** It installs with plain
  `npm` inside Docker, so it cannot use `workspace:*` deps, and `pnpm -r` skips
  it. It has its own CI typecheck step; keep it.
  **The typecheck step was never the gap — `npm ci` is.** `tools/asset-pipeline`
  carries a SECOND lockfile (`package-lock.json`, npm's, read only by
  `apps/shrink/Dockerfile`) that no workspace tooling maintains, so bumping that
  `package.json` in the workspace desynchronises it and the image build dies on
  `npm ci` **after** every local gate has passed. Cost a deploy on 2026-08-12; full
  procedure in `tools/asset-pipeline/CLAUDE.md`.
- **The shrink container runs as uid 1000, not root, since 2026-08-13 — it can
  write ONLY under `/tmp`.** `/app` is root-owned and read-only to it, so any new
  scratch path must go through `mkdtemp(join(tmpdir(), …))` as `container/server.ts`
  already does. A write to `/app` will pass every local gate and fail at runtime
  inside the Container, where the error surfaces as a failed shrink job rather
  than as a permissions problem. Verified by running the image: writes `/tmp`,
  refused `/app`, service starts and answers. The base image is **digest-pinned**
  for build reproducibility (sharp links against system libs).
  ⚠️ **NOTHING AUTOMATED REFRESHES THAT PIN — this line claimed "Dependabot's `docker`
  ecosystem updates it" until 2026-08-20, and that was never true.**
  `.github/dependabot.yml` declares no `docker` ecosystem at all, and the two it does
  declare (npm, github-actions) both sit at `open-pull-requests-limit: 0` by deliberate
  quiet-mode decision, so only security advisories open a PR. Bump the digest by hand.
  Do not unpin it to make an update easier, and do not "fix" this by adding a third
  ecosystem — it would either sit at 0 and change nothing, or break the quiet mode on
  purpose. The same absence is why the Playwright container in `.github/workflows/ci.yml`
  is pinned by TAG rather than digest, with a test enforcing the tag instead.
- **`apps/cms` was pinned to TypeScript 6 until 2026-08-12 — RESOLVED by Next
  16.3.0, and the lesson it taught outlives the pin.** Next.js 16.2.12 refused TS 7
  outright: *"TypeScript 7.0.2 does not provide the compiler API required by
  Next.js. Enable experimental.useTypeScriptCli … or install TypeScript 6
  instead."* The only escape offered was an **experimental** flag on the worker
  that serves the live admin and the public API, which was not worth uniformity.
  Measured on 16.3.0 the day it was tried: `apps/cms` builds clean on TypeScript
  7.0.2 (exit 0, `Finished TypeScript in 394ms`, **no** compiler-API error and no
  fallback warning; `apps/cms/node_modules/typescript` resolves to 7.0.2). The
  whole repo is now on one TypeScript version.
  **Keep the lesson, which is not about TypeScript:** `tsc --noEmit` passed fine on
  7 the entire time it was broken, so `pnpm typecheck` was green and **only
  `pnpm build` failed.** Run `pnpm build`, not just typecheck and tests, before
  pushing a dependency change — that is the gap the original went through, and the
  cheap check will keep lying to you about the next one.
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
- **The 24h cooldown blocks a bump SILENTLY, and `--latest` is the wrong tool.**
  `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`. A too-fresh version is not
  an error — `pnpm update -r <pkg> --latest` **exits 0 and leaves the old version
  in place**, which reads as "the bump did nothing". Measured 2026-08-12: asked for
  wrangler `--latest`, got 4.120.1 back, no warning.
  To release one deliberately: **one-off `--config.minimumReleaseAge=0` on the
  command line, and pin the exact version** — never add an application dep to
  `minimumReleaseAgeExclude`, which is for build-toolchain binaries (lightningcss,
  esbuild) only. **Pin, because `--latest` reaches past what you audited:** with the
  cooldown off it jumped to wrangler 4.122.0 — published 1.1h earlier, unaudited,
  and raising the workers-types peer floor (above).
  **Run a supply-chain audit in place of the wait**, as b90ba70 did for Payload: npm
  bulk advisory API, publisher is GitHub Actions OIDC rather than a personal token,
  **signed provenance attestation present**, **no install script**, and an unchanged
  dependency list. Provenance + no-install-script is the actual threat the cooldown
  absorbs, so that substitution is real rather than a formality.
- **`fileColours` is deliberately NOT in `GATED_FIELDS`.** Gating it once blocked
  the shrink robot's own write on a published-but-model-less product, i.e. it
  prevented recovery from the state the gate was complaining about (2026-07-29).
  Do not "fix" this. The gap it leaves is covered by reporting instead —
  `becameUnverifiedWhilePublished` writes an Events row. See `Products.ts`.
- **A 404 from `media.wear-run.help` can be a CACHED 404 — and `HEAD` will not
  tell you.** It is an R2 custom domain with a 30-day edge Cache Rule, so a request
  for an object that does not exist *yet* caches the miss. On 2026-08-06 a model the
  shrink worker had just written returned `GET 404` (a 28 KB Cloudflare error page)
  while `HEAD` returned **200 with the correct `content-length`** — the two landed on
  different cache entries. The cached 404 was **25 hours old**, from a probe made
  before the file existed. The object was intact in R2 the whole time
  (`wrangler r2 object get` returned all 28,271,780 bytes) and the same URL with
  `?v=1` served 200 immediately.
  **So: after the shrink writes a model, fetch it the way a browser will — bare URL,
  plain GET — before pointing a product at it.** `artworkVerdict: ok`, the filesize,
  the `{OPAQUE, MASK}` census and a `HEAD` were *all green* while the file was
  unreachable; swapping `glbAsset` on those signals would have put a 404 on the live
  page. Fix is a **Custom Purge of that one URL**. Note `scripts/smoke-viewer-payload.mjs`
  deliberately uses `HEAD` to keep R2 egress off the $5/month cap, so it would **not**
  have caught this either.
  ✅ **Re-confirmed 2026-08-13, in the opposite direction, and it nearly produced a
  false alarm.** Same URL, same minute: **`GET` → `cf-cache-status: HIT`,
  `age: 49431`** (~13.7 h, `cache-control: max-age=14400`), **`HEAD` → `DYNAMIC`**.
  So the divergence is not specific to a cached 404 — HEAD does not share the GET's
  cache entry at all. A session measuring cache behaviour with `curl -I` reads
  `DYNAMIC` and concludes the 27 MB model is uncached on every request, which is
  wrong and is a plausible-looking performance "finding". **Read `cf-cache-status`
  off the GET's own headers (`curl -o /dev/null -D -`), never off a HEAD.**
  Live reference numbers now live in `docs/QA-CHECKLIST.md` → "Performance & assets".

- **Six more traps live in `.github/CLAUDE.md`** (loads on touching `.github/`) — two
  of them moved there 2026-08-19 because they bite only while you are editing a
  workflow, which is exactly when that file loads. Enough to stop you: every workflow
  is gated by `apps/cms/src/workflowHardening.test.ts` on ten rules with verified
  negative controls, and a `permissions:` block **REPLACES** the defaults rather than
  adding to them — omitting `contents: read` killed uptime.yml for 23 hours with a 404.
  A CI fetch from a `wear-run.help` host can 403 from a runner (Bot Fight Mode); treat
  it as *inconclusive*, never as a failed assertion, and use `HEAD`.
  And **`timeout-minutes` kills the step's SHELL, not the `apt-get` it started** — the
  orphan keeps the dpkg lock, so retrying races it and exits 100 in five seconds while
  waiting longer only spends the job's headroom. All of `ci.yml` stopped depending on
  apt on 2026-08-20 (`artwork`, then `e2e` when it was split out of `verify`); only
  `deploy-shrink.yml` still does.

- **Twelve more traps live in `tools/asset-pipeline/CLAUDE.md`** — moved there
  2026-08-19, when this file measured 44,993 characters against Claude Code's
  40,000-character warning, the point at which Anthropic's own guidance says adherence
  to *every* rule in a file starts dropping. They load the moment you touch
  `tools/asset-pipeline/`, so a copy here is pure weight; what stays is enough of each
  to stop you. `prune()` renumbers texCoords, so a lone second UV set moves under the
  decimator; `chromaSubsampling` is a no-op for WebP (`smartSubsample` is the flag);
  `--keep-transparency` is the WRONG fix for damaged artwork, MASK at `alphaCutoff 0.5`
  is the right one; a cutout is "few mid pixels" AND "actually cut out somewhere", never
  the first alone; an explicit `baseColorFactor[3]` beats anything inferred from pixels,
  so MASK can render a sheer material as *nothing*; `model-viewer.toDataURL()` returns a
  blank canvas; a `min-field-of-view` floor silently ignored every `fieldOfView` under
  12° until 2026-08-08, leaving any print smaller than a hand unguardable; N001 guards
  THREE prints against a calibrated ceiling; `eval:artwork:real -- raw/x.glb` does not
  resolve that path; `opaque` defaults TRUE in `parseOptimizeArgs` and FALSE in
  `optimizeGlb`, so a hand-built options object ships decals still on BLEND; **the three
  blocking gates do NOT catch decimation damage — only a rendered crop does**, which is
  the most expensive lesson in this repo; and `--simplify` is not the aggression dial,
  `--simplify-error` is.
  ⚠️ These are hooks, not the traps. After `/compact` only THIS file is re-injected, so a
  compacted session that has not yet opened `tools/asset-pipeline/` has only these
  one-liners. Open that file before changing anything there.

- **Twenty-three more traps live in `apps/viewer/CLAUDE.md`** and are deliberately NOT
  restated here — they load automatically the moment you touch `apps/viewer/`,
  so a copy in this file is pure weight. Enough of a hook to make you open it: a
  `performance` global shadowed by a local (a runtime `TypeError` every unit test
  stays green through); the FIXED order `translate → rotate → scale → transform`,
  which threw the custom cursor 1.53× away from the pointer over every button;
  `_headers` surviving `env.ASSETS.fetch()` **but NOT a response the Worker builds
  itself**; a stage-height budget that has been wrong three times by
  arithmetic instead of measurement, and a FOURTH time by a sweep that a
  `[data-reveal]` transform silently offset by 24px; and `dvh` making a phone's
  3D stage resize **14 times in a single swipe**; and a static import of ONE
  700-byte helper putting **287 KB gzip of three.js on the critical path**, where
  it defeated the dynamic import, the Save-Data guard and the preload filter all
  at once. Read them before changing the viewer, its Worker, or its headers.
  Moved there 2026-08-10 when this file came within 326 chars of the size at which
  Claude Code warns a memory file is too large — **a threshold it later crossed
  anyway, so put new viewer, pipeline or CMS detail in the sub-file, not here.**

  **The mechanics, re-measured against the docs on 2026-08-19, because two plausible
  fixes do not work.** The warning fires at **40,000 characters** and the documented
  target is **under 200 lines**. This file was over both on 2026-08-19 at 44,993
  characters; moving the pipeline traps out brought it to ~36,000, so it is now under
  the warning and still over the line target — treat 40,000 as the hard gate and the
  line count as the direction of travel. Size is not cosmetic: the docs state CLAUDE.md
  is delivered as a user message after the system prompt with no guarantee of strict
  compliance, and that longer files "reduce adherence" — so an oversized file makes its
  own traps *less* likely to be followed. ⚠️ **`@path` imports do NOT help**: the docs
  are explicit that imported files "load at launch", so an import moves bytes between
  files and saves no context. What *does* work is on-demand loading: the sub-file split
  above, and path-scoped rules (a `paths:` frontmatter block in a rules file under
  `.claude/rules/`), which load only when Claude reads a matching file.
  ⚠️ **Path-scoped rules are NOT yet trustworthy for anything load-bearing — measured
  again 2026-08-20 and STILL not adopted.** A rule fires when Claude *reads* a matching
  file, so **creating** a new file never triggers it (anthropics/claude-code#63142).
  Four upstream fixes have since shipped (symlink matching v2.1.198, an invalid pattern
  no longer breaking Read v2.1.207, `--setting-sources` respected v2.1.211, the
  brace-expansion startup crash v2.1.217) and the documented key **is** `paths:` — the
  2026-08-19 note's worry about an undocumented `globs:` (#17204) is not what the docs
  say. So the mechanism was tried: `.claude/rules/` now holds ONE rule, deliberately
  **empty of traps**, as the artifact under test. Creating it mid-session and then
  reading two files matching its globs produced `nested_traversal` for
  `apps/viewer/CLAUDE.md` and **no `path_glob_match` at all**. That negative is
  AMBIGUOUS — it shows a rule created mid-session does not fire in that session, not
  that a rule present at session start fails — which is exactly why no prose moved.
  **The ten-second check and both branches are written at the top of that rule file.
  Run it before adding anything there.** Until it passes, the nested CLAUDE.md pattern
  (`.github/`, `tools/asset-pipeline/`, `apps/cms/`) is the only proven one here.
  ⚠️ **All on-demand loading carries one caveat**: only the project-root CLAUDE.md is
  re-injected after `/compact` — nested files and path-scoped rules reload only when a
  matching file is next read, so a trap that moved out of this file can be absent from a
  compacted session until something touches its directory. That is the price paid for
  the pipeline split above, and why each moved trap kept a one-line hook here.
  **Two tools worth knowing, both newer than this section's first draft:**
  `/doctor` now proposes trims for a checked-in CLAUDE.md (v2.1.206+) — it cuts what
  Claude can re-derive from the codebase, directory layouts and dependency lists, and
  *keeps* pitfalls and rationale, which is this file's entire content model. And the
  **`InstructionsLoaded` hook** logs which instruction files loaded, when, and why —
  the way to verify the on-demand claims above instead of asserting them. This repo
  wires one at `.claude/hooks/log-instructions-loaded.mjs`; see `docs/RUNBOOK.md`.
  Free win nobody here uses yet: block-level `<!-- HTML comments -->` are stripped
  before injection, so pure provenance can stay legible to humans at zero context cost.

- **Three more traps live in `apps/cms/CLAUDE.md`** (loads on touching `apps/cms/`) —
  `NODE_ENV=production` for any Payload CLI task against production D1, why
  `src/migrations/` must hold only migrations, and why `withPayload` silently
  overrides any header you set in a handler; it also carries "Before you change
  a migration" and how to write products from a script. ⚠️ This said "Two more
  **live** in" until 2026-08-17 — without the word "traps",
  `claudeMd.test.ts`'s counter silently skipped it. **"Before you delete anything in the
  CMS" below deliberately did NOT move**: it governs `apps/shrink/src/cms.ts` and
  `scripts/find-orphan-media.mjs` too, and under `apps/cms/` it would stop loading
  for exactly the half that deletes files.

- **A settled decision can be INVISIBLE, and one was on 2026-08-15.** Eight skills
  live in `.agents/skills/` with `.claude/skills/` holding symlinks to them (commit
  `fc16d6e`, `npx skills add`'s universal layout), and four are
  `disable-model-invocation: true` — so they neither load nor appear in the skill
  listing. A `/doctor` session researched "should we adopt Tailwind?" from scratch
  while `.agents/skills/pick-ui-library/SKILL.md` had already picked `base-ui`.
  **Before concluding something was never decided, grep `.agents/` too, not just
  `.claude/`.** Settled UI decisions now live in `docs/DECISION-UI-LIBRARIES.md`.

## Before you change the pipeline

**Read `tools/asset-pipeline/CLAUDE.md` before touching the pipeline.** It holds
the whole procedure — how to look at the output instead of the file size, the two
`eval:artwork` evals and their ceilings, the raw N001 export and why it may
already be gone, and the three findings that make the pipeline refuse a job.
Moved there 2026-08-12 for the reason the viewer traps moved on 2026-08-10: it is
~5 KB that every session in this repo was loading, and only a session working
under `tools/asset-pipeline/` needs it — which is exactly when it now loads.

The one line worth keeping here, because it is what the whole section is for:
**do not tune presets against file size.** That is exactly how a setting that
protects artwork *less* shipped as "Smallest file" — **deleted on 2026-08-05**
once a sweep rendered what it actually did to the wordmark. Look at the output.

## Colour names are read from the file, not typed

`tools/asset-pipeline/src/variant-colour.ts` picks each variant's dominant fabric
by surface area (excluding trim and artwork), converts `baseColorFactor` from
linear to sRGB, and names it by CIEDE2000 against a palette in `colour-name.ts`.
This exists because on 2026-08-03 every published colour name on the live site was
wrong — a maroon garment labelled "Navy", a blush one "Black", a powder blue one
"Crimson" — and two colourways in the file were never mapped at all.

Two rules it must keep: a **colourway slug is printed on physical QR tags** and
must never be changed by an automated process, and **row order decides the default
colourway**, so nothing may reorder rows. Imported rows append, arrive
`active: false`, and a low-confidence match arrives with an empty name rather than
a guess. Tested in `packages/shared/src/importColours.test.ts` — it lived at
`apps/cms/src/fields/importColours.test.ts` until 2026-08-11 (`16b548a`), and this
line still said so until a post-merge review followed it and found nothing.

## Before you delete anything in the CMS

`isMediaReferenced` (`apps/shrink/src/cms.ts`) and
`scripts/find-orphan-media.mjs` must agree on what "referenced" means — one
deletes, the other only reports. `apps/cms/src/collections/mediaReferences.test.ts`
fails if a new Media relationship is added without updating both.

⚠️ **Until 2026-08-08 updating one of those two lists did nothing.**
`REFERENCE_PATHS` in `find-orphan-media.mjs` was declared and never read — the
four paths were hardcoded again 60 lines below it — while the guard test's own
failure message instructs you to add new relationships *to that constant*.
Following the instruction would have gone green and left the orphan finder blind
to the new field, and that script deletes files a published product may be using.
It is now the thing the script actually iterates. Found by the linter, as an
unused variable, on the day it was added.

## Deploying

Merging to `main` runs the pre-deploy D1 migrate and deploys CMS + viewer.
**Take a D1 backup and capture `GET /api/public/viewer/rxps/wine` first** — that
before/after diff is what caught the last data-loss incident when the migration
logs said success. See `docs/BACKUP-RESTORE.md`. `.claude/skills/deploy-preflight/`
walks the whole sequence and is `disable-model-invocation: true` on purpose.

⚠️ **The live product is `rxps`, and this line said `n001` until 2026-08-15.**
Measured that day: `GET /api/public/viewer/n001/wine` → **404 not_found**;
`rxps/wine` → the real 5-colourway payload and a 27.0 MB model. The rename had
already broken **both post-deploy gates** in `ci.yml` —
`smoke-viewer-payload.mjs` and `smoke-viewer-preview.mjs` each defaulted to
`n001` and each exited 1 against production — so any merge to `main` would have
deployed and then gone red at verification. Fixed in the same change.
**`uptime.yml` stayed GREEN through all of it**, six consecutive successes in the
two hours before it was found, because it probes
`viewer.wear-run.help/n001/wine` and the viewer is an **SPA**: any path returns
200 HTML and renders "REFERENCE UNAVAILABLE" on the client. A status check there
proves a web server answered, nothing more. `apps/viewer/e2e/serve.mjs` still
fixtures `n001`, correctly — that server *is* the fixture. RUNBOOK's four
remaining mentions are annotated pre-rename measurements (re-checked 2026-08-17),
not live paths.

⚠️ **A RENAME BROKE A POST-DEPLOY GATE A SECOND TIME — 2026-08-17, different
field.** `productCode` went `RXPS` → `R-XPS` (slug correctly untouched; that one
is on printed tags) and `main` went red at `smoke-viewer-preview.mjs`, which
derived the expected code as `PRODUCT.toUpperCase()` where `PRODUCT` is the
**slug** — so it demanded `RXPS` while the page truthfully said `R-XPS`, and a
working rewrite failed its own gate. What re-armed it: 2026-08-15 was repaired by
editing a hardcoded default, which restores green without removing the fragility.
Both sides now compare with non-alphanumerics stripped. **Before changing any
product identity field, grep `scripts/smoke-*.mjs` and `ci.yml` for it** — `slug`
and `productCode` are different fields whose values merely coincided.

**Do not push twice in a row, and read `conclusion` not the exit code.** `ci.yml`
sets `concurrency: cancel-in-progress: true` on `ci-${{ github.ref }}`, so a second
push to `main` kills the first run mid-flight — and `gh run watch --exit-status`
returns **1 for a `cancelled` run exactly as it does for a `failure`**. On
2026-08-12 that sent a session debugging a perfectly healthy `verify` job whose
only error line was `##[error]The operation was canceled`. Check
`gh run view <id> --json conclusion -q .conclusion` before believing anything
failed. Wait for the run, then push again.

**A `cancelled` conclusion also comes from a job hitting its OWN `timeout-minutes`,
not only from a second push.** On 2026-08-18 a degraded Ubuntu mirror made
`playwright install-deps` (normally 24s) eat whole job budgets — `artwork` at 20m20s
twice, then `verify` at 30m21s — with nothing in the repository changed. Raising a
ceiling only moved which job died. See `.github/CLAUDE.md`.

**`https://wear-run.help/` returns 404 in ~0.7 s — it returned 522 after 20.2 s
until 2026-08-19.** The site is `https://viewer.wear-run.help/`. Nothing is bound to
the bare apex; every QR deep link uses `viewer.`, and the one apex path the app does
use (`siteSettings.catalogueUrl` → `/catalogue`) is a Single Redirect with a 301 to a
Drive PDF. The 522 was owner-confirmed and never an outage — its twenty-second
DURATION was the finding (audit L6). `infra/apex-404/index.js` answers it at the edge
now. `/catalogue` cannot be affected: Single Redirects run first AND Redirect is a
*terminating* action, so that Worker is never reached for it. **Do not delete the
apex DNS record** — it must stay proxied or the redirect stops firing.

## Style

Match the surrounding code: comments here explain *why*, usually citing the
incident that motivated them, and that convention is load-bearing — several of
the traps above are only discoverable from those comments. Prefer stating a
measurement over an adjective.
