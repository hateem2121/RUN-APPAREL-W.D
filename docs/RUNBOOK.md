# Runbook — operating the RUN APPAREL viewer

Day-to-day operations for the live stack. For first-time setup see
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md); for backups see
[BACKUP-RESTORE.md](BACKUP-RESTORE.md); for the July 2026 hardening history,
decisions, and lessons learned see [HARDENING-LOG.md](HARDENING-LOG.md).

## How deploys work

The repo has a **single `main` branch** and no pull requests. Pushing to `main`
triggers `.github/workflows/ci.yml`:

1. **verify** — install, typecheck, all unit tests, build, Playwright e2e.
2. **deploy** (only if verify passes *and* `vars.DEPLOY_ENABLED == 'true'`) —
   deploys the CMS worker, builds + deploys the viewer to the
   **`run-apparel-viewer-site` Worker** (Static Assets; selected by the
   `VIEWER_DEPLOY_TARGET=worker` repo variable since the 2026-07-22 cutover),
   then hits `/api/health` as a gate.

So: **commit to `main`, push, watch the Actions tab.** A red build never
deploys. `gh run watch` follows the latest run from the CLI.

**Manual deploy fallback** (if CI is unavailable):

```bash
pnpm --filter @run-apparel/cms run deploy          # CMS worker (canonical command)
# Use the SAME API base URL as the VITE_API_BASE_URL repo variable (currently the
# CMS workers.dev URL — see "API + media domain cutover" below for why):
VITE_API_BASE_URL="$(gh variable get VITE_API_BASE_URL)" pnpm --filter @run-apparel/viewer build
rm -f apps/viewer/dist/_redirects   # Pages-only file; rejected by Workers Static Assets
pnpm --filter @run-apparel/viewer exec wrangler deploy   # → run-apparel-viewer-site
curl -f https://cms.wear-run.help/api/health
```

Requires Cloudflare auth (`wrangler login` or `CLOUDFLARE_API_TOKEN`).

**The shrink service deploys separately.** `.github/workflows/deploy-shrink.yml`
builds and deploys `run-apparel-viewer-shrink` (Worker + Container) and is *not*
part of `ci.yml` — a green CI run says nothing about it.

> ✅ **Working since 2026-07-28** (run `30368254285`, the first success after 3
> failures). Before that the token could not push a container image, so the
> service was deployed by hand and every automatic redeploy silently did nothing.
>
> Note for the future: the service was healthy that whole time. An earlier version
> of this note said the pipeline was "not operational", inferred from CI logs
> rather than measured. **Query the platform, not the CI history:**
>
> ```bash
> pnpm --filter @run-apparel/shrink exec wrangler containers list
> ```
>
> The workflow's last step prints exactly that, so a green run now carries its own
> proof the *image* moved and not just the Worker script — compare `LAST MODIFIED`
> against the run's own timestamp printed just above it.
>
> **The token this needs** (recorded because it took a live failure to work out,
> and Cloudflare documents none of it). There is no permission template for
> containers; it must be a **Custom** token created at
> https://dash.cloudflare.com/profile/api-tokens with:
>
> | Scope | Permission | Level |
> |---|---|---|
> | Account | Workers Scripts | Edit |
> | Account | **Containers** | **Edit** |
> | Account | **Cloudchamber** | **Edit** |
> | Account | Workers R2 Storage | Edit |
> | Account | D1 | Edit |
> | Account | Queues | Edit |
> | Account | Account Settings | Read |
> | User | User Details | Read |
> | Zone → wear-run.help | Workers Routes | Edit |
>
> Containers **and** Cloudchamber are both required — wrangler routes container
> work through its cloudchamber client, and its own OAuth flow asks for
> `containers:write` and `cloudchamber:write`. A token missing them builds the
> image fine and then fails on the push with `ApiError: Forbidden`,
> `{ error: 'Authentication error' }` — which names neither permission.
>
> To rotate it: `gh secret set CLOUDFLARE_API_TOKEN`, then
> `gh workflow run "Deploy shrink service"` to confirm before relying on it.
>
> Manual fallback, if CI is ever unavailable (needs Docker running; on an
> Apple-silicon Mac the amd64 build is emulated and takes several minutes):
>
> ```bash
> pnpm --filter @run-apparel/shrink exec wrangler deploy
> ```
>
> Full diagnosis and the checklist state: [RAW-UPLOAD-PIPELINE.md](RAW-UPLOAD-PIPELINE.md).

## Deploying the shrink container

**Since 2026-09-10, GitHub CI deploys it again, behind all four gates.** `shrink-deploy` in
`.github/workflows/deploy-shrink.yml` runs on a push to `main` that touches `apps/shrink/`
or `tools/asset-pipeline/` (or by hand, with *Run workflow*). It runs only after
`shrink-verify`, `shrink-artwork`, `shrink-audit` and `shrink-secrets` pass, and only
while the repository variables `DEPLOY_ENABLED` and `SHRINK_DEPLOY_FROM_CI` are both
`true`.

**It was off from 2026-09-08 to 2026-09-10 because of upload bandwidth.** CI then ran on a
self-hosted runner on the owner's Mac. The repository moved to GitHub-hosted runners when
it was re-created as public, which removed the bottleneck below, so the variable was set
back to `true`. The measurement that switched it off is kept, because it is why a home
machine is still the wrong place to push the image from:

The image builds here without trouble — measured on run 34251256826: **amd64, 54
seconds**, using the host Docker socket the self-hosted runner mounts. What fails is the
push:

| | |
|---|---|
| built image | **135 MB** |
| this Mac's upload, measured | **85 kB/s** (a 10 MB test did not finish in 120s) |
| 135 MB at 85 kB/s | **~26 minutes**, best case |

and one layer died as `net/http: timeout awaiting response headers` against
`registry.cloudflare.com`. Downloads are fine — the 1.3 GB Trivy database arrives in
about three minutes — so this is ordinary asymmetric home broadband, and the container
push is the only job in this repo that has to send anything outward.

### Do NOT connect Workers Builds to `run-apparel-viewer-shrink`

Connecting Cloudflare's Workers Builds to this repository was the 2026-09-08 plan, and it
was never done. Leave it that way. **Workers Builds deploys on every push to `main`,
whatever the four gates in `deploy-shrink.yml` say.** `needs:` stops that workflow's own
deploy job; it cannot stop Cloudflare's. So a pipeline change that fails
`shrink-artwork` would still reach the container. With CI deploying too, every change
would also be published twice.

### Deploying it by hand instead

Still supported and sometimes the right answer — from any machine with real upload
bandwidth, with Docker running:

```bash
CLOUDFLARE_API_TOKEN=$(cat ~/cf_token.txt) DOCKER_DEFAULT_PLATFORM=linux/amd64 npx --yes pnpm@10.34.5 --filter @run-apparel/shrink exec wrangler deploy
```

⚠️ `DOCKER_DEFAULT_PLATFORM` is **not optional on an Apple Silicon Mac**. Cloudflare
Containers run amd64; without it the build silently follows the host, publishes an arm64
image, reports success, and fails only when a garment is processed — and the drift check
cannot see it, because the image did move.

## Deploy safety gate

The `deploy` job runs in the **`production`** GitHub Environment. To make every
production deploy pause for a human approval:

- GitHub → repo *Settings → Environments → production → Required reviewers* → add
  yourself (and anyone else who may approve). Now each push to `main` that would
  deploy waits in the *Deploy* job until a reviewer approves in the Actions run.

> **Note (checked 2026-07-22):** on a **private** repo under a personal account,
> the *Deployment protection rules* section (required reviewers / wait timer)
> only appears with **GitHub Pro** or higher — on the Free plan the environment
> page shows only branches/secrets/variables. Decision: skipped for now; the
> automated gates (verify + audit + health check) remain the deploy protection.

This layers on top of the code-review that happens before `main` (see below). The
deploy job also `needs` both `verify` (typecheck/test/build/e2e) and `audit`
(high/critical vulnerabilities), so a red build or a new vulnerability blocks the
deploy regardless of approval.

**Optional pre-prod staging.** For a full staging environment, create *isolated*
staging resources (never the live ones): `run-apparel-viewer-db-staging` (D1),
`run-apparel-viewer-media-staging` (R2), and a `run-apparel-viewer-cms-staging`
worker via a `[env.staging]` block in `apps/cms/wrangler.jsonc`, then add a CI job
that deploys to staging on demand for validation before promoting to production.

## Undoing a bad deploy (rollback)

Until 2026-08-08 this runbook had no rollback section at all — the deploy gates
were the entire story, and they only stop a build that fails. A build that passes
every gate and is still wrong had no written way back.

**Decide which of the two you are doing first**, because they are not
interchangeable:

| | `wrangler rollback` | `git revert` + push |
|---|---|---|
| Speed | ~30 seconds | a full CI run |
| Restores | one Worker, to a previous version | everything, through all gates |
| Leaves `main` | **lying** — HEAD is not what's live | honest |
| Use when | the site is broken *right now* | anything less urgent |

`wrangler rollback` is the fire extinguisher. **Always follow it with a
`git revert`**, or the next push to `main` silently redeploys the bad build on
top of your rollback.

### The commands

Verified against the pinned wrangler **4.122.0** (`wrangler rollback --help`), not
recalled:

```bash
# 1. See what you can go back to (10 most recent):
npx wrangler@4.122.0 versions list --name run-apparel-viewer-site

# 2. Roll back. Omit the version-id to take the previous one:
npx wrangler@4.122.0 rollback <version-id> --name run-apparel-viewer-site -m "why"
```

The four Worker names:

| Worker | What breaks if it is bad |
|---|---|
| `run-apparel-viewer-site` | the public viewer — what a lead sees |
| `run-apparel-viewer-cms` | the admin *and* the API the viewer reads |
| `run-apparel-viewer-shrink` | garment processing only; the live site is unaffected |
| `run-apparel-apex-404` | the private catalogue and profile links, and the retired apex PDF paths |

Rolling back the **viewer** is the safe one — it holds no data and reads only the
public API.

### Routes are not versions — rolling back the site's address

`wrangler rollback` restores a Worker's CODE and leaves its ROUTES where they are. To
put the apex back the way it was before 2026-09-06 (the PDF Worker answering everything):

1. remove the two wildcard routes from `apps/cms/wrangler.jsonc` and deploy the CMS
   Worker — the site stops answering on the apex;
2. restore `wear-run.help/*` and `www.wear-run.help/*` on `infra/apex-404/wrangler.jsonc`
   and deploy the PDF Worker.

**That order, not the reverse** — a pattern belongs to one Worker at a time, and the
second deploy is refused while the first still holds it. `scripts/apex-probe.mjs` will
then FAIL on the apex root (it expects the site), which is correct and is the reminder to
revert this section's steps in the repo too.

### ⚠️ Rollback does not undo a database migration

`ci.yml` applies pending D1 migrations **before** the Workers deploy, in a
separate gated step. So rolling the CMS Worker back to yesterday's version leaves
**today's schema** underneath it.

This is survivable *only* because migrations here are meant to be additive
(expand/contract), which is stated under "Database migrations" below — an older
Worker tolerates a newer additive schema. If the migration was **not** additive,
a Worker rollback alone will not save you and may make things worse. In that case
go to [BACKUP-RESTORE.md](BACKUP-RESTORE.md) and D1 Time Travel first, and roll
the schema back with `migrate:remote:down` before the Worker.

**Rolling back the CMS Worker without checking what migrated is the move most
likely to turn a visible outage into a data problem.** Check first:

```bash
npx wrangler@4.122.0 d1 migrations list run-apparel-viewer-db --remote
```

### Not yet verified here

`wrangler rollback` on a **Static Assets** Worker is documented by Cloudflare to
restore that version's assets along with its script, but **that has never been
exercised on this account**, and the viewer is assets-only. Treat the viewer
rollback as very likely to work and confirm with a real page load rather than the
command's exit code — the same discipline the cached-404 incident forced on
`media.wear-run.help` (see "Uploading GLB assets").

`git revert` + push has no such uncertainty: it rebuilds and redeploys through
every gate. **When you have the minutes to spare, prefer it.**

> ⚠️ **TWO EXCEPTIONS, BOTH IN `infra/apex-404/`.**
>
> 1. `git revert` across the apex reconciliation commit (2026-08-30) redeploys an
>    `index.js` that returns 404 for **every** path and declares no R2 binding.
> 2. **Rolling back or reverting the private-links change (decided 2026-09-11, live
>    from the merge that deploys it) re-opens the guessable PDFs.** The earlier code
>    serves the PDF for any path `/catalogue` or
>    `/profile` — on the apex, and on the `catalogue.` / `profile.` hosts of BOTH zones
>    too (`wear-run.help` and, from 2026-09-17, `wear-run.com`), because
>    `wrangler rollback` restores code, not routes, and the custom domains stay attached.
>    If that is not acceptable for the minutes a fix takes, detach them as well: list with
>    `GET /accounts/{account_id}/workers/domains?service=run-apparel-apex-404`, detach each
>    with `DELETE /accounts/{account_id}/workers/domains/{domain_id}`. Deploying the fix
>    attaches them again.
>
> After either, run `node scripts/apex-probe.mjs` and open both private links.

### After any rollback

1. Load `https://viewer.wear-run.help/rxps/wine` in a browser and confirm the
   garment renders — not just that the URL returns 200. This deployment serves
   `index.html` with **HTTP 200 for every unmatched path**
   (`not_found_handling: single-page-application`), so a status code proves
   nothing on its own.
2. `curl -f https://cms.wear-run.help/api/health`
3. `git revert` the offending commit so `main` matches what is live.

## Database migrations

Migrations are applied by an **explicit, gated CI step** — the deployed Worker no
longer migrates on cold start (that lazy `prodMigrations` path hung in production
once and has been removed). In `.github/workflows/ci.yml` the `deploy` job runs
`pnpm --filter @run-apparel/cms migrate:remote` **before** it deploys the new
Worker: it applies any pending committed migrations to the **remote** production
D1, and only if that succeeds does the new Worker ship. So the new code never
serves traffic against a stale schema, and a failed migration blocks the deploy
instead of hanging live requests.

