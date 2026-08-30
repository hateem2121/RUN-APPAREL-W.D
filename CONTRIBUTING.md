# Contributing

This is a small, private, single-maintainer repository. The point of this file is
not process for its own sake — it is to stop the three things that have actually
cost time here: running the wrong command, running a *subset* of the gates and
believing it was all of them, and changing a number that only a rendered image
could have justified.

## Read this first

**[`CLAUDE.md`](CLAUDE.md) is the authority.** It is short on purpose and holds
only the traps that have caused real incidents. Two more load automatically when
you work in those directories:

- [`apps/viewer/CLAUDE.md`](apps/viewer/CLAUDE.md) — CSP, `_headers`, the two
  `<model-viewer>` DOM traps
- [`tools/asset-pipeline/CLAUDE.md`](tools/asset-pipeline/CLAUDE.md) — the whole
  pipeline procedure, the evals, the raw garment

## `pnpm` is not on PATH here

Every documented `pnpm <script>` in this repository means:

```bash
npx --yes pnpm@10.33.0 <script>
```

Bare `pnpm` fails with exit **127**, and the failure surfaces somewhere
misleading: `apps/viewer/e2e/prepare.mjs` shells out to `pnpm build`, so the
whole e2e suite dies as `Timed out waiting 120000ms from config.webServer` with
the real `status: 127` buried in a child process. A PreToolUse hook
(`.claude/hooks/guard-bare-pnpm.mjs`) blocks bare `pnpm` for AI sessions; humans
have to remember.

## The gates, in CI's order

Run **all** of these before you push. Three of them are invisible from the
workspace root, and "it passed locally" has failed here twice because of exactly
that.

```bash
npx --yes pnpm@10.33.0 install --frozen-lockfile   # the lockfile moves often
npx --yes pnpm@10.33.0 lint                        # biome check .
npx --yes pnpm@10.33.0 typecheck                   # 5 workspaces
npx --yes pnpm@10.33.0 test:coverage                # NOT `test` — see below
bash scripts/test-alert-shell.sh                   # the alert branch nothing else exercises
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e   # its OWN required check
npx --yes pnpm@10.33.0 seed:assets
npx --yes pnpm@10.33.0 build                       # catches dependency breaks typecheck misses
node scripts/check-bundle-budget.mjs               # deterministic shell-weight gate
npx --yes pnpm@10.33.0 eval:artwork                # separate CI job — gates the deploy

# NOT a workspace member — pnpm -r skips it entirely, CI runs it separately:
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit
```

⚠️ **`pnpm test` IS NOT THE GATE, AND THIS SAID IT WAS UNTIL 2026-08-30.** Vitest
evaluates a `thresholds:` block only when coverage is on, and only `test:coverage`
passes `--coverage` — so the bare runner enforces **none** of the measured coverage
floors, and it also skips `scripts/check-coverage.mjs`, the repo-wide gate that
catches a package dropping out of the measurement entirely. The same slip was live
in `.github/workflows/deploy-shrink.yml` until that date.

⚠️ **`e2e` IS ITS OWN REQUIRED CHECK**, split out of `verify` on 2026-08-20, and it
was missing from this list. It is the slowest gate in CI (~7 m 45 s) and among the
fastest locally (~45 s, 352 tests, four engines) — so run it here, not there. Two CI
round trips were spent learning that.

`pnpm build` is the one that matters most on a dependency change. `tsc --noEmit`
passed cleanly for the entire time the CMS was broken on TypeScript 7 — only the
build failed. Typecheck and tests will lie to you about the next one too.

## Two rules that are not style preferences

**1. If production compresses, seed compressed. If production prints, seed a
print.** Three production bugs in three consecutive sessions were invisible for
the same reason: the test fixtures could not exhibit the failure. Before adding a
test, ask what would have to break for it to fail. If the answer is "nothing that
happens in production", it is not a test.

**2. Do not tune the pipeline against file size.** That is exactly how a preset
that protected artwork *less* shipped as "Smallest file". Look at the rendered
output. A relative invariant cannot pin an absolute value — changing a decimation
number means producing a new rendered crop, not editing the line.

## Comments explain *why*

Match the surrounding code. Comments here cite the incident that motivated them,
and that convention is load-bearing: several of the traps in `CLAUDE.md` are only
discoverable from those comments, and `git blame` is how you find the incident.
See [`.git-blame-ignore-revs`](.git-blame-ignore-revs).

Prefer stating a measurement over an adjective. "0.49pp low on a busy machine"
beats "slightly off".

## Branches, commits and merges

- Branch off `main`; never commit directly to it.
- Conventional-commit prefixes are used (`feat:`, `fix:`, `docs:`, `chore:`,
  `security:`, `merge:`).
- **Do not push twice in a row.** `ci.yml` sets `cancel-in-progress: true`, so a
  second push kills the first run mid-flight — and `gh run watch --exit-status`
  returns **1** for a `cancelled` run exactly as it does for a `failure`. Check
  `gh run view <id> --json conclusion -q .conclusion` before believing anything
  broke.

## Before merging to `main`

Merging to `main` runs the pre-deploy D1 migration and deploys the CMS and the
viewer to production. **Take a D1 backup and capture
`GET /api/public/viewer/rxps/wine` first** — that before/after diff is what caught
the last data-loss incident when the migration logs said success.
[`.claude/skills/deploy-preflight/`](.claude/skills/deploy-preflight/) walks the
whole sequence.

## Migrations

Run [`apps/cms/src/migrationReplay/replay.test.ts`](apps/cms/src/migrationReplay/replay.test.ts)
before changing anything under `apps/cms/src/migrations/`. And put **nothing but
migrations** in that directory — Payload imports every `.ts`/`.js` there and
treats each as a migration. A test file added there once stopped a production
deploy.

## Reporting a security problem

See [`SECURITY.md`](SECURITY.md). Do not open an issue.
