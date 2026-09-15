# CLAUDE.md — working notes for AI sessions on this repo

Read this before changing anything. It is short on purpose: it holds only the
things that have *actually* caused production incidents here, and the traps that
have already cost more than one session each.

History is in `docs/HARDENING-LOG.md`; per-session detail in
`docs/SESSION-*.md`; operational how-tos in `docs/RUNBOOK.md`.

## What this is

A QR-deep-linkable 3D apparel viewer. A CLO 3D export goes in, a compressed GLB
comes out, and a customer scans a tag and looks at the garment. **For a B2B
garment reference the printed artwork IS the product** — "the 3D loads" is not
success.

⚠️ **PUBLIC repo since 2026-09-10:** never commit audits, supplier/factory data, D1 dumps
or customer data.

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
14-day expiry rule and is in no backup, **media** is mirrored by `scripts/backup-r2.mjs`,
which since 2026-08-28 also copies the two apex PDFs from `run-assets`. That asymmetry is why the raw CLO export is a local artifact — see
`tools/asset-pipeline/CLAUDE.md`.

**The gates, in CI's order** — `pnpm` below means `npx --yes pnpm@10.34.5`:

```bash
pnpm install --frozen-lockfile   # after every merge; the lockfile moves often here
pnpm lint                        # biome check .
pnpm typecheck                   # 5 workspaces
pnpm test:coverage               # the full suite + the coverage floors (see below)
bash scripts/test-alert-shell.sh # the alert branch nothing else exercises
pnpm seed:assets && pnpm build   # build is the one that catches dependency breaks
node scripts/check-bundle-budget.mjs  # deterministic shell weight; needs the build above
pnpm eval:artwork                # separate CI job — gates the deploy
pnpm --filter @run-apparel/viewer test:e2e  # separate CI job — ALSO gates the deploy
```

⚠️ **`e2e` is in `deploy.needs` and was absent from this list until 2026-08-21.**
Slowest gate in CI (7m45s), fastest locally (**45s**, 352 tests, four engines) — run
it before pushing a viewer change. Two CI round trips were spent learning that.

Three of these are invisible from the workspace, and that is why "it passed
locally" has failed twice: `apps/shrink/container` is not a pnpm member and gets
its own `npm install --no-audit --no-fund && npx tsc --noEmit` step in CI,
`eval:artwork` runs in a job of its own, and `check-bundle-budget` reads
`apps/viewer/dist` so it exits 1 unless `pnpm build` has already run.
⚠️ Until 2026-08-13 this paragraph claimed README's "Local development" list omits
some of these. It does not, and had not for some time — caught by running the
commands rather than re-reading the sentence (same lesson as
`eval:artwork:real -- raw/x.glb` below).

**Playwright's browsers are NOT installed here, and a missing one fails at 0ms.**
Found 2026-08-27: `test:e2e` reported four engines failing with `(0ms)`, which reads
as broken code and is a browser that never launched. Install once —
`npx --yes pnpm@10.34.5 --filter @run-apparel/viewer exec playwright install chromium webkit firefox`.
`tools/asset-pipeline`'s render harness needs chromium too. With all four present:
**355 passed, 6 skipped, 41.8s** — the 45s quoted above.

**`pnpm` may not be on `PATH` — MEASURED BOTH WAYS; use `npx --yes pnpm@10.34.5`.**
Absent in earlier sessions; 2026-08-21 it WAS there (`/opt/homebrew/bin/pnpm`, exactly
10.33.0). Assume neither, and never let a script shell out to bare `pnpm`.
⚠️ **A THIRD STATE, 2026-08-27: the path EXISTS and does not run.**
`/opt/homebrew/bin/pnpm` symlinks into a `node@24` Cellar that Node 26.7.0 replaced.
`ls` succeeds; running it says `no such file or directory` naming the SYMLINK, not the
missing target — so `command -v pnpm` finds it and still fails. When a child process
needs a real one (`e2e/prepare.mjs` shells out to `pnpm build`), put a shim on `PATH`
that execs `npx --yes pnpm@10.34.5 "$@"`.
 Bare `pnpm` fails with