How it targets the live DB: `migrate:remote` sets `PAYLOAD_MIGRATE_REMOTE=1`,
which makes `payload.config.ts` open the production D1 through
`apps/cms/wrangler.migrate.jsonc` (its D1 binding is `remote: true`) via wrangler's
`getPlatformProxy`. It needs `CLOUDFLARE_API_TOKEN` (Account + **D1: Edit**) and
`PAYLOAD_SECRET` in the environment — both already CI secrets.

**Adding a migration:**

```bash
# 1. change collections, then generate the migration
pnpm --filter @run-apparel/cms migrate:create <name>
# 2. review the generated src/migrations/* files. Prefer ADDITIVE changes
#    (new tables/columns) so the running Worker tolerates the new schema in the
#    brief window between migrate and deploy (expand/contract).
# 3. commit and push — the next deploy's migrate step applies them, then deploys.
```

**Apply / roll back by hand** (needs Cloudflare auth: `wrangler login` or
`CLOUDFLARE_API_TOKEN`, plus `PAYLOAD_SECRET`):

```bash
node scripts/backup-d1.mjs                              # ALWAYS back up first
pnpm --filter @run-apparel/cms migrate:remote           # apply pending → remote D1
pnpm --filter @run-apparel/cms migrate:remote:down      # roll back the most recent batch
```

The `down` runner (`payload.db.migrateDown()`) reverses the latest migration
**batch**, so batch bookkeeping in `payload_migrations` must be correct — see
"Canonicalising migration history" below. Test any rollback against a throwaway DB
first (`docs/BACKUP-RESTORE.md` shows the scratch-DB pattern).

**If a migration fails** (deploy stops, or health check red afterwards): back up,
inspect what's applied, then re-run the migrate or apply the SQL by hand:

```bash
node scripts/backup-d1.mjs
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote \
  --command "SELECT id, name, batch, created_at FROM payload_migrations ORDER BY id"
# last-resort manual apply of a specific migration's SQL:
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote --file src/migrations/<file>.sql
```

### Canonicalising migration history

During an earlier recovery a `payload_migrations` row was inserted by hand, so the
table should be verified once against the canonical history. The canonical state
(two committed migrations, applied in order) is exactly:

| id | name | batch |
|---|---|---|
| 1 | `20260720_185735_initial` | 1 |
| 2 | `20260721_084024_add_events` | 2 |

Verify the live table matches (run after a backup):

```bash
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote \
  --command "SELECT id, name, batch FROM payload_migrations ORDER BY id"
```

If a `dev`/`NULL` marker row is present, or the batch numbers differ, reconcile it
(back up first — this edits live bookkeeping, not data):

```bash
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote --command "
  DELETE FROM payload_migrations WHERE name IS NULL OR name = 'dev';
  UPDATE payload_migrations SET batch = 1 WHERE name = '20260720_185735_initial';
  UPDATE payload_migrations SET batch = 2 WHERE name = '20260721_084024_add_events';
"
```

Getting the batches right matters so `migrate:remote:down` rolls back exactly the
last migration and no more.

## CI quality gates

Beyond typecheck/test/build/e2e, CI runs these on every push to `main` and every
pull request:

- **Secret scanning** — gitleaks (the `secrets` job in `.github/workflows/ci.yml`,
  config `.gitleaks.toml`). A hit fails the run and **gates the deploy** (the
  `deploy` job needs it). It used to live in its own `security.yml`, where it
  could only fail its own run — `needs:` cannot reach across workflows, so a
  commit carrying a live key was scanned, went red, and deployed regardless. That
  is why it is a job here rather than a separate file. Real secrets never belong
  in git; use `wrangler secret put` / GitHub secrets. Add proven false positives
  to the allowlist in `.gitleaks.toml`.
- **Dependency vulnerabilities** — `audit-ci` (config `audit-ci.jsonc`) fails on
  **high/critical** advisories and **gates the deploy** (the `deploy` job needs
  it). To clear one: bump the dependency, add a `pnpm.overrides` pin for a fixed
  transitive version (how the `tmp` advisory was resolved), or — only if
  unfixable and not exploitable here — add the `GHSA-…` id to `allowlist` in
  `audit-ci.jsonc` with a dated reason.
- **Artwork legibility** — `pnpm eval:artwork` (the `artwork` job) renders the real
  wordmark alpha before and after the real decimation chain and measures how much
  moved. It **gates the deploy** (since 2026-08-06). This is the only gate that
  looks at what a buyer sees: the other three test `alphaMode`, dependencies and
  secrets, none of which change when decimation smears a printed logo.

  It was introduced observe-only on the worry that CI's rasteriser would produce
  different numbers from a developer Mac. That was measured and is **false** —
  0.520% / 0.520% / 6.230% (fidelity / balanced / control, 2026-09-03 fixture with fabric
  and thread; 1.650 / 3.070 / 9.370 on the 2026-08-06 fixture) on a Mac and on CI runs,
  identical to three decimal places, because the eval diffs two renders taken by
  the same browser in the same run and the rasteriser cancels.

  If it goes red, **look at the contact sheet it names** before touching the
  ceiling. It also asserts a negative control, so it fails itself if it stops being
  able to detect damage.
- **Artwork legibility on the real garment** — `pnpm eval:artwork:real`. **MANUAL
  AND LOCAL**, not in CI and not scheduled. See "The canonical raw garment" below
  for why, and for how to run it.
- **Performance budget** — Lighthouse CI (`lighthouserc.json`) against the viewer
  served with the e2e mock. Deterministic byte budgets fail on a real regression;
  category scores are non-blocking warnings (they swung 0.64/0.88/0.87 across
  three runs of an identical build, so gating on them would block releases at
  random). This job is informational — make it a required check via branch
  protection to enforce it.

  **Read what it measures.** The page it scores carries the ~10 KB placeholder
  GLB, so it says nothing about a real 8–40 MB garment; the `total-byte-weight`
  assertion was removed in 2026-08-03 because it conflated the app shell with the
  model. What remains is scoped to the shell — script / stylesheet / font — which
  *is* byte-identical in production, at 16–46% above measured.
- **Accessibility** — axe-core in the Playwright suite
  (`apps/viewer/e2e/a11y.spec.ts`), across **five** page states: the product page,
  the unavailable state, the retired-colourway notice, the poster-only fallback
  and the expanded customisation accordion. It covered only the healthy product
  page until 2026-08-03 — i.e. every screen a visitor reaches when something has
  gone wrong was unscanned, and those are the ones carrying the extra live
  regions and injected meta tags. Fails on serious/critical **structural**
  violations; colour-contrast is advisory (a deliberate palette decision).
- **Browsers** — the e2e suite runs Chromium, **WebKit**, **mobile Safari** and
  **Firefox**, plus a SwiftShader project for the real-WebGL test. It ran Chromium
  twice and nothing else until 2026-08-03, which meant iOS Safari — the browser a
  QR code on a garment tag actually opens — had never executed a line of it.

  The WebGL test **fails** rather than skips when no GL context is available. It
  used to `test.skip`, so the single most valuable test in the repo passed
  silently whenever SwiftShader failed to start.

  `retries: 1` in CI: Playwright reports a test that fails then passes as
  **flaky** in its own section, so flakes stay visible and countable while a real
  failure still fails both attempts and still stops the deploy.
- **Post-deploy viewer payload** — `scripts/smoke-viewer-payload.mjs`, run after
  the deploy in `ci.yml` and on every `uptime.yml` run (daily since 2026-08-18;
  GitHub delivers a median of ~45 min — see "Uptime alerts"). Until 2026-08-05
  the only post-deploy check was `curl /api/health`, which returns `{"ok":true}`
  from a worker with an **empty database** — it proves the process is up and
  nothing about whether a buyer scanning a QR tag sees a garment. The uptime
  workflow's viewer curl was no better: the SPA shell returns 200 and renders its
  no-model state.

  The script fetches `/api/public/viewer/rxps/wine` and asserts a product, at
  least one colourway, and a model URL that really fetches and is over 100 KB.

  **The default colour slug must be a LIVE one.** It was `navy` until 2026-08-05,
  when that colourway was retired — and the check kept passing, because a retired
  slug correctly falls back to the default colourway. That fallback is right (a QR
  tag printed with an old slug must still work) and is exactly why this default
  cannot be a retired slug: it would test the fallback forever and never the
  normal path. See the comment at `scripts/smoke-viewer-payload.mjs:37`.

  **It resolves the model URL by the same rule `Stage.tsx:46` uses** —
  `separateMode ? selected.glbUrl : product.glbUrl`, with no fallback between the
  two fields. Writing it as `a || b` would pass on a product whose *unused* field
  happens to be populated, i.e. green CI while every visitor sees the no-model
  state. That case is one of five in the negative control the check was built
  against. It does **not** judge whether the artwork on the model is intact —
  that is not decidable over HTTP, and is gated at pipeline time instead.

## The canonical raw garment

**A raw CLO export is not a durable artifact in this system, and nothing in the
cloud is keeping one for you.**

Two facts, both measured rather than assumed:

- The R2 ingest bucket carries an `expire-raw-uploads` lifecycle rule — **14
  days, all prefixes** — verified live on 2026-08-06.
- `scripts/backup-r2.mjs` mirrors the **media** bucket and, since 2026-08-28, the
  two apex PDFs in `run-assets`. It enumerates media keys from the CMS `media`
  table, and raw uploads never enter that table, so the ingest bucket is in **no
  backup at all** — that conclusion is unchanged; only the "media only" premise
  was stale.

So the N001 export uploaded on/before 2026-08-05 expired around **2026-08-19**,
and the only copy that survives is a local one.

### What replaced the monthly workflow, and why

`.github/workflows/artwork-real.yml` ran `eval:artwork:real` monthly against the
R2 copy. It was **deleted on 2026-08-07**. It could not have worked: its first
scheduled run was 2026-09-01, by which point the object it pulls was already
deleted — and once the canonical copy became a local one, no GitHub runner can
reach it at all.

It was deleted rather than disabled on purpose. A scheduled job that fails every
month is worse than no job: it trains you to ignore a red X, and this repo has
already paid for that once — the uptime monitor was dead for ~23 hours while its
failures looked like ordinary alerts.

### Running it

```bash
pnpm eval:artwork:real                        # assert against the shipped ceiling
pnpm eval:artwork:real -- --calibrate         # print the damage curve instead
pnpm eval:artwork:real -- --keep output/aw    # keep the renders and contact sheets
pnpm eval:artwork:real -- --all-variants      # every colourway, not just the default
```

⚠️ **Run it on a quiet machine, and never record a number taken while a build or
test suite was running alongside it.**

Measured 2026-08-07 on identical input (checksum verified) with the same Chromium:
**two runs on a busy machine** reported `0.490 / 2.510 / 5.290 / 5.330`, and **three
on an idle one** reported `0.980 / 2.990 / — / 5.810` — identical to three decimal
places across all three, and reproducing the 2026-08-06 calibration exactly. A
*uniform* ~0.48pp offset, not scatter. `--keep` was ruled out as the variable by
running with and without it on an idle machine: byte-for-byte the same numbers.

So this does **not** weaken the determinism claim the eval rests on. It sharpens
it: the numbers are reproducible to three decimals *on an idle machine*, and the
first hypothesis — a Chromium version difference — was wrong. The tell was that the
offset was constant rather than scattered.

All cases are diffed against the same baseline render, so a constant shift across
all of them points at the baseline itself, not at decimation (meshoptimizer is
deterministic). The plausible mechanism is in `render.ts`: after moving the camera
it waits on `jumpCameraToGoal()` plus **two chained animation frames**, which is a
best-effort settle rather than a convergence check — under load a frame can be
captured slightly less converged.

**The verdict is robust to this** — the separation between presets is preserved,
and the quiet-machine numbers reproduce the calibration to three decimal places. So
do not read a small absolute change between runs as a regression. Do re-run on an
idle machine before believing any number you intend to write down.

**When to run it: before shipping any change to a decimation preset, to
`simplify-textured.ts`, or to the texture pipeline.** Not on a calendar — it is
tied to the event that already puts a human in front of it. The per-PR gate in
`ci.yml` (`pnpm eval:artwork`) still runs on every deploy; that one uses a
synthetic fixture and needs no raw export.

### The two guards, and what they are for

Both exist because a wrong input here does not crash — it produces a **plausible
number for the wrong thing**, which is the failure mode this whole area of the
codebase is organised around.

1. **Checksum.** `raw/CANONICAL.json` records the export's size and SHA-256. The
   eval verifies it and refuses to run on a mismatch. A re-export from CLO lands
   at the same path with the same filename and different geometry; without this,
   every threshold in the eval would silently be applied to a garment nobody
   calibrated it on.
2. **Camera framing.** The eval refuses to run if its camera is not pointed at
   the print. `render.ts`'s own `crop-chest` view was framed for a t-shirt; on
   this skinsuit it frames the torso and hips with the wordmark clipped off the
   top edge, and `crop-back` shows a zipper. A mis-aimed camera reports a healthy
   number for *fabric*.

⚠️ **Do not fix a checksum mismatch by editing the checksum, and do not fix a
ceiling breach by raising the ceiling.** Both discard the only evidence that the
numbers mean anything. The evidence is a rendered crop a human looked at — open
the contact sheet.

### Replacing or adding a garment

> ⚠️ **This procedure dead-ended at its own step 3 until 2026-08-08.** It told you
> to calibrate the new export, but `views` fall back to N001's, the aim guard
> correctly refuses a camera pointed at a different body's chest, and nothing told
> you where the new garment's prints actually were. N001's camera was derived by
> hand from primitive world-space bounds; that derivation was never a tool. Step 3
> below is that tool. The old step 3 also did not run as written — see step 0.

