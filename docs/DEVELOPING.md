# Developing — how to build, test and ship this code

**In plain words:** this page is for people who change the code.
It lists the tools you need, the checks to run, and how a change goes live.

## What's in this repository

| Folder | What it is |
|---|---|
| `apps/viewer` | The public viewer site (Cloudflare Worker + Static Assets, `viewer.wear-run.help`) |
| `apps/cms` | Payload CMS — private admin + public read-only API (Cloudflare Workers, `cms.wear-run.help`) |
| `apps/shrink` | The auto-shrink service — queue consumer Worker + Container that runs the asset pipeline on raw CLO uploads |
| `packages/shared` | Shared types, size ceilings and the shrink job contract, used by all of the above |
| `tools/asset-pipeline` | The GLB processing tool (merge colourways, decimate, validate, placeholders) |
| `docs/` | see the index below |

First-time deployment: follow **`docs/CLOUDFLARE-SETUP.md`** once, top to bottom.

### Documentation index

**Start here, depending on what you're doing:**

| I want to… | Read |
|---|---|
| Get this running on my machine for the first time | [`docs/ONBOARDING.md`](ONBOARDING.md) — a timed 30-minute path |
| Upload a garment and get it on the site | [`docs/FIRST-GARMENT-UPLOAD.md`](FIRST-GARMENT-UPLOAD.md) — plain English, no code |
| Set the project up on Cloudflare for the first time | [`docs/CLOUDFLARE-SETUP.md`](CLOUDFLARE-SETUP.md) |
| Deploy, migrate, rotate a secret, or fix something live | [`docs/RUNBOOK.md`](RUNBOOK.md) |
| Understand the raw-upload → auto-shrink pipeline | [`docs/RAW-UPLOAD-PIPELINE.md`](RAW-UPLOAD-PIPELINE.md) |
| Check the site before announcing anything | [`docs/QA-CHECKLIST.md`](QA-CHECKLIST.md) |
| Process a GLB by hand | [`tools/asset-pipeline/README.md`](../tools/asset-pipeline/README.md) |
| Know *why* something is built the way it is | [`docs/HARDENING-LOG.md`](HARDENING-LOG.md) |
| Add UI — which library, and why we are not on Tailwind | [`docs/DECISION-UI-LIBRARIES.md`](DECISION-UI-LIBRARIES.md) |
| Know whether to buy Zaraz or Log Explorer (we are not) | [`docs/DECISION-ZARAZ-AND-LOG-EXPLORER.md`](DECISION-ZARAZ-AND-LOG-EXPLORER.md) |
| Know why the 90-day backup artifact stays that long | [`docs/DECISION-BACKUP-RETENTION.md`](DECISION-BACKUP-RETENTION.md) |
| Back up or restore the database | [`docs/BACKUP-RESTORE.md`](BACKUP-RESTORE.md) |
| Deploy without the command line | [`docs/DEPLOY-BY-CLICKING.md`](DEPLOY-BY-CLICKING.md) |
| See how the AI agent tooling is wired | [`docs/AI-TOOLING.md`](AI-TOOLING.md) |
| Work on this repo (human or AI) — the traps that cost sessions | [`CLAUDE.md`](../CLAUDE.md) |
| Diagnose damaged printed artwork | [`docs/OPEN-ISSUE-ARTWORK.md`](OPEN-ISSUE-ARTWORK.md) |
| Contribute a change — the full gate list, and the rules that are not style | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Report a security problem (**do not open an issue**) | [`SECURITY.md`](../SECURITY.md) |
| **See every document in `docs/`, including the ones not listed above** | [`docs/README.md`](README.md) |

**No working documents live at the repository root.** The last one, a hand-off
prompt for the next AI session, was archived on 2026-09-26 with the old
instruction files in [`docs/archive/agent-memory/`](archive/agent-memory/README.md).