exit **127**, and the failure is worth naming because of *where* it surfaces:
`apps/viewer/e2e/prepare.mjs` shells out to `pnpm build`, so the whole e2e suite
dies as `Timed out waiting 120000ms from config.webServer` with the real
`status: 127` buried inside a child process. `.claude/settings.json` and
`.claude/launch.json` already use the `npx` form; this line is why.
Since 2026-08-26 the PreToolUse guard **rewrites** a bare `pnpm` you type rather
than refusing it — but it sees only the Bash tool's own command, never what a
script shells out to, which is the case that actually cost the sessions above.

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
  ⚠️ **Never cite a gitignored GENERATED directory — this warning did, and broke CI.**
  `public/draco/` is written at build time by `apps/viewer/scripts/copy-decoders.mjs`,
  so it exists locally from an earlier build and passes for you while a clean checkout
  fails. Cite the generator.
  ⚠️ To reproduce CI's checkout, move `public/draco/` aside for the run — a local
  pass with it present proves nothing, and that is what failed here twice. Note the
  gate is blind to URL-shaped references: it skips anything starting with `/`, so
  `/og/n001/wine.jpg` in RUNBOOK rotted unwatched through a slug rename.
  ⚠️ **`node scripts/doc-citations.mjs` WORKS — this file claimed otherwise until
  2026-08-19 and cost a session.** It prints each unresolved citation and exits **1**.
  Use it as the fast local check; `apps/cms/src/claudeMd.test.ts` is still the CI gate
  and the authority, because only the test enforces the recursive walk and the
  negative control.
  ⚠️ **Line RANGES resolve too, since 2026-08-18 — this said the opposite.** The regex
  (`scripts/doc-citations.mjs:202`) strips `:42`, `:42:7` and `:42-80` alike. Prefer a
  single line — the harness renders it as a clickable link — but a range is not a
  silent failure.
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
print.**

⚠️ **A NEGATIVE CONTROL MUST RUN BOTH WAYS.** 2026-08-29: three GPU harnesses each
reported clean while measuring nothing — a WebGL buffer read after compositing (needs
`preserveDrawingBuffer`), a sample box on the wrong part of the garment, and
`drawImage` on model-viewer's non-preserved canvas returning a stale frame (tell:
identical counts across five colourways). Prove the harness sees a defect you
INTRODUCE, not just that it passes a good case. Before adding a test, ask what would have to break for it to fail. If
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
- **Run `pnpm build`, not just typecheck and tests, before pushing a dependency
  change.** `apps/cms` was pinned to TypeScript 6 until 2026-08-12 — Next.js 16.2.12
  refused TS 7 outright; RESOLVED by 16.3.0. The lesson is not about TypeScript:
  `tsc --noEmit` passed on 7 the whole time it was broken, so `pnpm typecheck` was
  green and **only `pnpm build` failed.**
- **`@cloudflare/workers-types` is HELD at `5.20260804.1` — for `apps/shrink` ONLY,
  since 2026-08-29.** Every release from `5.20260808.1` on fails that package's typecheck
  with `Property 'readUInt32LE' does not exist on type 'NonSharedBuffer'` x3 plus one
  arity error — **all four in one 15-line function**, `readGlbGenerator`
  (`tools/asset-pipeline/src/validate.ts:45`). Re-measured on `5.20260827.1`: still
  broken, so the hold stands where it applies.
  **It applies nowhere else.** `apps/cms` and `apps/viewer` run `5.20260827.1` and
  typecheck clean; the hold had frozen 24 days of updates across both for a fault
  neither has. It surfaces only in `apps/shrink` because that package sets
  `"types": ["@cloudflare/workers-types"]` with no node types, and its tsconfig reaches
  `validate.ts` transitively — `container/report.ts` imports `SIZE_WARNING_BYTES` from it
  as a **value**. `tools/asset-pipeline` checks the same file and passes, because it sets
  `"types": ["node"]`. `@types/node` looks like the culprit and is not.
  **Bisect; do not revert the plausible one.** The split is deliberate and pinned by
  `dependencyPolicy.test.ts`, which asserts the hold in `apps/shrink` AND asserts it has
  not widened again. wrangler 4.122.0 wants `^5.20260811.1`, so `apps/shrink` still
  carries an unmet-peer warning on purpose — cosmetic, and **do not "fix" it by raising
  workers-types**, which trades it for the real break.
  Releasing it does not need Cloudflare: move `SIZE_WARNING_BYTES` and `GlbReport` into a
  node-free module and `readGlbGenerator` stops being reachable. History and the re-test:
  `docs/DEPENDENCY-HOLDS.md`.

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
- **Read `cf-cache-status` off the GET's own headers, NEVER off a `HEAD`.**
  `HEAD` and `GET` land on DIFFERENT edge cache entries on this domain, measured
  twice in both directions: 2026-08-06 a just-written model served `GET 404` while
  `HEAD` returned 200 with the right `content-length`; 2026-08-13 the same URL in
  the same minute gave `GET` → `HIT age 49431` and `HEAD` → `DYNAMIC`. A session
  measuring with `curl -I` concludes the 27 MB model is uncached on every request,
  which is a plausible-looking and entirely wrong performance finding. Use
  `curl -o /dev/null -D -`. **After the shrink writes a model, fetch it the way a
  browser will — bare URL, plain GET — before pointing a product at it**; a
  `HEAD`, the filesize, `artworkVerdict: ok` and the `{OPAQUE, MASK}` census were
  ALL green while the file was unreachable. Fix is a Custom Purge of that one URL.