0. **The `--` is required and paths are repo-relative.** `pnpm` forwards the
   separator itself into the script's arguments, and delegates to the package
   directory, so a bare relative path used to resolve under
   `tools/asset-pipeline/`. Relative paths are now resolved against the repo root
   as a fallback, so the commands below work as written.
1. Put the export at `raw/<name>.glb`.
2. `shasum -a 256 raw/<name>.glb` — you will paste this into the manifest.
3. **Find the prints and pick a camera:**

   ```bash
   pnpm eval:artwork:real -- raw/<name>.glb --find-views --keep output/views
   ```

   It builds the baseline, lists every artwork primitive with its world-space
   centre and size, then renders **one frame per distinct artwork material** — the
   largest piece of each, up to four materials — at four zoom levels **scaled to
   that print's own size**, and prints a paste-ready `views` block. (Until
   2026-09-02 it rendered the four largest PRIMITIVES, which on the tennis suit were
   all printed stitching, so neither real print was ever framed — audit C-05.)
   **Open the contact sheet it names** and pick the frame that holds each print
   with a little margin — too tight and decimation at the edges reads as damage,
   too wide and the number starts describing fabric.

   ⚠️ It prints an ABSOLUTE path, and this line used to say
   `output/views/candidate-views.png`, which does not exist at the repo root:
   `--keep` resolves against the CWD and `pnpm` runs the script from
   `tools/asset-pipeline/`. Corrected 2026-08-09, after following this very step
   and getting "No such file". Same package-vs-repo-root confusion as the `--`
   separator in step 0.

   ⚠️ **The proposed zoom is a starting point, not an answer.** It frames the
   PRIMITIVE's bounds. On N001's neck logo that clipped the "RUN" wordmark off
   the bottom edge, because the print is two elements and the primitive only
   covers one — so the shipped view is one rung wider than the tool proposed.
   You cannot see that in the numbers, only in the picture.

   Keep only the prints worth guarding. Detection is deliberately the same
   `isArtworkTexture` the gates use, so it also surfaces things that are not
   really print — on N001 it reports both zip tapes.
4. `pnpm eval:artwork:real -- raw/<name>.glb --calibrate --keep output/cal`

   The camera-fingerprint guard is exempt under `--calibrate`; it prints a loud
   notice instead of refusing. Until 2026-08-09 it was not, so adding a view to a
   garment the manifest already knew made this step throw — the guard blocked the
   exact command its own error message told you to run, and the only way past it
   was to hand-edit the fingerprint to a value nobody had measured yet.
5. **Open the contact sheets in `output/cal/`.** Confirm the known-bad case is
   visibly damaged and the shipped preset is not. This step is the authority; the
   numbers only record what you saw.
6. Add an entry to `raw/CANONICAL.json` with the checksum, byte count, the views
   you chose, the `cameraFingerprint` from the calibrate run, and the ceiling —
   above `balanced`, below both `known-bad` and `control`.

**N001 now guards three prints, not one** (chest wordmark, hem label, neck logo)
— see `raw/CANONICAL.json`. Its ceiling rose from 4.2% to 6.5% when they were
added, and that is not a ceiling being loosened to make something pass: the hem
label sits on a curved hem, decimates harder than the flat chest print, and is
now the worst case in every row. The shipped preset still measures 3.97% against
it and is indistinguishable from the baseline by eye.

**Zoom below 12° did nothing before 2026-08-08.** `<model-viewer>`'s
`min-field-of-view` defaults to 12deg and the render harness never overrode it, so
tighter crops were silently clamped — measured as byte-identical PNGs at 1.4° /
2° / 3.1° / 4.5°. It is why N001's 0.039 m hem label and 0.030 m neck logo are
recorded as "NOT COVERED": they could not be framed at all. `render.ts` now sets
`min-field-of-view="1deg"`. N001's own 14° view is unaffected and was verified
byte-identical across the change.

### Keeping the copy safe

**The owner keeps their own external copies of the raw exports** — stated
2026-08-08, when an automated backup into the nightly-mirrored media bucket was
offered and **declined**, on the grounds that it would duplicate storage they
already maintain. Do not re-propose one; this is a settled decision, not an
oversight, and the earlier text here ("one copy on one disk is not a copy",
written when the copy was believed to be laptop-only) no longer describes the
arrangement.

What that decision does **not** cover, and what this repo still owes:
`raw/CANONICAL.json` is the only thing that makes an externally-held copy
*checkable*. A file handed back months later is an assertion until its SHA-256
matches; a re-export from CLO lands at the same path with the same filename,
different geometry, and would produce a perfectly plausible damage number for a
garment nobody calibrated. Keep the manifest current — it is the half of this
that external storage cannot replace.

After 2026-08-19 the R2 original is gone, so if an external copy is ever lost the
only route back is a fresh CLO export, which is byte-different and needs
re-calibrating from scratch (see "Replacing or adding a garment" above — that is
now a followable procedure rather than a research task).

**Dependency updates**: Dependabot runs in **quiet mode** — routine version-bump
PRs are off (`open-pull-requests-limit: 0` in `.github/dependabot.yml`) to keep the
branch list clean for a solo maintainer, but it still opens a PR automatically for
a real **security** advisory. Day-to-day, `audit-ci` blocks high/critical
vulnerabilities on every change. To resume routine updates, raise the limits in
`.github/dependabot.yml` (grouping/ignore rules are kept ready); the same CI gates
run on any Dependabot PR before merge.

## The CSP error on every live page load — RESOLVED 2026-08-06

**Found 2026-08-05** in a real browser on `viewer.wear-run.help`: an inline script
the delivered HTML never contained was violating `script-src`. Fixed 2026-08-06.
The page now serves exactly one inline script (our theme bootstrap, allowed by
hash) and logs no CSP error.

> ⚠️ **This section stated the wrong cause and the wrong fix until 2026-08-08.**
> It blamed Cloudflare **Web Analytics** "Automatic Setup" and told you to disable
> it in the dashboard. Both were wrong, and the correction — made on 2026-08-06 in
> `CLAUDE.md` and `docs/SESSION-2026-08-05.md` — never reached this file. Anyone
> opening the runbook during an incident was sent to a toggle that does nothing.
> Recorded rather than quietly deleted, because the wrong diagnosis is the
> instructive part: it was **inferred from the beacon's presence** instead of read
> off the injected script.

**The real cause: Cloudflare's JavaScript Detections**, bundled with **Bot Fight
Mode**. The script names itself — `window.__CF$cv$params`, loading
`/cdn-cgi/challenge-platform/scripts/jsd/main.js`.

Web Analytics was never involved. Measured: the delivered HTML had **zero**
matches for `cloudflareinsights`, and a live page load made **zero** requests to
it.

**No hash can ever cover it.** The script embeds a per-request ray id and
timestamp, so its sha256 differs on every single load — three values measured
inside one minute. Anyone pinning a hash is chasing a number that changed before
they pasted it.

### The fix, which is not in the dashboard

Turning Bot Fight Mode off is **not sufficient**. `enable_js` is a separate zone
flag that does not clear with it, and the Free plan renders it as read-only status
text ("JS Detections: On") with no control. Verified via the API: `fight_mode:
false` and `enable_js: true` at the same time.

From an authenticated dashboard session:

```js
// GET first; PUT REPLACES the config, so echo every field back.
// PATCH returns 405 — this endpoint is PUT-only.
const cur = (await (await fetch(`/api/v4/zones/${ZONE}/bot_management`,
  {credentials:'include'})).json()).result
const body = {...cur, enable_js: false}; delete body.using_latest_model
await fetch(`/api/v4/zones/${ZONE}/bot_management`,
  {method:'PUT', credentials:'include',
   headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
```

Zone `wear-run.help` = `805d8ae5fa0dea40c960a2561f66d141`. Injection stopped
immediately.

**Knock-on effect worth knowing:** this turned Bot Fight Mode **off**, which was
the stated blocker for the API domain cutover. See the "RE-TEST THIS" note under
"API + media domain cutover" below — that conclusion was drawn under conditions
that have since changed.

Two rejected alternatives, for the record:

- **`Cache-Control: no-transform` on the HTML** — documented to stop the
  injection, but it cannot be delivered to the SPA routes from `_headers` on this
  deployment. Tried and measured; see `apps/viewer/scripts/csp.mjs`.
- **CSP nonces** — Cloudflare adds matching nonces to what it injects by parsing
  your CSP response header, but a nonce must be per-request, so it would need the
  viewer Worker to rewrite the header per response. Nonces set via `<meta>` are
  explicitly unsupported.

**Never widen to `'unsafe-inline'`.** That would re-permit every inline script on
the page and discard the protection the hash list exists to give.

## Poster filenames keep the `n001-` prefix, deliberately

Every poster for the product now slugged `rxps` is still named `n001-*.webp`
(`n001-wine-poster.webp`, `n001-black-poster-1.webp`, …). All URLs resolve, and no
customer ever sees a filename.

**This is a decision, not an oversight — do not "discover" it again.** Recorded
2026-08-18 (audit finding N3). Renaming means re-uploading to R2 and re-pointing
the live product record, with a window in which a link can break, on the only live
product, for zero customer benefit. The names will correct themselves the next time
the pipeline regenerates posters for this product; there is no reason to force it
sooner.

The same rename left two things that were NOT harmless and were fixed: the six text
alternatives naming the wrong garment (audit M2), and `og:image:alt` in
`apps/viewer/index.html`. A filename is invisible; a description read aloud to a
screen-reader user is not. That is the line between this decision and those fixes.

## Rotating PAYLOAD_SECRET

⚠️ **Corrected 2026-09-10. This section said rotating only "logs everyone out". It also
switches off EVERY CMS API key, the garment robot's included.** Payload stores each API
key encrypted with this secret and looks it up by a fingerprint made with it (see
`apps/cms/CLAUDE.md`, "A Payload API key cannot be read back"). Passwords are unaffected.

Followed as written on 2026-09-10, it left raw upload 14 stuck on **Queued**:
- The robot's first call marks the row `processing` (`apps/shrink/src/index.ts`).
- The CMS answered 403 three times, and the job dead-lettered.
- The admin cannot move a Queued row. The Status field is read-only, and *Try this again* is refused unless the row is Failed or Ready (`apps/cms/src/collections/rawUploadRetry.ts`).

The new secret took effect at once, with no redeploy. The robot's old key got its first 403 two minutes after the rotation.

Do all of it in one sitting, in this order, with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` set in the shell:

1. **One value, three places.** Every deploy writes GitHub's `PAYLOAD_SECRET` into the
   Worker (`.github/workflows/ci.yml`, "Apply worker secret"), so changing only the
   Worker is undone by the next deploy. The Keychain copy is written FIRST, so a failure
   in a later step cannot lose the value:

   ```bash
   s="$(openssl rand -hex 32)" && security add-generic-password -U -a payload -s run-apparel-payload-secret -w "$s" && printf '%s' "$s" | npx --yes pnpm@10.34.5 --filter @run-apparel/cms exec wrangler secret put PAYLOAD_SECRET && printf '%s' "$s" | gh secret set PAYLOAD_SECRET --env production && unset s
   ```

   Read the value back later with
   `security find-generic-password -a payload -s run-apparel-payload-secret -w`.
2. Log in to `/admin` again, because every session ended.
3. **Re-issue the robot's key:** *Users* → `robot@wear-run.help` → **Generate new API
   key** → **Save**. The "New API Key Generated." message is NOT a save. On 2026-09-10
   the key was generated but not saved, and `users.updated_at` stayed at the day the
   robot was created. Check that *Last Modified* changed.
4. Give the SAVED key to the robot, pasting it at the prompt:
   `npx --yes pnpm@10.34.5 --filter @run-apparel/shrink exec wrangler secret put CMS_ROBOT_API_KEY`
5. **Only then**, tick *Try this again* on a finished raw upload whose product is already
   published (the robot will not attach to it), and wait for **Ready to review**.
   Ticking it before step 4 strands the row on Queued.

Any other API key is dead too, for example one on `admin@wear-run.help`. Issue a new
one only if something actually uses it.

**A row already stuck on Queued** has no admin exit. Set it back to Failed in D1, which
enqueues nothing, then retry it from the admin:

```bash
npx --yes pnpm@10.34.5 --filter @run-apparel/cms exec wrangler d1 execute run-apparel-viewer-db --remote --command "UPDATE raw_uploads SET status = 'failed' WHERE id = <id> AND status = 'queued'"
```

## security.txt — renewing it once a year

Decided 2026-09-18, live from the merge that deploys it: every host answers
`/.well-known/security.txt` (RFC 9116) with one shared text,
`packages/shared/src/securityTxt.ts` — the documents Worker, the site (wear-run.help and
cms.; www. redirects to the apex copy) and the viewer all import it. Security reports go to
`team@wear-run.com`, which SECURITY.md names too.

Its `Expires` must stay less than a year ahead. `scripts/public-security-probe.mjs` reads
every host's live copy daily (uptime.yml) and **fails 30 days before the date**, opening an
uptime alert. To renew:

1. Confirm `team@wear-run.com` still reaches someone.
2. In `packages/shared/src/securityTxt.ts`, set `SECURITY_TXT_REVIEWED` to today and
   `SECURITY_TXT_EXPIRES` to at most a year later. The unit test refuses anything further.
   The current date matches wear-run.com's own security.txt, run by the email-signature
   project, so both renew together.
3. Merge and let CI deploy; its post-deploy step runs the probe strictly.

**It is unsigned, on purpose** (decided 2026-09-18). RFC 9116 recommends an OpenPGP signature,
and internet.nl lists signing and an `Encryption:` field as optional notes that carry no score.
HTTPS already proves the file comes from these hosts. A signature would add a private key to
keep safe and a yearly re-signing step, for no score and little benefit on a single-maintainer
site.

## The script guard (`apps/cms/worker.mjs`) — if the public pages misbehave

The site's Worker entry gives every public page's scripts a per-request nonce (SE-04, decided
2026-09-18, live from the merge that deploys it). **It fails open until a page starts to
stream.** If it errors first, or a page arrives with a policy or compression it does not know,
the page keeps working under the old policy. `scripts/public-security-probe.mjs` then fails with
"script-src still allows 'unsafe-inline'", and the Workers logs carry a `[csp-nonce]` line. An
error after a page has started to stream cannot fall back: that page arrives cut off, and the
probe fails with "the page is cut off or garbled".

- **A new script is blocked on the site** (the browser console says "Refused to execute…
  nonce"): an edge feature started injecting one (`docs/CLOUDFLARE-SETUP.md` 11.7). Turn that
  feature off for `wear-run.help`.
- **Roll back:** set `"main"` in `apps/cms/wrangler.jsonc` back to `".open-next/worker.js"` and
  deploy through a PR. Pages then use the fallback policy immediately.
- **Prove it:** `node apps/cms/e2e/csp-nonce-edge.mjs --origin=https://wear-run.help` checks
  3 browser engines × 6 page types.