**Maintainer** — [@hateem2121](https://github.com/hateem2121), sole maintainer.

**Getting help** — for the live site (a deploy, a rollback, a rotated secret, a
garment that will not process) start at [`docs/RUNBOOK.md`](RUNBOOK.md). For a
change to this repository, [`CONTRIBUTING.md`](../CONTRIBUTING.md) has the full gate
list. For anything that looks like a security problem, follow
[`SECURITY.md`](../SECURITY.md) and **do not open an issue**.

**Session logs** — narrative records of expensive debugging, kept because
re-deriving them costs days: [`docs/SESSION-2026-07-27.md`](SESSION-2026-07-27.md)
(why raw uploads never worked) · [`docs/SESSION-2026-07-28.md`](SESSION-2026-07-28.md)
(audit of those fixes; texture-aware decimation; CI token scope) ·
[`docs/SESSION-2026-07-29.md`](SESSION-2026-07-29.md) (the first real
garment; five first-run bugs; a data-loss incident) ·
[`docs/SESSION-2026-07-31.md`](SESSION-2026-07-31.md) (artwork fixes, and
why fixtures that cannot fail keep letting bugs through) ·
[`docs/SESSION-2026-08-03.md`](SESSION-2026-08-03.md) (production audit —
the live site was serving the wrong garment in wrongly-named colours with a torn
wordmark; automatic colour naming and a blocking artwork gate).

## For developers

### How work ships (pull requests into `main`)

Branch off `main` and open a pull request — see
[CONTRIBUTING.md](../CONTRIBUTING.md). GitHub Actions
(`.github/workflows/ci.yml`) runs lint, typecheck, all unit tests, the build and
the Playwright e2e suite, then deploys on merge (once `DEPLOY_ENABLED` is set —
see [docs/CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md)). A red build never
deploys. Operational playbooks live in [docs/RUNBOOK.md](RUNBOOK.md).

> ⚠️ This section said **"one branch, `main`, and no pull requests. Commit to
> `main` and push"** until 2026-08-30. That stopped being true on 2026-08-19,
> when ruleset `21016174` began requiring a pull request on `main` and blocking
> direct pushes — so following this paragraph produced a rejected push, and it
> contradicted [CONTRIBUTING.md](../CONTRIBUTING.md), which has said *"Branch off
> `main`; never commit directly to it"* the whole time.

**Five jobs gate the deploy**: `verify` (lint, typecheck, tests **+ coverage**,
build, bundle weight), `e2e` (Playwright, four engines — split out of `verify`
on 2026-08-20 and a separate required check ever since), `audit` (dependency
advisories **+ SBOM and licence policy**), `secrets` (gitleaks over the full
history) and — since 2026-08-06 — `artwork`, which renders the printed wordmark
before and after the real decimation chain and fails if too much of it moved.
That last one is the only gate that looks at what a buyer actually sees; the
others cannot detect a smeared logo. Lighthouse runs alongside as an
informational check and deliberately does **not** gate: its category scores swung
0.64 / 0.88 / 0.87 across three runs of an identical build.

A fifth check, `pnpm eval:artwork:real`, runs the same artwork measurement on the
real 382 MB CLO export, which the per-commit fixture cannot represent. It is
**manual and local** — run it before shipping a pipeline or preset change. It used
to run monthly from CI; that workflow was deleted on 2026-08-07 because the R2 copy
it pulled expires after 14 days and the surviving copy is local, where no runner can
reach it. See `docs/RUNBOOK.md` → "The canonical raw garment".

**Scheduled workflows**, all gated on `DEPLOY_ENABLED`:

| Workflow | Cadence | What it does |
|---|---|---|
| `uptime.yml` | daily *(requested — GitHub delivers 19–90 min late, measured n=11)* | health + viewer + **every** live product's model payload + both apex PDFs; opens an `outage` issue |
| `nightly-backup.yml` | nightly | D1 export; R2 media mirror on Mondays |
| `diagnostics-digest.yml` | Mondays | reads the Events table — the client errors the viewer records |
| `heartbeat.yml` | every 6 h | checks every other workflow in this table has actually *run* (its `WATCHED` list); opens a `monitoring` issue |
| `perf-watch.yml` | weekly (Mon) | live response times vs the thresholds in `docs/QA-CHECKLIST.md`; a 403 is inconclusive, never a failure |
| `lighthouse-live.yml` | weekly (Tue), and after every green push to `main` | Lighthouse 13.5.0 on the four public pages, phone and computer, five runs each, judged on the median (`scripts/lighthouse-robot.mjs`); a 403 is inconclusive, never a failure |

`heartbeat.yml` exists because a monitor that fails **before** it measures anything
opens no alert at all — which is how the uptime check sat dead for ~23 hours on
2026-08-05 while looking healthy. Silence is not success.

> ⚠️ **Never run `git` from your home directory or a parent folder.** This
> project has its own `.git`; keep git commands scoped to this directory.

### Local development

**New here?** [`docs/ONBOARDING.md`](ONBOARDING.md) is a timed 30-minute path
from a clean checkout to a running viewer. The summary:

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build   # 846 unit tests, 2026-08-13

# `test:coverage` rather than `test`: same suites, once, with v8 coverage on. Each
# package fails its own run against a threshold MEASURED on 2026-08-13, and
# scripts/check-coverage.mjs then applies the repo-wide floor — which exists for the
# one failure per-package thresholds cannot catch, a package dropping OUT of the
# measurement. (Verified: removing one package's report made the repo figure RISE
# from 71.4% to 83.75%, and the gate still failed.)

# THREE GATES CI RUNS THAT THE LINE ABOVE DOES NOT. Each is invisible from the
# workspace root, and "it passed locally" has failed here because of exactly that:
# `pnpm -r` skips the shrink container (not a workspace member), and the artwork
# eval and the alert-shell checks are separate CI steps.
bash scripts/test-alert-shell.sh                  # the alert branch nothing else exercises
node scripts/check-bundle-budget.mjs              # deterministic shell-weight gate (needs a build)
pnpm eval:artwork                                 # artwork legibility — gates the deploy
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit

pnpm seed:assets   # placeholder GLBs/posters + merged N001 file
pnpm dev:cms       # Payload admin on http://localhost:3000 (local D1/R2 emulation)
pnpm --filter @run-apparel/cms migrate     # apply migrations to local D1 (first run)
pnpm seed:cms      # seed product N001 + colourways + settings + dev admin user
pnpm dev:viewer    # viewer on http://localhost:5173 (VITE_API_BASE_URL=http://localhost:3000)

cd apps/viewer && pnpm test:e2e   # Playwright suite (mock API + real-WebGL) from a cold checkout
```

For local CMS runs, put a `PAYLOAD_SECRET` in `apps/cms/.env`
(`openssl rand -hex 32`). Other env vars: see `.env.example`.

### Roles

Two roles by design: **Admin / Director** (`admin` — full control incl. users
and settings) and **Editor** (products/colourways/media only). "Director" is the
admin role's label, not a separate permission tier.

### Versions

Dependencies are pinned to the latest stable releases. Deliberate exceptions:

- **TypeScript is 7.0.2 in all five workspaces** as of 2026-08-12. The CMS was
  pinned to TypeScript 6 because Next.js 16.2.12 rejected the TS7 native compiler
  (*"TypeScript 7.0.2 does not provide the compiler API required by Next.js"*);
  **Next 16.3.0 resolved it** and the pin is gone — measured, `apps/cms` builds
  clean with no compiler-API error and no fallback warning. Dependabot still blocks
  *major* TS bumps (`.github/dependabot.yml`) so no workspace crosses that line
  silently. The lesson that outlived the pin is in `CLAUDE.md`: `tsc --noEmit`
  passed the whole time it was broken, so only `pnpm build` caught it.
- `@cloudflare/workers-types` is **held at `5.20260804.1` for `apps/shrink` ONLY**,
  narrowed from all three packages on 2026-08-29. Every release from `5.20260808.1`
  on breaks that package's typecheck, but all four errors are in one 15-line function
  (`readGlbGenerator`), and it surfaces only there because `apps/shrink` sets
  `types: ["@cloudflare/workers-types"]` with no node types. **`apps/cms` and
  `apps/viewer` run `5.20260925.1`** (raised 2026-09-26) and typecheck clean — the wider hold had frozen
  24 days of updates across both for a fault neither has. wrangler 4.140.0 asks for `^5.20260923.1`, which cms and viewer now meet, so
  **only `apps/shrink` shows an unmet-peer warning** — the real hold. Do not "fix" shrink's by raising workers-types. The split is enforced by
  `dependencyPolicy.test.ts`, which also asserts the hold has not widened again.
  History: `docs/DEPENDENCY-HOLDS.md`.
- `packageManager` stays pinned to **pnpm 10.33.0**. The `minimumReleaseAge`
  supply-chain policy that gated adopting pnpm 11 is now declared **in-repo**
  (`pnpm-workspace.yaml` → `minimumReleaseAge: 1440`, i.e. 24h, with the trusted
  fast-moving build toolchain excluded), so the pin is a deliberate,
  version-controlled choice rather than an artefact of a machine-global config.
  `--frozen-lockfile` installs (CI/deploy) are never affected; if a
  `pnpm add`/update is ever blocked by a too-fresh version, wait out the cooldown
  or add that package to `minimumReleaseAgeExclude`.

  > **Correction (2026-07-27):** this section previously called moving to pnpm 11
  > "a safe, isolated follow-up". **It is not.** pnpm 11 no longer reads the
  > `pnpm` field in `package.json` and silently ignores it, warning only once:
  > `The "pnpm" field in package.json is no longer read by pnpm.` That field
  > currently carries `overrides` (the `sharp` de-duplication pin),
  > `onlyBuiltDependencies`, **and `patchedDependencies` — the load-bearing
  > `@payloadcms/storage-r2` patch.** Upgrading without first migrating all three
  > into `pnpm-workspace.yaml` would silently un-apply the patch and drop the
  > version pins. The upgrade also purges `node_modules` (store-layout change),
  > so it needs `CI=true` or `confirmModulesPurge=false` to run non-interactively.
  > Treat pnpm 11 as its own change with a full re-verify, not a version bump.

`sharp` is de-duplicated to a single version via a `pnpm.overrides` pin (it is a
build-time/optional dependency — image transforms are unavailable on Workers, so
posters are optimised by the asset pipeline before upload). CI additionally runs
secret scanning (gitleaks), a dependency-vulnerability gate (audit-ci, high/
critical), a Lighthouse performance budget, and an axe accessibility check — see
`docs/RUNBOOK.md` → "CI quality gates".

The seeded product **N001** demonstrates both variant modes: it publishes as
`single-glb-variants` with the merged GLB, and every colourway also carries its
own per-colour GLB so switching the product to `separate-glb-per-colour` in the
admin works immediately.