- **A Cloudflare API write with inline JSON is refused by the auto-mode classifier.**
  Write the body to a file and `curl … -d @/tmp/body.json` — same request, accepted.
  Cost three blocked attempts on 2026-08-31 (rate-limit, compression, push ruleset).
  ✅ The 30-day exposure was capped on 2026-08-31: the media Cache Rule now carries
  `status_code_ttl` of 10s for 4xx/5xx, so a cached miss lasts seconds rather than
  a month. The GET/HEAD divergence is unaffected and is why this stays. Full
  incident: `docs/HARDENING-LOG.md`.

- **Sixteen more traps live in `.github/CLAUDE.md`** (loads on touching `.github/`) — two
  of them moved there 2026-08-19 because they bite only while you are editing a
  workflow, which is exactly when that file loads. Enough to stop you: every workflow
  is gated by `apps/cms/src/workflowHardening.test.ts` on fifteen rules, nine with their
  own negative control — an unparseable workflow is NOT a check, so CI goes green; a
  `permissions:` block **REPLACES** the defaults rather than
  adding to them — omitting `contents: read` killed uptime.yml for 23 hours with a 404.
  A CI fetch from a `wear-run.help` host can 403 from a runner (Bot Fight Mode); treat
  it as *inconclusive*, never as a failed assertion, and use `HEAD`.
  And **`timeout-minutes` kills the step's SHELL, not the `apt-get` it started** — the
  orphan keeps the dpkg lock, so retrying races it and exits 100 in five seconds while
  waiting longer only spends the job's headroom. All of `ci.yml` stopped depending on
  apt on 2026-08-20 (`artwork`, then `e2e` when it was split out of `verify`); only
  `deploy-shrink.yml` still does.
  And **GitHub's scheduled runs are 19–90 minutes LATE — measured n=11, every one** —
  so a `cron:` is a queue position, not a deadline; a watchdog built on one being
  punctual is wrong on every cycle, which is worse than no watchdog.

- **A CLO 7.0 export arrives as one GLB PER COLOURWAY** (`_0.._N`); `pipeline merge`
  joins them, and **`apps/shrink` never calls it**. See `tools/asset-pipeline/CLAUDE.md`.
- **Twenty-four more traps live in `tools/asset-pipeline/CLAUDE.md`** — moved there
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
  `--simplify-error` is. **Five added 2026-08-21, all from one 1.31 GB export:** a CLO
  file is **99.97% topstitch and 0.03% garment**, so thread needs its own `--stitch`
  budget and a *wide crop cannot see* a frayed cord (judge at 4–7°, not the default
  18°); draco **loads live since 2026-08-30 (GEO-02)** but production stays on `--meshopt` — the Draco bib was 3.4 MB larger and 20 MB heavier on the GPU (LIVE-08); normal/ORM maps outweighed the artwork at colour-map resolution
  (`--data-max-texture`); an all-over print on `BLEND` is read as sheer fabric and
  silently squashed to 29%; **KTX2 came out smaller yet still had to be refused**
  because ETC1S mottles white fabric; **a CLO export leaves every TEXTURE anonymous**
  so a name-based artwork check must read the MATERIAL name or it is silently inert;
  and forced double-siding put a **mirrored care label on the outside**.
  **Added 2026-09-02:** a print piece is NEVER decimated (`--decimate-artwork` is the
  negative control), and **a flat frame scores 0.00% against another flat frame** — a
  perfect crop match means look at the picture, never pass.
  **Five more findings are recorded there under 2026-08-27**, outside that bulleted
  list: the six unreadable exports carry a texture that is
  **referenced, not orphaned** — safe to strip only because it is always
  `metallicRoughnessTexture` on materials already at `metallicFactor: 0`; the
  **Khronos validator does NOT catch that defect** (`texture.source` is optional, so
  the file is valid glTF); it *did* catch that **every processed garment was invalid
  glTF** for want of an `EXT_texture_webp` declaration, which `<model-viewer>` renders
  anyway; **`prune()` renumbers UV sets and updates only the DEFAULT material**,
  leaving colourway-only ones pointing at an attribute that no longer exists; and
  **`pnpm eval:artwork` PASSES on macOS since 2026-08-29** (this said the opposite until 2026-09-03) — a local failure is real; do NOT raise the ceiling.
  **Added 2026-09-03:** every UV set is moved into 0..1 and stored 16-bit, so a finished
  file's raw UV span means nothing — read it through `uvSpanInPatternSpace`.
  ⚠️ These are hooks, not the traps; after `/compact` only THIS file is re-injected —
  open that file before changing anything there.