## Private document links (catalogue and profile)

Decided 2026-09-11 and live from the merge that deploys it: the catalogue and the
company profile have no guessable address. Each opens only from a private link:

| Document | Links — the same words after either address | Worker secret |
|---|---|---|
| Product catalogue | `https://catalogue.wear-run.help/<code>` and `https://catalogue.wear-run.com/<code>` | `CATALOGUE_CODE` |
| Company profile | `https://profile.wear-run.help/<code>` and `https://profile.wear-run.com/<code>` | `PROFILE_CODE` |

**Both addresses, one document (decided 2026-09-17, live from the merge that deploys it).**
The `wear-run.com` addresses are additional; the `wear-run.help` ones must keep working
forever, because links already sent use them. A visit to either counts as the same
document, and the visit records store no hostname. ⚠️ `wear-run.com` accepts **TLS 1.3
only** (a setting of that zone, which belongs to the email-signature project), so a visitor
behind an old office security filter or antivirus may be able to open only the `.help`
link. Give out whichever address suits; both open the same pages.

The words after each address are chosen by the owner. They keep out accidental visitors and
search engines, and are **not** a password against someone determined to guess (owner
decision, 2026-09-11). The link opens a page of pictures, one per PDF page, with a
Download PDF button that serves the original file. `wear-run.help/catalogue` and `/profile`
answer 410 "no longer active". Code: `infra/apex-404/`.

⚠️ **A code is a password in a URL.** Never put one in this repository, a commit message,
an issue, a CI log, a CMS field (the CMS refuses it, because the public API would publish
it) or anywhere public. The full links live in the owner's Passwords and in the two
external uptime monitors, nowhere else.

### Changing a link's words (a leaked or retired link)

1. The owner chooses the new words: lowercase letters and digits in hyphen-joined words
   (a new year is the simplest change). **Two rules the Worker enforces itself, fail
   closed:** the words must not start with `catalogue` or `profile` (the retired zone
   routes match any suffix, so a code shaped like one could be served from their cache
   entry — see `infra/apex-404/documents.js`), and the catalogue's and profile's words
   must differ from each other. Never write them into this repository, an issue or
   a CI log.
2. Set the secret to the chosen words — the words alone, not the whole link — through the
   Cloudflare API (`PUT /accounts/{account_id}/workers/scripts/run-apparel-apex-404/secrets`
   with `{"name": "CATALOGUE_CODE", "text": "<code>", "type": "secret_text"}`), or with
   `npx wrangler@4.122.0 secret put CATALOGUE_CODE --name run-apparel-apex-404`. Either
   creates and deploys a new Worker version.
3. Check with a plain GET, never HEAD, **on both addresses** (`.help` and `.com`): the old
   link must answer **404** and the new one **200**. If the old one still opens, run `pnpm deploy:apex` from a clean, up-to-date
   `origin/main` checkout — it deploys whatever is on disk, so a stale or dirty tree
   ships the wrong code. Running it clears the old link regardless of what was cached:
   every deployment starts from a cold cache, and Workers Caching cannot be purged from
   outside a Worker.
4. Update that document's uptime monitor, then give the owner the new link.

### Replacing the catalogue or profile PDF

1. Render the pictures from the new file, **outside this repository**:
   `node scripts/document-pages.mjs --doc catalogue --pdf <new.pdf> --md5 <its MD5> --out <dir>`.
   Open `<dir>/contact-sheet.jpg`; if a spread's artwork crosses its red centre line,
   re-run with `--whole <page numbers>`.
2. Upload every `<dir>/<version>/*.webp` to `run-assets/documents/<doc>/<version>/` with
   `npx wrangler@4.122.0 r2 object put run-assets/<key> --file <file> --content-type image/webp --remote`,
   then list that prefix and check the count is three per part in the manifest.
3. Upload the new PDF over the SAME key — `RUN PRODUCT CATALOUGE.pdf` or
   `Company Profile.pdf`, spelled exactly — and confirm its etag equals the `--md5` you
   rendered with. Upload `<dir>/manifest.json` to `run-assets/documents/<doc>/manifest.json`
   LAST.
4. Anyone who opens or reloads the page sees the new pictures from the moment the manifest
   is uploaded: the page is never cached (`no-store`, owner decision D32, 2026-09-15, live
   from the merge that deploys it), so the Worker builds every open from the current
   manifest. The download follows within an hour, or at once after running
   `pnpm deploy:apex` from a clean, up-to-date `origin/main` checkout.
   Old picture versions stay in R2 until the owner decides to delete them. **A page already
   open in a visitor's browser shows broken pictures until they reload it**: `pictureKey`
   (`infra/apex-404/manifest.js`) serves a picture only when its version segment matches
   the CURRENT manifest, so the moment the new manifest is uploaded, the old version's
   picture URLs already sitting in that open page's HTML stop resolving — even though the
   old files are still physically in R2, untouched.

### If a link stops working

- **The real link shows "not active" (404):** the secret is missing or different, or —
  the word rule, decided 2026-09-15 — it starts with the retired word `catalogue` or
  `profile`, or equals the other document's own secret. Only the Worker's own
  `[apex] … cannot be served` log line says which of these it is.
  `npx wrangler@4.122.0 secret list --name run-apparel-apex-404` shows names only.
- **"Temporarily unavailable" (503):** the manifest is missing or invalid, or a file it
  lists is missing. Workers Logs carry the reason (`[apex] … manifest rejected: …`).
  ⚠️ **Workers Logs' REQUEST lines carry the full address, words included** — if you
  ever paste a log anywhere public, quote only the `[apex] …` reason line.
- **The old `/catalogue` serves a PDF again:** the Worker was rolled back. See "Undoing a
  bad deploy".

### Document visits

Since 2026-09-15 the documents Worker records every visit to a private link in the
website's own database, in `ctx.waitUntil` after the response is already sent — a
slow or failed write never slows down or breaks a real visitor's page.

**Where to look:**
- **Admin → Document visits** (`/admin/collections/document-visits`): one row per
  day, document and visitor code, newest first. Every field is read-only.
- The summary box above that list shows the last 7 and 30 days for each document —
  people, opens, downloads, how many read past halfway or to the end, the top
  countries, and the device split.

**What a row's `kind` means**, decided in this order: `private` — the visitor's
browser sent a Global Privacy Control signal, so only the open itself is counted and
every detail column is blank; `link-preview` — a messaging or social app fetching the
page to build a preview card (WhatsApp, Facebook, Slack and similar); `robot` — any
other automated client; `old-link` — a `person` request to the retired
`wear-run.help/catalogue` or `/profile` address; `person` — everything else, which is
what "people" and "opens" on the summary box count.

**Known limits**, worth having in mind before treating a number as exact:
- A few rows will have no city — Cloudflare does not always resolve one.
- **WhatsApp usually opens a link in the phone's own browser**, so most WhatsApp
  visits show as Safari or Chrome, not as a named app. Instagram, Facebook and
  LinkedIn's own in-app browsers DO announce themselves and are named.
- Outlook "Safe Links" and similar email scanners can open a link the way a person
  does, and cannot always be told apart from one.
- **iPads usually count as computers:** Safari on iPadOS 13 and later sends the same
  User-Agent as a Mac.
- "Read up to page" is approximate — a browser loads a page or two ahead before
  anyone actually scrolls that far.
- Counts of people are "about": several people behind the same office or mobile
  network, on the same kind of phone or browser, share one code for the day.

**Three read-only queries, through the Cloudflare connector's D1 query tool**
(database `run-apparel-viewer-db`, id `41e20361-1a5f-4c87-b5ca-781c57c9b3f4` — the same
one `apps/cms/CLAUDE.md` already documents reading production with; its response
carries `rows_written`, so "this was read-only" is provable). All three are ordinary
`SELECT`s a Claude report can run directly:

- **This week, per document:**
  ```sql
  SELECT document, kind, COUNT(DISTINCT visitor) AS people, SUM(opens) AS opens, SUM(downloads) AS downloads
  FROM document_visits
  WHERE day >= date(datetime('now', '+5 hours'), '-6 days', 'weekday 1')
  GROUP BY document, kind
  ORDER BY document, kind;
  ```
- **People by country, last 30 days:**
  ```sql
  SELECT country, COUNT(DISTINCT visitor) AS people
  FROM document_visits
  WHERE kind = 'person' AND country != '' AND day >= date(datetime('now', '+5 hours'), '-29 days')
  GROUP BY country
  ORDER BY people DESC
  LIMIT 10;
  ```
- **The last weekly email:**
  ```sql
  SELECT week, status, sent_at, error FROM document_visit_emails ORDER BY week DESC LIMIT 1;
  ```

**The weekly email.** Every Monday 09:00 Pakistan time, a summary for the previous
Monday-Sunday goes out. `status: failed` with `error: not configured` means the Worker
secrets that hold the sending key and the recipient are not both set — this never
blocks a deploy (CI requires neither), it only means nobody gets that week's email
until the secrets are set and a trigger fires again for that week.

**Rotating the sending key — all owner actions, guided at the time:** the owner
creates a new sending-only key in Resend, replaces the Worker secret with it, then
deletes the old key in Resend. Claude never sees the value either side of the swap.

**Sending a test email, with the owner's okay at that moment:** add a temporary
`* * * * *` trigger through the connector, wait for that week's `document_visit_emails`
row to read `sent`, put back exactly the two triggers `infra/apex-404/wrangler.jsonc`
declares, and confirm with the owner that the email actually arrived.

⚠️ **The same week cannot be sent twice inside 24 hours, by design.** Each send carries
an idempotency key built from that week's Monday, and the email provider keeps a key for
24 hours: a second attempt at the same week within that window returns the first
response instead of sending again. That is what stops a retry — or a forgotten
`* * * * *` trigger — from mailing the same summary repeatedly. After 24 hours the key
expires and a genuine re-send works. If a test email must be repeated sooner, change
nothing and wait it out; do not try to force it.

**Clean-up.** Every day at 05:05 Pakistan time, visit rows and weekly-email rows older
than 12 months are deleted, and yesterday's and older daily secrets are deleted with
them — once a day's secret is gone, that day's visitor codes can never be recomputed
or linked to a later day's.

## Analytics & events

Viewer telemetry (analytics, diagnostics, client errors) lands in the **Events**
collection in `/admin` (System group). No IP or personal data is stored. The
nightly workflow prunes rows older than 180 days on the 1st of each month; to
prune on demand run `nightly-backup.yml` via *workflow_dispatch*.

Aggregate page views (if enabled) are in Cloudflare **Web Analytics**.

### Somebody has to read them — the weekly digest

`.github/workflows/diagnostics-digest.yml` runs Mondays 08:17 UTC, queries the
last 7 days of `diagnostic` and `error` rows, and opens (or comments on) a
`diagnostics`-labelled GitHub issue. One rolling issue, not one per week.

It exists because **nothing read this table for six weeks.** The 2026-08-03 audit
found it holding 8 × `model-load-error`, 13 × `variant-missing` and an uncaught
React error from real visitor sessions — every one a buyer who did not see a
garment, and none of them known to anybody. The viewer is careful to report *why*
it broke; that only pays off if someone looks.

What the events mean:

| Event | What happened | What to do |
|---|---|---|
| `model-load-error` | A buyer opened a product and the 3D file did not load | Check the GLB is reachable and under 40 MB |
| `model-missing` | A **published** product has no 3D file at all | Attach one, or move it to Draft |
| `variant-missing` | A colour button pointed at a colour not inside the file | Re-answer "Which colour in your CLO file is this?" |
| `webgl-context-lost` | The device gave up the GPU context mid-view — usually memory | Expect on older iPhones with heavy models; the lever is triangle count |
| `variants-unverified-while-published` | A re-upload renamed the colours under a live product | Re-map the colours on the Colours tab |
| `render3d-unavailable` | The device or Data Saver refused 3D up front | Nothing — the poster fallback is working as intended |
| `viewer-load-failed` | The product's details never reached the page — a server error or the visitor's connection | Look up that minute in the CMS Worker's logs; a 200 there means the visitor's side failed |
| `render-scale-degraded` | A slow device drew the 3D at lower sharpness (model-viewer's own GPU throttling) | Nothing, unless many **browsers** report it on one product |

**Read the `browsers` column before the count.** On 2026-09-10 one scripted audit
of ours wrote 371 of the week's 385 rows, and a count on its own read like an
outage. Since 2026-09-11 the digest counts distinct user-agents per row and leaves
out two things on purpose: user-agents carrying `run-apparel-` (every tool of ours
names itself that, and `apps/cms/src/endpoints/events.ts` also drops them at
intake) and the `ResizeObserver loop…` browser notice, which Sentry already
ignores. `apps/cms/src/diagnosticsDigest.test.ts` runs the digest's own SQL
against SQLite. Rows named `server` or `network` are `viewer-load-failed` stored
under the wrong name, from 2026-09-07 until that fix shipped.

### Page speed from real visits — the same Monday issue

Since 2026-09-17 the digest also reports how fast the 3D viewer is for the people who
really use it, from the numbers each visit's browser measures (Largest Contentful
Paint and Cumulative Layout Shift). The viewer measured them from 2026-09-04, but
nothing kept them until the `events` table gained the `lcp_ms` and `cls` columns.
The issue shows the 75th percentile of each, the level three in four visits reach:

