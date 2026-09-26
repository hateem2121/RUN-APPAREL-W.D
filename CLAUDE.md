# CLAUDE.md — RUN-APPAREL-W.D

<!-- Owner: @hateem2121. Review every change to this file like code.
Rebuilt 2026-09-26 from a 550-line file. The old text is in
docs/archive/agent-memory/2026-09-26-root-CLAUDE.md, and where each of its rules went is
in docs/CLAUDE-MD-MAINTENANCE.md ("Where the root file's rules went").
Limits: under 200 lines (Anthropic's target) and under 39,000 characters
(apps/cms/src/claudeMd.test.ts fails CI above that). HTML comments like this one are
stripped before Claude reads the file, so they cost no context. -->

🔴 = stop, do not proceed. 🟡 = read before acting. 🟢 = context.

## What this is

A QR-deep-linkable 3D apparel viewer for RUN APPAREL's B2B buyers, plus the CMS and the
public website that feed it. A CLO 3D export goes in, a compressed GLB comes out, and a
buyer scans a garment tag and turns the garment in 3D. **For a garment reference the
printed artwork IS the product** — "the 3D loads" is not success; look at the print.

🔴 **The repository is PUBLIC (since 2026-09-10).** Commit code, tests and docs only: no
audits, supplier or factory data, D1 dumps, customer data, secrets or PDF link codes.
Why: on 2026-09-11 a public Actions log carried a presigned link to the whole database
(`.github/CLAUDE.md`). Before a CI step runs a CLI against production, ask what it PRINTS.

## Where things are

```
apps/viewer           Public 3D viewer: React + <model-viewer>, Worker + Static Assets
apps/cms              Payload CMS, its API and the public website: Workers + D1 + R2
apps/shrink           Queue-consumer Worker driving a Container that runs the pipeline
tools/asset-pipeline  The GLB pipeline: merge / optimize / validate / diagnostics
packages/shared       Types + constants both sides must agree on
packages/ui           The shared "Paper & Ink" design system (tokens.css, base.css)
infra/apex-404        The Worker behind the private catalogue./profile. PDF links
```

Hosts: `viewer.wear-run.help` (viewer), `cms.wear-run.help` (admin + API),
`wear-run.help` (website), `media.wear-run.help` (models and posters).

**The path a garment takes:** CLO export → CMS `RawUploads` → R2 **ingest** bucket →
queue → `apps/shrink` → Container runs `tools/asset-pipeline` → GLB + posters to R2
**media** → written back onto the product → the viewer reads
`GET /api/public/viewer/:product/:colourway`. The buckets are not interchangeable:
**ingest** expires after 14 days and is in no backup; **media** is mirrored by
`scripts/backup-r2.mjs` (with the two apex PDFs from `run-assets`). So keep the raw CLO
export locally — it is the only copy.

## Commands

`pnpm` below means `npx --yes pnpm@12.6.0`. **The pnpm note:** bare `pnpm` has measured
absent, present and present-but-broken on this Mac (`/opt/homebrew/bin/pnpm` can be a
dangling symlink), and a script that shells out to it fails far from the cause —
`apps/viewer/e2e/prepare.mjs` runs `pnpm build`, so exit 127 surfaces as
`Timed out waiting 120000ms from config.webServer`. A hook rewrites a bare `pnpm` in
your own commands; for a script, put a shim on `PATH` that execs
`npx --yes pnpm@12.6.0 "$@"`.

The gates, in CI's order. Run them before pushing:

```bash
pnpm install --frozen-lockfile     # after every merge; the lockfile moves often
pnpm lint                          # biome check .
pnpm typecheck                     # 5 workspaces (packages/ui is CSS only)
pnpm test:coverage                 # every suite + the measured coverage floors
bash scripts/test-alert-shell.sh   # the alert branch nothing else exercises
node scripts/check-docs-index.mjs  # every maintained doc reachable from docs/README.md
pnpm seed:assets && pnpm build     # the gate that catches dependency breaks
node scripts/check-bundle-budget.mjs         # reads apps/viewer/dist: build first
pnpm eval:artwork                            # its own CI job; gates the deploy
pnpm --filter @run-apparel/viewer test:e2e   # its own CI job; gates the deploy (~45 s here)
```

"It passed locally" has failed here because three gates are invisible from the
workspace: `apps/shrink/container` is not a pnpm member (CI runs
`npm install --no-audit --no-fund && npx tsc --noEmit` inside it), `eval:artwork` runs
in its own job, and `check-bundle-budget` exits 1 without a build.
`node .claude/skills/gates/run-gates.mjs` runs all of them in order and stops at the
first failure.

## How work is done here

- **Branch off `main`; never commit to it** (a hook refuses both). Commit messages are plain English,
  "Area: what changed" — e.g. *Viewer — retry a model download that stops sending*.
  Why: the owner is not a developer and reads the history.
- **Comments explain *why*, citing the incident.** Several traps are discoverable only
  from those comments. State a measurement rather than an adjective ("27.0 MB", not
  "large").
- **A test must be able to fail the way production fails.** Three production bugs hid
  behind green suites because the fixtures could not show them (no compression, no
  textures). If production compresses, seed compressed; if it prints, seed a print.
  Prove a check sees a defect you plant on purpose — a negative control, run both ways.
- **Judge the pipeline by the rendered print, never by file size.** A preset that
  protected artwork *less* once shipped as "Smallest file" (deleted 2026-08-05).
- 🔴 **Start the pipeline from the raw CLO export, every time.** A second pass over its
  own output silently drops artwork protection. A hook refuses it.
- 🟡 **A colourway slug is printed on physical QR tags**, so no automated process may
  change one, and **row order decides the default colourway**, so nothing may reorder
  rows.
- 🟡 **Read `cf-cache-status` off a GET, never a HEAD** — on this domain they hit
  different edge cache entries. After the shrink writes a model, fetch it with a plain
  GET before pointing a product at it.
- **Lint blocks** node builtins in Worker code (`packages/shared/src`, `apps/shrink/src`,
  `apps/viewer/src`, `apps/viewer/worker`) and imports between apps (`biome.jsonc` →
  `noRestrictedImports`). Test files are exempt; `apps/shrink/container/` is plain Node.
- **Look for the decision before re-deciding.** Settled calls live in `docs/DECISION-*.md`,
  `docs/DECISIONS-BETA-WEBSITE.md` and `.agents/skills/`. On 2026-08-15 a session
  re-researched Tailwind while `.agents/skills/pick-ui-library/SKILL.md` had already
  picked `base-ui`. Two of the eight `.agents` skills are `disable-model-invocation:
  true` and never appear in the skill list, so grep `.agents/` too.
- **Cloudflare API writes:** put the JSON body in a file and `curl … -d @file`; the
  auto-mode classifier refuses the same request with inline JSON.

## Guards that run on their own

These hooks (wired in `.claude/settings.json`, each with a test) hold even when a rule
is missed:

| Hook in `.claude/hooks/` | What it does |
|---|---|
| `guard-bare-pnpm.mjs` | Rewrites a bare `pnpm` to the `npx` form, or refuses it |
| `guard-pipeline-input.mjs` | Refuses to run the pipeline on its own output |
| `guard-main-branch.mjs` | Refuses a commit made on `main` and a push to `main` |
| `format-edited-file.mjs` | Runs Biome on each file you edit |
| `check-doc-citations.mjs` | Re-checks citations after each Markdown edit |
| `explain-failure.mjs` | Names the real cause when an error blames the wrong thing |
| `note-compaction.mjs`, `recall-nested-instructions.mjs` | After `/compact`, name the instruction files no longer loaded |
| `log-instructions-loaded.mjs` | Logs which instruction file loaded, when and why |

## Where the other rules live

Only this file loads in every session. The rest load when the **Read tool** opens a
matching file — `cat` or `sed` in Bash does not trigger them, so in a Bash-first session
read the matching file yourself before changing anything. After `/compact` only this
file comes back; a hook names the others.

- **Thirty-four more traps live in `apps/viewer/CLAUDE.md`** — the viewer, its Worker,
  its headers and its layout.
- **Twenty-four more traps live in `tools/asset-pipeline/CLAUDE.md`** — read it before
  changing any preset, threshold or export setting.
- **Thirteen more traps live in `apps/cms/CLAUDE.md`** — Payload, the website, and
  writing products from a script.
- **Sixteen more traps live in `.github/CLAUDE.md`** — workflows, the ruleset, and
  reading CI.

Path rules in `.claude/rules/`:

| Rule | Loads when you open |
|---|---|
| `viewer-headers.md` | `apps/viewer/worker/`, `apps/viewer/scripts/`, `apps/viewer/public/` |
| `cms-media-deletion.md` | `apps/shrink/src/cms.ts`, `scripts/find-orphan-media.mjs`, CMS collections |
| `d1-migrations.md` | migrations, the migration replay, the D1 backup scripts |
| `products-and-colours.md` | `Products.ts`, colourway fields, colour naming |
| `shrink-container.md` | anything in `apps/shrink/`, the pipeline's `package.json` |
| `dependencies.md` | any `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| `tests-and-fixtures.md` | test files, `e2e/`, Playwright and Vitest configs |
| `docs-and-instructions.md` | any `CLAUDE.md`, `AGENTS.md`, `docs/`, rules, skills |
| `deploy-and-live-checks.md` | smoke scripts, probes, `wrangler.jsonc`, deploy and check-live skills |
| `apex-and-private-pdfs.md` | `infra/`, the CMS Worker entry and its `wrangler.jsonc` |

Longer reading: `docs/README.md` (every document), `docs/RUNBOOK.md` (operations),
`docs/HARDENING-LOG.md` (why things are built the way they are).

## Deploying

A merge to `main` backs up D1, applies migrations, then deploys the apex Worker, the CMS
and the viewer.

- 🟡 **Check `git config user.email` before the first commit.** An unset one makes the
  commit unattributed, and `main`'s ruleset then blocks the merge.
- 🟡 **Before a merge that touches the CMS or a migration, take a D1 backup and capture
  `GET /api/public/viewer/rxps/wine`.** That before/after diff caught the last data-loss
  incident when the migration logs said success. `.claude/skills/deploy-preflight/`
  walks it; `docs/BACKUP-RESTORE.md` has the detail.
- 🔴 **Push once, then wait, and judge a run by its `conclusion`.** A second push cancels
  a pull request's running CI, and `gh run watch --exit-status` returns 1 for
  `cancelled` exactly as for `failure`:
  `gh run view <id> --json conclusion -q .conclusion`.
- 🟡 **The live product is `rxps`** (it was `n001` until 2026-08-15). Before changing a
  product identity field (`slug`, `productCode`), grep `scripts/smoke-*.mjs` and
  `ci.yml` for it — renames have broken the post-deploy gates twice.
- 🔴 **Each PDF link code is a Worker secret: never commit, log or print one.** The rest
  of `wear-run.com`, `mta-sts.wear-run.help` and the `/map` + `/meeting` redirects belong
  to the owner's email-signature project: never list or delete one.

## Keeping this file useful

Put a rule here only if every session needs it; otherwise put it where it applies (a
nested `CLAUDE.md`, a path rule, a skill or `docs/`). `docs/CLAUDE-MD-MAINTENANCE.md`
explains the limits and how loading works.