- **Thirty-four more traps live in `apps/viewer/CLAUDE.md`** and are deliberately NOT
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
  at once; and an e2e fixture that serves **four** colourways where production serves
  five, which is the difference between a clean rail and a stranded tab; and
  **model-viewer builds only the ARRIVING colourway's materials**, so anything done to
  `model.materials` on `load` reached 6 of 26 printed decals on the live garment and
  left four of five colourways flickering — when that was fixed the bias was still
  **eight times too weak**, and then it reached only the FIRST of each wrapper's
  materials while a colourway switch drew another (1 of 6 live).
  Read them before changing the viewer, its Worker, or its headers.
  **Maintaining these files is its own topic** — the 39,000-character CI gate and the
  200-line target, why `@path` imports do NOT save context, why path-scoped rules are
  still unadopted, `/doctor`'s trim pass, and the `InstructionsLoaded` hook that
  verifies the loading claims above instead of asserting them, all live in
  `docs/CLAUDE-MD-MAINTENANCE.md`. Read it before moving prose between CLAUDE.md files.

- **Eleven more traps live in `apps/cms/CLAUDE.md`** (loads on touching `apps/cms/`) —
  `NODE_ENV=production` for any Payload CLI task against production D1, why
  `src/migrations/` must hold only migrations, why `withPayload` silently
  overrides any header you set in a handler, why **`pnpm build` passing does not mean the
  app can be DEPLOYED**, a 60s content cache, and a style gate that now reads JSX; it also
  carries "Before you change a migration", the site's browser tests, and how to write
  products from a script. ⚠️ This said "Two more
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
⚠️ **Area is summed by material NAME (2026-09-02):** CLO writes one material per
PANEL, and a 4.36% print panel named Geovent's white cloth "Navy"
(CG-05). A white factor over a fabric picture is sampled only when colourways carry
different pictures; every export censused binds one to all five, so the name stays
blank and the report says why.

Two rules it must keep: a **colourway slug is printed on physical QR tags** and
must never be changed by an automated process, and **row order decides the default
colourway**, so nothing may reorder rows. Imported rows append, arrive
`active: false`, and a low-confidence match arrives with an empty name rather than
a guess. Tested in `packages/shared/src/importColours.test.ts` (moved 2026-08-11).

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

⚠️ **`git user.email` is UNSET on this machine, and that DEADLOCKS the merge.**
Found 2026-08-25, mid-deploy. With neither a local nor a global value git falls back
to `user@hostname`, which matches no GitHub account, so `main`'s ruleset rule
`require_extra_approval_for_unattributed_changes` demands an approving review — and
at one filled seat the author cannot approve their own PR. Every status check green,
`mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED`, and `gh pr merge` answers only
"the base branch policy prohibits the merge". Set it before the first commit of a
session; all 372 commits here use the same address:

```bash
git config --local user.email hateemjamshaid@gmail.com
git config --local user.name "Hateem Jamshaid"
```

To repair commits already made — content is preserved, only authorship changes:
`git rebase origin/main --exec 'git commit --amend --no-edit --reset-author'`.
Do NOT reach for `gh pr merge --admin`: the rule is doing its job, the identity is
what is wrong.


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
**`gh run view --log-failed` REFUSES while a run is in progress** — exactly when you
want it. For a finished job inside a running one:
`gh api /repos/<o>/<r>/actions/jobs/<id>/logs --allow-escape-sequences` (the flag is
required, or gh withholds the body).

**A `cancelled` conclusion also comes from a job hitting its OWN `timeout-minutes`,
not only from a second push.** On 2026-08-18 a degraded Ubuntu mirror made
`playwright install-deps` (normally 24s) eat whole job budgets — `artwork` at 20m20s
twice, then `verify` at 30m21s — with nothing in the repository changed. Raising a
ceiling only moved which job died. See `.github/CLAUDE.md`.

**The apex serves the SITE; the PDFs are PRIVATE LINKS (decided 2026-09-11, live from
the merge that deploys it).** `wear-run.help/*`
and `www.` go to the CMS Worker. `infra/apex-404/` serves `catalogue.` and
`profile.wear-run.help/<code>` (pictures + the PDF, from the **shared** `run-assets`
bucket) and 410s the old `/catalogue` and `/profile`. **Each code is a Worker secret:
never commit, log or print one** — ci.yml refuses to deploy without both. Workers
Caching keys on path, NOT host, so all cacheable output sits under the code. **Do not
delete the apex DNS record** (zone routes need it proxied). CI deploys this Worker FIRST;
it once DRIFTED after a dashboard edit. How-tos: `docs/RUNBOOK.md`.

## Style

Match the surrounding code: comments here explain *why*, usually citing the
incident that motivated them, and that convention is load-bearing — several of
the traps above are only discoverable from those comments. Prefer stating a
measurement over an adjective.