| Line | Good | Worth a look |
|---|---|---|
| **Loading** — seconds until the main content is on screen | 2.5 s or less | above 4 s |
| **Steadiness** — how much the page jumps while it loads | 0.1 or less | above 0.25 |

Read it the way you read the `browsers` column: fewer than 50 visits in a week is a
hint, not a verdict, and the issue says so. Our own tools are left out, as in the
diagnostics table. If the read fails, the issue says "Page speed could not be read
this week" — open that run in the Actions tab. `apps/cms/src/diagnosticsDigest.test.ts`
runs the query's own SQL against SQLite.

## Error tracking

Server-side worker errors are in **Workers Logs** (Observability is enabled in
`wrangler.jsonc`; `wrangler tail` for live). Client-side errors have three layers.

**1. First-party diagnostics → the Events table.** Already running, no
configuration. `lib/telemetry.ts` registers `window.onerror` and
`unhandledrejection` and posts to `POST /api/public/events`; `lib/diagnostic.ts`
adds the named failures in the table above. **This is what works when everything
else is off** — but it carries a *message string only*, capped at 5 per session
and de-duplicated on the first 100 characters. Enough to know something broke,
not enough to find it. Read weekly by `diagnostics-digest.yml`.

**2. React render errors → `ErrorBoundary`.** A component that throws now shows
the branded unavailable state instead of a blank page, and reports through the
same `diagnostic()` seam as `react-render-error`. ⚠️ The reporting is not
optional decoration: React re-throws an *uncaught* render error to
`window.onerror`, so a boundary that stayed silent would trade a white screen for
a white screen nobody hears about. Pinned by `ErrorBoundary.test.tsx`.

**3. Sentry (optional, free tier) → stack traces.** Off by default; set the
`VITE_SENTRY_DSN` repo variable to enable. When unset the SDK is
dead-code-eliminated (measured: zero files matching `/sentry/` in `dist/`). The
CSP auto-allows the DSN's ingest origin at build time.

### Turning Sentry on

1. Create a free Sentry project (platform: `javascript-react`).
2. **In Sentry project settings, before setting the DSN:** switch
   **"Prevent Storing of IP Addresses"** ON and leave **Session Replay** OFF.
   Neither can be done from code — IP capture happens at Sentry's ingestion edge,
   and Replay records the DOM.
3. `gh variable set VITE_SENTRY_DSN --body "<dsn>"`
4. For readable stack traces, also set all three of `SENTRY_ORG` /
   `SENTRY_PROJECT` (variables) and `SENTRY_AUTH_TOKEN` (**secret**, scoped to
   `project:releases`). Without all three, no maps are uploaded *and none are
   generated* — see the coupling note in `vite.config.ts`.

**What the code already guarantees:** `sendDefaultPii: false`; `beforeSend`
strips `user`, cookies, headers, request bodies, and reduces the URL to origin +
pathname so query and fragment can never carry anything; `tracesSampleRate: 0`;
tags limited to release, environment, product slug, colourway slug, WebGL
availability and pointer type. Pinned by `sentry.test.ts`.

**What it cannot leak, structurally:** there is no login, no cookie and no form.
The enquiry path is a `mailto:`/`wa.me` link built client-side
(`components/Contact.tsx`), so nothing a visitor types ever exists in the page.

**Rollback:** unset `VITE_SENTRY_DSN` and redeploy. The SDK leaves the bundle and
the CSP entry disappears with it — no code revert needed.

## What "working" means — service objectives

Written down because "is the site OK?" was previously answered by opinion, and
because an alert threshold is only meaningful next to a target it defends.

**This is a B2B reference viewer, not a shop.** Nobody loses a transaction when it
is down; a buyer who scanned a QR tag sees an error and forms a view of the brand.
That sets the bar high enough to matter and low enough to be honest about a
$5/month budget and one part-time maintainer.

| Objective | Target | Measured by | Why this number |
|---|---|---|---|
| Viewer page loads | **99.5%/month** (≈3.6 h down) | UptimeRobot keyword check, 5 min | Cloudflare Workers' own availability is the floor; we cannot beat our platform |
| Product API answers | **99.5%/month** | UptimeRobot keyword `"productCode":"R-XPS"` ⚠️ see below | Same |

> ⚠️ **CHECK THE EXTERNAL MONITOR'S KEYWORD BY HAND — this table was wrong about it
> until 2026-08-30, and this repo cannot verify it.** The row said the keyword was
> `"productCode":"N001"`. Measured 2026-08-30, the live payload contains
> `"productCode":"R-XPS"`, and `GET /api/public/viewer/n001/wine` returns **404** —
> the slug was renamed on 2026-08-15 and the code gained a hyphen on 2026-08-17.
>
> So if UptimeRobot really is watching for `N001`, that monitor has been wrong ever
> since: alerting continuously if it fires on absence, or silently never firing if it
> fires on presence. Both are worse than no monitor. **The configuration lives in
> UptimeRobot, not in this repository, so nothing here can catch it** — open the
> monitor and confirm the keyword reads `"productCode":"R-XPS"`.
>
> The same rename broke both in-repo post-deploy gates on 2026-08-15 and again on
> 2026-08-17. Before changing any product identity field, grep `scripts/smoke-*.mjs`,
> `.github/workflows/` **and** re-read this box.
| A published garment actually renders | **100%** — any failure is an incident | `scripts/smoke-viewer-payload.mjs` in uptime.yml | A 200 that renders nothing is the failure this project has actually shipped, twice |
| Time to notice an outage | **≤10 min** | UptimeRobot, 5 min interval | GitHub's cron cannot do this — see below |
| Time to roll back a bad deploy | **≤15 min** | "Undoing a bad deploy" above | Procedure is written and drilled |
| Printed artwork legible on every deploy | **100%** | `pnpm eval:artwork` gates CI | Not availability, but it is the product |

**The detection target is why the external monitor is not optional.**
`uptime.yml` asked for every 15 minutes until 2026-08-18 and GitHub delivered about 27% of that —
median gap 44.7 min, p90 102 min, worst 6.1 h, measured over 100 runs on
2026-08-10. On GitHub's cron alone the honest detection target would be "about an
hour, sometimes six". UptimeRobot's 5-minute check is what makes ≤10 min true.
Treat `uptime.yml` as the *deep* check (it verifies a garment renders) and
UptimeRobot as the *fast* one.

### Who gets told, and in what order

1. **UptimeRobot → email to the owner.** Fastest, and outside the system being
   watched. This is the one that matters.
2. **`uptime.yml` → a GitHub issue**, or a comment on the open one. Deeper check,
   slower and less reliable delivery.
3. **`heartbeat.yml`, every 6 h → an issue if the monitors themselves stopped
   running.** This exists because the alerting branch was silently disabled for 17
   days and nothing noticed.
4. **Sentry → email** on a client-side exception. Not an availability signal; a
   quality one.
5. **`diagnostics-digest.yml`, Mondays** — the weekly read, not an alert.

⚠️ **Layers 2–5 all terminate in one person's GitHub notifications, inside the
system being watched.** That single point of failure is the reason layer 1 exists
and is the reason it must not be switched off to reduce noise. If you ever find
yourself muting UptimeRobot, add a second destination instead.

### What is deliberately NOT covered

- **No paging, no on-call, no 24/7.** One maintainer in one timezone. An outage
  that starts at 02:00 is found at breakfast, and that is accepted.
- **No error budget policy.** Recorded as a decision, not an oversight: with a
  single maintainer there is no release train to halt, so a budget would be a
  number nobody could act on.
- **The bare apex `wear-run.help` serves the marketing site since 2026-09-06** (it
  404'd in ~0.7 s from 2026-08-19, and 522'd after 20.2 s before that). The CMS Worker
  answers it on zone routes; `infra/apex-404/` answers the old `/catalogue` and `/profile`
  (410) and the private document hosts. `scripts/apex-probe.mjs`, run from `uptime.yml`,
  asserts the site, the retired paths and the refusals; the external uptime monitor
  watches the real private links.

## Uptime alerts

> ⚠️ **`uptime.yml` STOPPED BEING A LIVENESS MONITOR ON 2026-08-18.** At
> `*/15 * * * *` it billed roughly **1,200 GitHub Actions minutes a month** — about
> 60% of the entire 2,000-minute Free allowance — because GitHub rounds **every job**
> up to a whole minute, so a 12-second check costs a full one, 40 times a day. The
> quota ran out, GitHub refused to start any job, and that stopped a production
> deploy. Cadence is now **daily**.
>
> **Liveness lives on the external uptime service**, which polls every 5 minutes —
> three times more often — and costs no Actions minutes. What stayed in this
> workflow is what that service cannot express: `smoke-live-products.mjs` resolves
> each live garment's model URL out of the API payload and fetches it, catching a
> garment that silently lost its GLB, and `scripts/apex-probe.mjs` asserts the old PDF
> addresses stay retired and the private document hosts refuse without a code. It holds
> no code, because this log is public; the external monitor checks the real links.
>
> ⚠️ **This said "the catalogue probe asserts the redirect still reaches the PDF"
> until 2026-08-30. It never did.** The old check tested only that a 3xx carried a
> non-empty `Location`, never where it pointed — and after the PDFs moved into R2 on
> 2026-08-28 there was no redirect at all, so it errored on every run while the run
> still concluded `success`. Outage issue #47 was that false alarm.
>
> **If you ever raise the cadence here, do the arithmetic first**: runs/day × jobs ×
> 1 minute, against 2,000/month.



`.github/workflows/uptime.yml` **asks** GitHub to ping `/api/health` and the viewer
once a day (see the cadence note below). On failure it opens a GitHub issue labelled `outage` — or, if one
is already open, **comments on it**.

> ### ⚠️ Measured 2026-08-10 — GitHub delivers about a QUARTER of that cadence
>
> `cron: '*/15 * * * *'` is a **request, not a guarantee**, and on this repo the gap
> between request and delivery is wide enough to change what the monitoring means.
> This page said "every ~15 min … can drift several minutes" until 2026-08-10. The
> drift is not several minutes. Measured over the 100 most recent runs — 94.3 h,
> 2026-08-06 10:38Z → 2026-08-10 08:55Z:
>
> | | |
> |---|---|
> | Runs delivered | **100 of ~377 expected — 27% of the configured rate** |
> | Median gap | **44.7 min** |
> | Mean gap | 57.1 min |
> | 90th percentile | **102.1 min** |
> | Worst gap | **363.6 min (6.1 h)** |
> | Gaps over 60 min | 28 of 99 |
>
> So the honest statement of worst-case detection time *through GitHub* is **around
> an hour and a half at p90, and hours in the tail** — not fifteen minutes. Nothing
> is broken: every run that fires still succeeds, which is exactly why this was
> invisible. Every dashboard was green and the heartbeat correctly stayed silent;
> the fault is in *how often the system looks at itself*, a property almost no
> monitoring measures about itself. GitHub schedules are best-effort and are
> deprioritised under load — this is a private repo on the free Actions tier.
>
> **This is the strongest argument for the external monitor** (see "The watchman
> that is not us" below): it polls every 5 minutes from outside GitHub and does not
> compete for a shared runner queue. That is roughly **18× faster detection** than
> what GitHub actually delivers here.
>
> ⚠️ **It also breaks a stated premise of `heartbeat.yml`.** That file budgets
> **3 hours** for `uptime.yml`, reasoning that each budget is "several times the
> workflow's own interval, so ordinary GitHub cron skew never trips it". The
> observed maximum gap is **6.1 h — twice that budget**. It has not yet produced a
> false `monitoring` issue, but only because no heartbeat run happened to sample
> inside that window; that is luck, not headroom. Raising the budget is a
> *behaviour* change and is deliberately NOT made here — it is recorded so the next
> person decides with the number in front of them rather than the assumption.

> ### ⚠️ Changed 2026-08-07 — and the old behaviour was a 17-day silent failure
>
> This used to be *"if any open `outage` issue exists, do nothing."* That rule has
> no sense of **time**, so a single unclosed issue disabled alerting completely.
> It did: issue #2 was opened automatically on 2026-07-21, nobody closed it, and
> for 17 days every failure would have turned the workflow red in the Actions tab
> and notified **nobody**.
>
> Now a failure comments on the open issue instead of staying silent. GitHub
> notifies on comments, so a new outage always reaches someone, while a quiet
> window (60 min for uptime, 12 h for heartbeat) keeps a sustained outage to about
> one notification an hour rather than four. **You still cannot mute alerting by
> forgetting to close an issue.**
>
> Pinned by `scripts/test-alert-shell.sh`, which runs in CI's `verify` job. It
> reads the shell back out of the YAML and runs it against a stub `gh` — because
> this branch only executes when something is already broken, so nothing else
> would ever catch a typo in it.

**When an `outage` issue appears (or gets a new comment):**

1. `curl -i https://cms.wear-run.help/api/health` — 200 `{"ok":true}` = recovered.
2. If down: Cloudflare dashboard → Workers & Pages → `run-apparel-viewer-cms` →
   Logs (Workers Observability is enabled), and `wrangler tail` for live logs.
3. Check the latest CI deploy didn't fail a migration (see above).
4. Once healthy, **close the `outage` issue.** Still worth doing — a closed issue
   keeps the history readable and makes the next alert a fresh issue rather than a
   comment on an old one. It is no longer load-bearing for alerting to work.

To prove the alert path works: run `uptime.yml` via *workflow_dispatch* with a
bogus `target` URL — it should open an `outage` issue (or comment on the open
one). Note this path deliberately skips `actions/checkout`, which is why the alert
shell must stay **inline in the YAML** rather than move to a script file.

Each curl retries twice before failing (`--retry 2 --retry-all-errors`). A single
20-second sample on a best-effort cron was deciding whether to page the owner, so
one transient blip opened an outage issue for a site that was fine.

## Who watches the monitors (`heartbeat.yml`)

**A monitor that fails before it measures anything opens no alert, and silence is
what healthy looks like.** `uptime.yml` gates its issue on
`steps.check.outputs.ok == 'false'`; a job that dies at checkout never sets that
output. That is exactly how the uptime monitor sat dead for ~23 hours on
2026-08-05 while its failures looked like ordinary alerts.

`heartbeat.yml` runs every 6 hours and asks the Actions API when each watched
workflow last **succeeded**:

| Workflow | Scheduled | Actually delivered | Budget before it alerts |
|---|---|---|---|
| `uptime.yml` | **daily** (was every 15 min until 2026-08-18) | n/a — liveness moved off-platform | 3 hours |
| `nightly-backup.yml` | nightly | nightly | 36 hours |
| `diagnostics-digest.yml` | Mondays | first run due 2026-08-10 | 192 hours (8 days) |

Each budget was chosen to be several times the workflow's own interval, so that
GitHub's best-effort cron skew would never trip it. ⚠️ **For `uptime.yml` that is
no longer true**: the worst observed gap (6.1 h) is twice its 3 h budget. Read the
measured block under "Uptime alerts" above before changing this number. On a breach it opens a `monitoring` issue, or comments
on the open one — same change, and same reason, as the `outage` path above. A
watchdog that its own previous bark can mute is not a watchdog.

It asks the API rather than requiring workflows to report in, so a workflow that
stops running *entirely* — disabled, renamed, deleted, or silently skipped — is
caught by the same check as one that fails. "No successful run on record at all"
is treated as stale, not as a pass, because a run whose only job is skipped by an
`if:` also concludes as `success`.

**When a `monitoring` issue appears** it does *not* mean the site is down. It
means a check is not running, so whatever it watches is currently unobserved.
Open that workflow in the Actions tab and read its latest run; if it is failing at
`actions/checkout` with "Repository not found", the cause is a `permissions:`
block missing `contents: read`.

⚠️ **The heartbeat cannot watch itself.** That is the accepted base case — the
blind spot shrinks from "every scheduled job" to "one job that makes a single API
call". Closing it entirely needs a monitor that is not GitHub. See the next
section; this page used to say that was outside the budget, and it is not — the
tier that covers this costs nothing.

## The watchman that is not us (external uptime monitor)

**Every alarm in this project ends in the same place: a GitHub issue, in one
person's notifications.** If GitHub Actions is degraded, if the schedule silently
stops, or if you simply are not looking at GitHub, nothing tells you the site is
down. `uptime.yml` and `heartbeat.yml` both live inside the system they watch.

**This one action is yours to take — it needs an account, so nobody can do it for
you.** About five minutes, and it costs nothing.

1. Go to **uptimerobot.com** and make a free account. The free tier gives 50
   checks every 5 minutes with email alerts, which is far more than this needs.
2. Add **two monitors**, both of type **Keyword** (not "HTTP(s)" — see why below):

   | | URL | Keyword it must find |
   |---|---|---|
   | The page a customer sees | `https://viewer.wear-run.help/rxps/wine` | `RUN APPAREL` |
   | The data behind it | `https://cms.wear-run.help/api/public/viewer/rxps/wine` | `"productCode":"R-XPS"` |

3. Set alerts to your **email**, and add your phone if you want a push. Do not
   route them back into GitHub — the whole point is that this path is separate.

**Why "keyword" and not a plain up/down check.** A plain check passes on any 200.
The CMS answers `/api/health` with `{"ok":true}` from a worker with an *empty
database* — that is written down here already, and it is why
`scripts/smoke-viewer-payload.mjs` exists. A keyword check fails when the page
still loads but the garment has gone, which is the outage a lead would actually
notice. Both keywords verified live on 2026-08-09: `RUN APPAREL` appears 6 times
in the viewer HTML, `"productCode":"R-XPS"` once in the payload.

**Why those two URLs and not the 3D model.** Neither fetches the GLB. A model
fetch is 27 MB, and at 5-minute intervals that is roughly 230 GB a month of R2
egress against a $5 budget. These two together are **9.3 KB per round — about 79
MB a month**, which is nothing. Never point an external monitor at
`media.wear-run.help`.

⚠️ **If it starts flapping, suspect a bot rule before you suspect the site.**
UptimeRobot polls from datacenters, and free-plan Bot Fight Mode on this zone has
blocked datacenter traffic before — it forced the `cms.wear-run.help` cutover to
be rolled back within the hour. A 403 in the monitor's log means "we were
challenged", not "the site is down". Bot Fight Mode is currently OFF (verified
2026-08-06, and both URLs above answered 200 from a plain client on 2026-08-09).

## Uploading GLB assets to the CMS (and why an upload fails)

**Always run the asset pipeline before uploading — never upload a raw CLO export.**
The CMS media upload streams **through the Worker** (`r2Storage` in
`payload.config.ts` does not set `clientUploads`), so it inherits Cloudflare's
Worker limits on top of the app's own guardrails.

When an upload "just keeps loading" / never completes, check these in order:

1. **Filename.** `checkMediaUpload` (`apps/cms/src/collections/mediaRules.ts`)
   rejects any name with spaces or characters outside `A–Z a–z 0–9 . _ -`. CLO
   exports are named like `cycling uniform 2_Colorway 6.glb` — **rename to
   `n002-navy.glb` style first.** This blocks the file at *any* size.
2. **Size — 40 MB hard cap.** `GLB_HARD_MAX_BYTES = 40 MB` rejects raw/oversized
   GLBs by design (a pipeline-processed file should be well under 8 MB).
3. **Transport — ~100 MB Cloudflare Worker body limit** (free/pro) + 128 MB Worker
   memory. Anything approaching these can't finish transferring. Fix a genuinely
   large-but-valid need by enabling **direct browser→R2 upload**
   (`clientUploads: true` on the `r2Storage` media collection), which bypasses the
   Worker entirely. Not enabled today — see the deferred item below.
4. **Required `alt` field.** The Media collection requires `alt`; leaving it blank
   makes the save fail *after* the file transfers (looks like a hung upload).

Every one of those rejections is now an `APIError(…, 400)`, so the *real* message
reaches the admin panel. Any rejection thrown from a Payload hook **must** be —
a plain `new Error()` is replaced by Payload's generic handler with the useless
"Something went wrong." (`payload/dist/utilities/isErrorPublic.js` hides anything
without a non-500 status). That cost a full diagnostic round-trip on 2026-07-27;
`rawRules.ts` and `mediaRules.ts` were converted on 2026-07-28.

The **private raw-upload inbox** (`raw-uploads`) deliberately relaxes rules 1–3 —
big files and messy names are its whole purpose — but it rejects the characters
`? * < > : | " / \` and trailing dots/spaces. Not cosmetic: Payload builds the R2
object key with `sanitizeFilename` (path + control chars only) and the document
filename with `sanitize-filename` (which also strips those), so such a name is
stored under two different keys and the integrity guard then reports it as a
failed upload.

**The pipeline recipe for a raw CLO file** (the mesh, not the textures, is the cost
— a real export was 9.8 M triangles / 1 MB of textures):

```bash
pnpm pipeline optimize "raw.glb" --out out.glb --simplify 0.05 --meshopt
pnpm pipeline validate out.glb          # expect 0 translucent, < 40 MB, no CLO generator
```

**Tuning `--simplify` — read this before turning the dial.** `--simplify` is a
*target*, not a promise: decimation stops early once the error budget binds, and
once it does, **lowering the ratio changes nothing at all**. The knobs that
actually move the output are:

| Flag | Default | Effect |
|---|---|---|
| `--simplify-error <r>` | `0.0001` | Error ceiling as a fraction of mesh radius. Raise it for a smaller file. |
| `--uv-weight <n>` | `1` | How heavily texture distortion counts against that budget. **This is what keeps printed logos intact.** Lower it for a smaller file; raise it if artwork looks smeared. `0` turns texture-awareness off. Applies to **every** UV set the mesh carries, not just `TEXCOORD_0`. |
| `--normal-weight <n>` | `0.5` | Same for shading. |
| `--artwork-quality <n>` | `95` | WebP quality for textures detected as printed artwork. Separate from `--quality` because lossy WebP is 4:2:0 chroma only and bleeds the hard edges logos are made of. |
| `--artwork-max-texture <px>` | `4096` | Resize cap for artwork. Higher than `--max-texture`: thin lettering is the first thing resampling destroys. |

⚠️ **Check `--uv-weight` actually applied.** `optimize` and the shrink report both
print a decimation line. Primitives counted as **fallback** were decimated
position-only, so the flag did nothing for them — usually because an earlier
meshopt pass already quantized the attributes. Never re-run the pipeline on its
own output.

Those two knobs trade directly against each other, and the effect is large — the
measured table is in `tools/asset-pipeline/src/simplify-textured.test.ts`. Note
the effect only exists where the UV map is non-linear, which real garment unwraps
are and a flat test plane is not.

**Calibration of the three Detail levels** (2026-07-28). Measured on a synthetic
draped surface — 243,602 triangles, non-linear unwrap, hard-edged texture —
running the real pipeline. "Texture error" is the distance between the UV the
decimated mesh interpolates at a point and the UV that point should have; the
undecimated control measures 1.3e-6, so the numbers below are signal.

| setting | triangles | size (meshopt) | mean err | p99 err |
|---|---|---|---|---|
| OLD `lockBorder`, err 0.0001 | 58,378 | 0.29 MB | 0.00001 | 0.00013 |
| OLD `lockBorder`, err 0.001 | 12,180 | 0.07 MB | 0.00006 | 0.00073 |
| **fidelity** (uv 2, err 0.0002) | 20,421 | 0.11 MB | 0.00003 | 0.00036 |
| **balanced** (uv 1, err 0.0005) | 12,180 | 0.07 MB | 0.00005 | 0.00054 |
| **small** (uv 0.5, err 0.002) | 4,872 | 0.04 MB | 0.00013 | 0.00161 |

> ⚠️ **The row labels are the presets as they stood on 2026-07-28.** The measurements
> are still valid for the settings named, but two of the names have since moved:
> `balanced` is now **err 0.001** (adopted 2026-08-05, taking N001 from 37.7 MB to
> 27.0 MB), and `small` was **deleted** — at err 0.002 it renders the chest wordmark
> with MILE breaking apart while passing all three blocking gates. Read the row for
> `small` as "what err 0.002 costs", which is exactly why it is gone.
>
> Note also what this table cannot tell you: every number in it is a *UV error*
> metric, and the 2026-08-05 sweep showed those metrics stay comfortable while the
> rendered lettering degrades. `packages/shared/src/shrink.ts` is the source of truth
> for the current values.

Read it this way:
- **At equal size**, texture-aware beats position-only: `balanced` and OLD-0.001
  both land on 12,180 triangles, but p99 error is 0.00054 vs 0.00073.
- **The size win is the big one.** `fidelity` gets p99 error within 3x of the old
  safest setting using **2.9x fewer triangles**; `balanced` uses 4.8x fewer. That
  ratio is what takes the real garment's 58.3 MB down under the 40 MB cap.
- **Caveat, stated plainly:** this surface is one smooth UV patch. A real CLO
  unwrap has many islands, and `lockBorder` freezes every island edge — so its
  real-world cost should be *worse* than measured here, not better. Treat the
  table as directional and re-measure on a real garment when one is available.

Historical numbers on one real 373 MB export at `--simplify 0.05 --meshopt`:
`--simplify-error 0.001` with borders unlocked gave 14.2 MB but tore the printed
logos; `lockBorder` with the same budget gave 36.1 MB; `lockBorder` with
`0.0001` gave 58.3 MB — over the 40 MB publish cap, so unusable. Those all
predate texture-aware decimation; re-measure rather than extrapolate.

For the automatic shrinker, do **not** edit flags in the container — pick the
**Detail** level on the raw upload instead (Balanced / Highest quality / Smallest
file). The levels map to these flags in `packages/shared/src/shrink.ts`.

**Detail only moves decimation, and it is worth being exact about what that
rules out.** It is the right knob for artwork that comes back *smeared*, warped
or stretched — that is UV distortion from pushing the triangle budget. It does
**nothing** for artwork that is see-through, hidden behind a pale box, or absent:
those come from `alphaMode`, which `solidifyMaterials` decides per material by
reading the actual alpha, identically at every Detail level. Retrying N001 at
"Highest quality" on 2026-08-04 would have produced a byte-for-byte equivalent
failure. Symptom → knob:

| Symptom | Cause | What actually helps |
|---|---|---|
| Graphic smeared, warped, letters stretched | UV distortion during decimation | **Detail → Highest quality.** Also check `artworkAtRisk` in the report: if it names a part, that part's UVs were outside the error budget. |
| Graphic see-through / "half there" | material left on `alphaMode: BLEND`; `<model-viewer>` has no OIT | Nothing the owner can set. Since 2026-09-02 the gate refuses only a hard-edged, fully opaque print still on BLEND (a pipeline fault — report it); a soft-edged or deliberately translucent print is SAVED and listed in the `Report` under "SOFT PRINTED ARTWORK KEPT SEE-THROUGH" — fix it in CLO (opacity 100%) if it should be solid. |
| Graphic covered by a pale box | material forced `OPAQUE`, so the transparent background painted its underlying RGB — measured (240,240,240) on N001 | Nothing the owner can set. Fixed in `d8d745f`; a file built before 2026-08-04 still shows it. |
| Graphic missing entirely | a `MASK` whose effective alpha never reaches `alphaCutoff 0.5`, or a decal drawn from its back face only | Nothing the owner can set. Report it. |

**Deferred (owner request):** remove/raise the 40 MB cap and add an upload
progress %/status in the admin. Both hinge on switching media uploads to
`clientUploads: true` (direct browser→R2) so the Worker body/memory limits and the
opaque "just loading" spinner stop applying. Not yet actioned.

## Posters — the picture a visitor sees while the model downloads

**Since 2026-09-03 (fix plan Rank 6)** the viewer paints the colourway's photo, blurred,
under the loading readout while the model downloads, then cross-fades into the 3D; link
previews on WhatsApp and LinkedIn are built from the same files. The photo comes from
the colourway's poster in the CMS (`posterPreview`), falling back to the product's
"Backup picture". Posters are rendered locally, free, from the finished model:

```bash
npx --yes pnpm@10.34.5 pipeline posters output/<garment>.glb --product rxps \
  --colours "Colorway 2=wine,Colorway 3=blush,Colorway 4=butter,Colorway 5=lime,Colorway 6=black"
npx --yes pnpm@10.34.5 og:cards rxps
```

Judge the set on one sheet before uploading anything — the posters are transparent, so
opened one at a time a white garment is invisible and every per-file check passed five
all-wine skinsuit posters on 2026-09-03:

```bash
cd tools/asset-pipeline && npx tsx scripts/poster-sheet.mjs --out ../../output/poster-sheet.jpg \
  "rxps=../../output/posters:rxps:wine,blush,butter,lime,black"
```

The first writes `output/posters/rxps-<colour>-poster.webp` (and `.png`): front view,
production lighting, transparent background, no caption — 1200×1500. The `--colours`
map is each CMS colourway's slug against the CLO variant it points at (read them off
`GET /api/public/viewer/<product>/<colour>`: `slug` and `variantId`). The second turns
them into the JPEG link cards under `apps/viewer/public/og/` and regenerates the manifest
— commit both. Then, in the CMS, open each colourway and upload its poster as the photo;
the product's "Backup picture" takes any one of them. `scripts/smoke-viewer-payload.mjs`
now fetches every colourway's poster after a deploy and fails on one that is not served.

## Re-processing a garment (the Retry tick-box)

**When you need this:** the pipeline was fixed and you want the fix applied to a
garment already uploaded. If the raw export is **still in the R2 ingest bucket**,
you do not re-upload the file — Retry re-runs the pipeline on the original.

> ⚠️ **Corrected 2026-08-07.** This paragraph said the ingest bucket "has no
> lifecycle rule", which made Retry sound permanently available. It is not: the
> bucket carries `expire-raw-uploads` — **14 days, all prefixes** — verified live
> 2026-08-06 and documented ~450 lines above under "The canonical raw garment".
> **After 14 days there is nothing to retry**, and `scripts/backup-r2.mjs` mirrors
> the *media* bucket and the apex PDFs — never *ingest* — so no backup can restore
> it either.
>
> This claim has now been wrong in **both** directions — asserted as fact before
> the rule existed (corrected 2026-07-28), then asserted absent after it was added
> — and this section is the third copy to carry a stale version of it. The
> standing instruction in `RAW-UPLOAD-PIPELINE.md` applies here too: **run the
> list command rather than trusting any paragraph**, including this one.
>
> ```bash
> pnpm --filter @run-apparel/cms exec wrangler r2 bucket lifecycle list run-apparel-viewer-ingest
> ```

**Since 2026-09-03 (fix plan Rank 12) the tick-box is honest about the two cases
above.** It shows only while `Status` is **Failed** or **Ready to review** — ticked
while a run was still queued or processing, it used to start a second run of the same
file. And before queuing anything the hook asks the ingest bucket whether the file is
still there: after the 14 days it writes *"This file has expired from the upload
store … Upload the CLO export again"* into `Report`, sets Failed, and queues nothing
(`apps/cms/src/collections/rawUploadRetry.ts`). The robot answers the same way if
the file expires while a job waits. To stop the loss happening again, **every
successful run now copies the raw export into the archive bucket** under
`raw-exports/robot/<key>` (`apps/shrink/src/archiveRaw.ts`) and says so at the end of
`Report`; that copy has no expiry, so a garment processed after 2026-09-03 can always
be re-run from it.

**This is the only way to start a re-run.** The job is enqueued by an `afterChange`
hook on the collection (`apps/cms/src/collections/RawUploads.ts`), which fires only
on `create` or on `retry` flipping `false → true` through a save. Writing to D1
directly, or calling the REST API to set the column, enqueues **nothing** — the
row changes and no work happens. There is no developer shortcut for this step.

### Doing it

1. Open `https://cms.wear-run.help/admin/collections/raw-uploads/<id>`
   (the first real garment is id **1**).
2. In the right-hand sidebar, **leave Detail as it is** unless you have a reason —
   see "What Detail can and cannot fix" above. Changing it changes the experiment.
3. Tick **"Try this again"**.
4. Press **Save**.

Processing takes roughly ten minutes. Refresh the page rather than waiting on it.

### Reading the outcome

| `Status` | What it means | What to do |
|---|---|---|
| **Queued** / **Processing** | Picked up, still working. The tick-box has already reset itself to unticked and `Report` reads "Trying again…". | Wait, refresh. |
| **Ready to review** | It produced a file. `The shrunk, pipeline-processed GLB` (`resultGlb`) carries today's date, and `Report` lists the final size and the colours found. | Go to visual acceptance below. |
| **Failed** | The pipeline **refused to save**, which since 2026-08-03 is a designed outcome, not a crash. | Read `Report` — copy it verbatim to whoever is fixing it. |

**The `Report` box is the gate speaking in plain English.** Three structural
findings make the shrink worker throw `PermanentJobError` and save nothing: printed
artwork decimated without its UVs in the error budget, an artwork material left on
`alphaMode: BLEND`, and an artwork `MASK` whose `alphaCutoff` drifted off 0.5. Each
names the offending materials. Do not treat a Failed status as a bug report until
you have read it.

**If the row is stuck or unusable**, uploading the file again creates a new
`RawUploads` row, and `create` enqueues by the same path. That is the fallback, not
the first move — it costs a 350 MB+ upload.

### Visual acceptance — the sign-off

Processing successfully is **not** the same claim as the garment looking right.
This repo keeps those separate on purpose, and the 2026-08-04 fix is measured but,
as of this writing, still unrendered.

- [ ] Open the new `resultGlb` — CMS preview, or attach it to the product in a
      draft and open the viewer.
- [ ] **Zoom right in on the chest logo, on a phone.** For N001 the wordmark must
      read `✳ THE EXTRA MILE` in full.
- [ ] It is **not** see-through and **not** sitting in a pale box. (The 2026-07-29
      file rendered a near-white box measured at (240,240,240).)
- [ ] It is **not missing entirely.** A logo that vanished is a different fault —
      a decal whose faces point inward and is no longer double-sided.
- [ ] Edges are clean, not smeared or torn. *That* one is a Detail problem.
- [ ] Screenshot the chest crop and attach it to `docs/OPEN-ISSUE-ARTWORK.md`.

Until that screenshot exists, the artwork issue stays open regardless of what the
tests say.

## API + media domain cutover

> **Status (2026-07-22): MEDIA HALF DONE, API HALF BLOCKED on the free plan.**
> - **Media:** ✅ cut over. Served direct from R2 at `media.wear-run.help`
>   (R2 custom domain, Active) with a 30-day edge Cache Rule
>   (`viewer-media-30d-edge-cache`) and a bucket CORS policy (viewer origins,
>   GET/HEAD). `PUBLIC_MEDIA_BASE_URL=https://media.wear-run.help` is set in
>   `wrangler.jsonc` and live. Reliable from datacenters too (edge-cached
>   responses bypass Bot Fight Mode) — verified 6/6 from GitHub runners.
>   **Incident found during this work:** the deployed var had been mis-set to
>   the literal `RUN` (stray dashboard edit) → all media URLs became
>   `<origin>/RUN/<file>` → **every poster/GLB 404'd and the streaming fallback
>   500'd on the live site**. If media ever breaks across the board, check this
>   var first. Emergency fallback: set it to `""` (media streams through the
>   CMS worker) and purge the `media.wear-run.help` hostname cache. Note R2
>   sends `Vary: Origin`, so per-origin cache entries self-heal after a CORS
>   policy change — but purge the hostname once after editing the policy.
> - **API:** ✅ **DONE 2026-08-31.** `VITE_API_BASE_URL` is
>   `https://cms.wear-run.help`, the live bundle contains **zero** references to
>   `workers.dev` (index.html plus all four JS chunks — control: the same grep
>   finds `cms.wear-run.help` twice in the same chunk), and
>   `apps/cms/wrangler.jsonc` now sets `workers_dev: false`.
>   **The Pro plan turned out not to be needed.** The blocker below assumed free
>   Bot Fight Mode was on; it was switched **off on 2026-08-06**, and
>   `cms.wear-run.help/api/public/viewer/rxps/wine` answered 200 on four
>   consecutive plain GETs, with `/admin` answering 200 on ten out of ten from a
>   datacenter-shaped client. Measured, not assumed — the warning below about
>   casual curls giving false confidence is still right in principle, which is why
>   the check was repeated rather than run once.
> - ⚠️ **The "Exempt CMS API" WAF Skip rule is still load-bearing — do not delete
>   it.** It was NARROWED on 2026-08-31 from the whole host to
>   `starts_with(http.request.uri.path, "/api/")`, because as written it also
>   switched the WAF off for `/admin`. It is deliberately **not** narrowed to
>   `/api/public/`: `apps/shrink` and the scripts call `/api/products`,
>   `/api/raw-uploads`, `/api/media` and `/api/health` as non-browser clients.
>
> ### ⚠️ RE-TEST THIS (noted 2026-08-07): the stated blocker may no longer exist
>
> The whole rollback above rests on **free Bot Fight Mode being ON**. It was
> turned **OFF on 2026-08-06** — `fight_mode: false`, set and verified through the
> zone `bot_management` endpoint — as a side effect of fixing the CSP violation
> (`docs/SESSION-2026-08-06.md` §11 and CLAUDE.md). Nobody re-tested the cutover
> afterwards, so "needs Cloudflare Pro (~$20/mo)" is a **conclusion drawn under
> conditions that have since changed**, not a re-measured fact.
>
> One residential `curl` to `cms.wear-run.help/api/health` returned `{"ok":true}`
> on 2026-08-07. **That is not evidence and must not be treated as any** — this
> very section says so, and the 2026-07-22 rollback happened *after* residential
> curl, a browser fetch and one runner check all passed.
>
> **How to actually test it**, before touching `VITE_API_BASE_URL`:
> sample from the runner pool, repeatedly, because the failure was
> *intermittent*. A temporary `workflow_dispatch` job looping ~30 requests and
> counting non-200s is enough. `uptime.yml` accepts a `target` override for
> exactly this kind of probe, but note it only samples **once** per run:
>
> ```bash
> gh workflow run uptime.yml -f target=https://cms.wear-run.help/api/health
> ```
>
> If the 403s are genuinely gone, the cutover is a repo-variable change plus
> step 4 below — and it retires a customer-facing dependency on a `workers.dev`
> URL containing a personal account handle. If even one sample 403s, stop: the
> Pro-plan conclusion stands and this note should be dated and closed.

**Where we are now.** The viewer calls the CMS API via the worker's
`run-apparel-viewer-cms.<account>.workers.dev` URL (the `VITE_API_BASE_URL` repo
variable), because the `wear-run.help` zone's **Bot Fight Mode** (protecting the
separate live commercial site) challenges automated requests to
`cms.wear-run.help` and — unlike Super Bot Fight Mode — it cannot be exempted
per-hostname. Media is served from `media.wear-run.help` (done). Visitors only
ever see `viewer.wear-run.help`; the workers.dev URL is internal.

**Target end state.** API served from `cms.wear-run.help` (Bot Fight Mode
resolved via Pro/Super Bot Fight Mode), media served direct from R2 at
`media.wear-run.help` (done), and the workers.dev URL retired.

Do this as one coordinated cutover — **in this order**, so live media/API never
break mid-flight (each config flip is a one-liner already commented in
`apps/cms/wrangler.jsonc`):

1. **Resolve Bot Fight Mode for the API host.** In the zone → *Security → Bots*,
   turn on **Super Bot Fight Mode**, then *Security → WAF → Custom rules* add a
   **Skip** rule (skip Super Bot Fight Mode) for
   `http.host eq "cms.wear-run.help"`. Verify a plain `curl -fsS
   https://cms.wear-run.help/api/health` returns `{"ok":true}` with no challenge.
2. ✅ **Connect the media domain — DONE (2026-07-22).** R2 →
   `run-apparel-viewer-media` → custom domain `media.wear-run.help` (Active),
   Cache Rule `viewer-media-30d-edge-cache` (Edge TTL 30 days, ignore origin
   cache-control), bucket CORS policy for the viewer origins.
3. **Point the viewer at the custom domain:**
   `gh variable set VITE_API_BASE_URL --body https://cms.wear-run.help`.
4. **Flip the two worker config values** in `apps/cms/wrangler.jsonc`:
   `PUBLIC_MEDIA_BASE_URL` → `"https://media.wear-run.help"`, and once step 3 is
   live, `workers_dev` → `false`. Commit + deploy (the next push/merge).
   ✅ **Both done — media 2026-08-xx, `workers_dev` 2026-08-31.** The invariant is
   now enforced by `apps/cms/src/workerConfigs.test.ts`, which asserts that **no**
   Worker sets `workers_dev: true` and carries a negative control proving the
   detector fires. The older version of that test pinned `apps/cms` as an approved
   exception and told you to delete it on cutover; it was inverted instead, because
   deleting it would also delete the guard against the next Worker turning it on.
5. **KEEP the "Exempt CMS API subdomain from bot challenges" custom rule** —
   this supersedes older advice to remove it. It is load-bearing (skips managed
   rules / Browser Integrity Check / Security Level for the cms host, and
   deliberately does *not* skip rate-limiting rules, so the merged
   login-rate-limit keeps firing). With Super Bot Fight Mode on, its "All Super
   Bot Fight Mode Rules" checkbox becomes the step-1 exemption — one rule doing
   both jobs.
6. **Verify:** the CSP already allows `*.wear-run.help`, so no viewer change is
   needed. Check `curl` on the API + a `media.wear-run.help/...` URL (long
   `cache-control`), then load `viewer.wear-run.help/rxps/wine`; run the QA
   checklist. Roll back by reverting step 4 and re-pointing `VITE_API_BASE_URL`
   at the workers.dev URL if anything regresses.

The admin panel is reachable at `cms.wear-run.help/admin` throughout (a real
browser solves any challenge automatically).

## Viewer: Pages → Worker cutover

The viewer can deploy either to a **Worker with Static Assets**
(`apps/viewer/wrangler.jsonc`, Cloudflare's 2026 recommended static platform —
**the current target**, `VIEWER_DEPLOY_TARGET=worker`) or to Cloudflare **Pages**
(kept only as the rollback path documented at the end of this section).

> **Status: ✅ CUT OVER COMPLETE (2026-07-22).** The Worker
> **`run-apparel-viewer-site`** serves `viewer.wear-run.help` (custom domain
> attached in the dashboard; `VIEWER_DEPLOY_TARGET=worker`). The old
> `run-apparel-viewer` Pages project has been **deleted**, and the worker's
> `workers_dev`/`preview_urls` are disabled — the custom domain is the only
> public surface. `run-apparel-viewer.pages.dev` was also removed from
> `VIEWER_ALLOWED_ORIGINS` (CMS CORS) and from the R2 bucket CORS policy scope.

How it works / notes learned during the cutover:

- SPA fallback comes from `not_found_handling: "single-page-application"` in
  `apps/viewer/wrangler.jsonc`; the Pages-style `dist/_redirects`
  (`/* /index.html 200`) is **rejected** by Workers Static Assets as an
  infinite-loop rule (code 100324), so the CI worker-deploy step deletes it
  before `wrangler deploy`. `dist/_headers` (CSP + immutable caching) is
  honoured natively.
- A Worker custom domain refuses a hostname that already has DNS records
  ("externally managed DNS records"): the old proxied CNAME
  `viewer → run-apparel-viewer.pages.dev` had to be **deleted in DNS → Records
  first**, then the domain added to the worker (brief downtime between the two
  steps; the worker then manages its own record).
- Immediately after deploy/domain changes, expect a few minutes of DNS/route
  propagation (transient 404s or stale resolution) before judging health.

**Rollback to Pages** (the CI Pages steps are kept for exactly this):

1. `gh variable set VIEWER_DEPLOY_TARGET --body pages` and run
   `gh workflow run ci.yml --ref main` — the deploy job **recreates** the Pages
   project (`run-apparel-viewer`) and deploys the viewer to it.
2. Dashboard: remove `viewer.wear-run.help` from the worker, then add it as a
   custom domain on the recreated Pages project.
3. Re-add `https://run-apparel-viewer.pages.dev` to `VIEWER_ALLOWED_ORIGINS`
   in `apps/cms/wrangler.jsonc` if the pages.dev URL is used directly.

⚠️ **The Pages rollback path now loses the link previews.** Since 2026-08-08 the
viewer worker has a script (`apps/viewer/worker/index.ts`) that rewrites the
preview tags per garment. Pages deploys `dist/` only, so on Pages every link
reverts to the single generic card in `index.html`. That is a cosmetic
regression, not a broken site — but do not be surprised by it, and note the CI
link-preview smoke test is skipped when `VIEWER_DEPLOY_TARGET=pages`.

## Link previews — what a shared link looks like

Paste `https://viewer.wear-run.help/rxps/wine` into WhatsApp, email or LinkedIn
and the recipient sees a card: the garment's own picture, "N001 Velocity
Performance Skinsuit — Wine", and its fabric and fit. Every colourway gets its
own card.

**How it works, in one line:** link crawlers do not run JavaScript, so the viewer
worker rewrites the `<head>` for them before the page is sent.

### Adding a garment — the one command

After a new garment's posters have been rendered to `output/posters/`:

```bash
pnpm og:cards n002
```

It converts `output/posters/n002-*-poster.webp` into
`apps/viewer/public/og/n002/<colour>.jpg` and updates
`apps/viewer/worker/og-cards.ts`. **Commit both.** The product slug must match
the CMS slug exactly — that is the key the worker looks the card up by, and a
mismatch shows up as "the preview is right but the picture is the poster".

**If you skip this step nothing breaks.** The worker falls back to the
colourway's own poster from the CMS, so the card still shows the right garment in
the right colour — just as a WebP, which LinkedIn and iMessage do not render.
Slack, X, Facebook, Discord and Telegram do. So: skipping it costs you the two
channels you are most likely to send a link on.

### Checking it

One garment:

```bash
node scripts/smoke-viewer-preview.mjs https://viewer.wear-run.help rxps wine
```

All of them — this is what CI runs after every deploy, since 2026-09-04:

```bash
node scripts/smoke-live-previews.mjs https://viewer.wear-run.help
```

Either asserts the card names the garment, that `og:url`/`canonical` are
per-colourway, that the picture really fetches, **and** — the negative control —
that a plain browser request is *not* rewritten.

⚠️ **Until 2026-09-04 CI ran only the first form**, which reads `DEFAULT_PRODUCT`
and so checked exactly one garment out of eleven. Nine products were published
that day with 45 preview cards between them; they were verified by hand once and
by nothing after. The runner costs 9.5 s for all eleven, measured — a preview card
is 38 KB and the crawler path is 0.68 s cold, 0.03 s warm.

A **403 or 429 exits 0 as inconclusive**, deliberately: it asks for a page with a
crawler user-agent from a datacenter IP, which is the most challengeable request
shape there is, and a bot rule must never read as "the previews are broken".

⚠️ **It retries, and the reason is worth knowing.** `wrangler deploy` returns when
Cloudflare has accepted the upload, not when every colo is serving the new
version. The very first CI run of this check ran about a second after the deploy
step, read the *previous* version, and reported all five assertions failing in
convincing detail — while the same URL checked by hand minutes later passed every
one. Six attempts, ten seconds apart. If you add another post-deploy check
against the viewer, give it the same treatment.

### Why only crawlers get the rewrite

Measured 2026-08-08, warm connection, five requests each:

| Request | Time to first byte |
|---|---|
| `viewer.wear-run.help/n001/wine` (static HTML) — measured pre-rename; the path is `rxps` now | 0.106 – 0.155 s |
| `cms /api/health` | 0.428 – 0.657 s |
| `cms /api/public/viewer/n001/wine` — measured pre-rename; the path is `rxps` now | **1.77 – 2.27 s** |

The payload endpoint costs about 1.9 s and is not edge-cached on either host
(`cf-cache-status` came back empty on `cms.wear-run.help` and on the workers.dev
URL alike — a Worker's own response does not pass through the edge cache, so its
`s-maxage=60` buys nothing). Serving that to visitors would turn a QR scan from
~0.11 s into ~2 s. A crawler is fetching precisely because it wants the head, and
allows around 10 s, so it waits and the visitor does not.

⚠️ **That ~1.9 s is a real cost the viewer already pays today**, on the browser's
own fetch of the same endpoint — it is why the loading state is visible on a QR
scan. Unrelated to previews; recorded here because this is where it was measured.

### Two things that will bite whoever changes this

- **An HTMLRewriter selector that matches nothing is a silent no-op.** Delete a
  `<meta>` from `apps/viewer/index.html` and the worker keeps returning 200 while
  quietly ceasing to set that value on every link. `worker/preview.test.ts`
  asserts every rewritten tag still exists in that file — keep it in step.
- **Asset requests never reach the worker**, so `/assets/*` keeps its
  zero-overhead path. Verified by logging every entry to the handler:
  `/assets/index-*.js`, `/og/n001/wine.jpg` and `/` produced no log line;
  `/n001/lime` produced one. Setting `run_worker_first` would undo that.
  (Both `n001` paths are pre-rename; the cards moved to `/og/rxps/…` on
  2026-08-21. The finding is unchanged — only the example URLs are historical.)
- **…and what its absence costs, which this list omitted until 2026-09-07.** A
  request carrying `sec-fetch-mode: navigate` is answered by the asset router, so
  the worker never runs and the per-garment rewrite silently does not happen.
  Measured against the live viewer, same URL and crawler user-agent, one header
  apart: **12,491 bytes with a per-garment `<title>` and 1 JSON-LD block**
  without the header, **11,204 bytes with the generic title and 0 JSON-LD** with
  it. `run_worker_first` is the documented fix and a real trade — it also puts
  the worker in front of every asset request. Both sides are in
  the 2026-09-05 product-page audit (kept privately); the same audit establishes Google had
  never crawled these pages, so the impact so far is nil. Do not read the bullet
  above as an argument on its own.

## Login protection

The admin login locks an account for 10 minutes after 5 failed attempts
(`maxLoginAttempts`/`lockTime` on the Users collection). A Cloudflare rate-limit
rule on `cms.wear-run.help/api/users/login` adds an IP-level edge layer — see
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md) §3 for the exact rule.

## Admin accounts & roles

Two roles by design (enforced in `apps/cms/src/access/roles.ts`):

| Role | Value | Can do |
|---|---|---|
| **Admin / Director** | `admin` | Everything: products, colourways, media, **users**, **site settings** |
| **Editor** | `editor` | Products, colourways, media only — never users, roles or settings |

"Director" is the admin role's label, not a separate tier. Editors can read only
their own user record (needed for their session); only admins create/modify users
or change roles.

**Verify / rotate the `admin@wear-run.help` account** (do this on go-live and
periodically):

1. Log in at `https://cms.wear-run.help/admin` → *Users*. Confirm exactly the
   intended people exist and that `admin@wear-run.help` has role **Admin /
   Director**. Delete or downgrade any stray accounts.
2. Rotate its password from the user's *Account* screen (or *Users → edit*). This
   is independent of `PAYLOAD_SECRET` — rotating the secret logs everyone out and
   switches off every API key, but does not change passwords (see "Rotating
   PAYLOAD_SECRET").
3. The production database must **never** contain the local dev seed admin. The
   seed only creates it when `SEED_DEV_ADMIN=1` (local `seed` script) and never
   in production (`apps/cms/src/seed/seed.ts` guards this); confirm no
   known-password dev admin exists in prod.

## Viewer security headers (CSP)

The viewer ships a Content-Security-Policy plus `X-Content-Type-Options: nosniff`
and `Referrer-Policy` via `dist/_headers`, honoured by Cloudflare Pages and
Workers Static Assets. `_headers` is **generated** by
`apps/viewer/scripts/gen-headers.mjs` at build time — do not hand-edit
`dist/_headers`. The generator:

- hashes the inline theme `<script>` so `script-src` needs no `'unsafe-inline'`;
- bakes the API origin in from `VITE_API_BASE_URL`, and allows `*.wear-run.help`
  (media);
- allows `blob:` in `connect-src` and `worker-src` — the Meshopt decoder builds
  its worker's source as a Blob, and every production GLB is Meshopt-compressed.

**No third-party origin is allowed for decoders.** `www.gstatic.com` used to be
in `connect-src` for model-viewer's built-in Draco and KTX2 locations;
`apps/viewer/scripts/copy-decoders.mjs` now self-hosts all three and `Stage.tsx`
points at the local copies, so it was removed. Adding a codec means adding its
decoder to that script, not re-opening the CSP.

To change what the viewer may load, edit the generator (not the output) and
re-run the build; the webgl e2e spec fails on any CSP violation, so a missing
directive is caught in CI. If a subresource ever breaks in production, widen the
relevant directive there. The CSP is validated against the real 3D-model load in
`apps/viewer/e2e/webgl.spec.ts`.

## The home-directory git footgun (developer note)

`~` (the home directory) is itself a git repo on the original author's machine.
This project has its **own** `.git`, so commands run from inside it are safe —
but never run `git` from `~` or a parent directory, and never `git add -A` there.

## Proving which CLAUDE.md files actually loaded

Added 2026-08-19. The root `CLAUDE.md` states three things about its own loading —
the root file loads at session start and is re-injected after `/compact`, a nested
`CLAUDE.md` loads only when Claude reads a file in its directory, and a trap moved
out of the root can therefore be missing from a compacted session until something
touches that directory. That third one is the price the 2026-08-19 pipeline split
paid, so it is worth being able to check rather than believe.

`.claude/hooks/log-instructions-loaded.mjs` records every load. It is wired to the
`InstructionsLoaded` event in `.claude/settings.json` and writes a tab-separated line
per load to `.claude/instructions-loaded.log` (gitignored — it is a per-machine
measurement, not shared state):

```bash
cat .claude/instructions-loaded.log
```

Each line is `timestamp · load_reason · path · size`. The `load_reason` is the
useful column, and it distinguishes exactly the cases the claims are about:

| `load_reason`      | What it means                                              |
| ------------------ | ---------------------------------------------------------- |
| `session_start`    | loaded at launch — the root file, and user-scope files      |
| `nested_traversal` | a subdirectory `CLAUDE.md`, loaded because a file was read  |
| `path_glob_match`  | a `.claude/rules/` file whose `paths:` glob matched         |
| `include`          | pulled in by an `@path` import                              |
| `compact`          | re-injected after `/compact`                                |

**What to look for.** After a session that has compacted, every path appearing with
`compact` is what actually survived. If a nested file shows up there, this repo's
compaction paragraph in `CLAUDE.md` is wrong and should be corrected — that is the
reason to log it rather than to re-read the docs. If `tools/asset-pipeline/CLAUDE.md`
appears only with `nested_traversal` and never with `compact`, the paragraph is right
and the one-line hooks left in the root file are doing the work they were left to do.

The hook never blocks and never fails a session: the `InstructionsLoaded` exit code is
ignored by design, so it exits 0 on every path, including malformed input. Its cases
are in `.claude/hooks/log-instructions-loaded.test.mjs`, run directly — `.claude/` is
not a workspace package, so `pnpm test` never sees it:

```bash
node .claude/hooks/log-instructions-loaded.test.mjs
```

To stop logging, delete the `InstructionsLoaded` block from `.claude/settings.json`.
