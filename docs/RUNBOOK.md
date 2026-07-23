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

- **Secret scanning** — gitleaks (`.github/workflows/security.yml`, config
  `.gitleaks.toml`). A hit fails the run. Real secrets never belong in git; use
  `wrangler secret put` / GitHub secrets. Add proven false positives to the
  allowlist in `.gitleaks.toml`.
- **Dependency vulnerabilities** — `audit-ci` (config `audit-ci.jsonc`) fails on
  **high/critical** advisories and **gates the deploy** (the `deploy` job needs
  it). To clear one: bump the dependency, add a `pnpm.overrides` pin for a fixed
  transitive version (how the `tmp` advisory was resolved), or — only if
  unfixable and not exploitable here — add the `GHSA-…` id to `allowlist` in
  `audit-ci.jsonc` with a dated reason.
- **Performance budget** — Lighthouse CI (`lighthouserc.json`) against the viewer
  served with the e2e mock. Deterministic byte-weight budgets fail on a real
  regression; category scores are non-blocking warnings. This job is
  informational (it does **not** gate the deploy, so a Chrome flake never blocks a
  release) — make it a required check via branch protection to enforce it.
- **Accessibility** — an axe-core check in the Playwright suite
  (`apps/viewer/e2e/a11y.spec.ts`). It fails on serious/critical **structural**
  violations; colour-contrast is reported as advisory only (a deliberate
  palette-design decision — see the test's header comment).

**Dependency updates**: Dependabot runs in **quiet mode** — routine version-bump
PRs are off (`open-pull-requests-limit: 0` in `.github/dependabot.yml`) to keep the
branch list clean for a solo maintainer, but it still opens a PR automatically for
a real **security** advisory. Day-to-day, `audit-ci` blocks high/critical
vulnerabilities on every change. To resume routine updates, raise the limits in
`.github/dependabot.yml` (grouping/ignore rules are kept ready); the same CI gates
run on any Dependabot PR before merge.

## Rotating PAYLOAD_SECRET

Rotating logs everyone out of `/admin` (sessions are signed with it). Passwords
are unaffected.

```bash
openssl rand -hex 32 | pnpm --filter @run-apparel/cms exec wrangler secret put PAYLOAD_SECRET
# redeploy so the running worker picks it up:
pnpm --filter @run-apparel/cms run deploy
```

## Analytics & events

Viewer telemetry (analytics, diagnostics, client errors) lands in the **Events**
collection in `/admin` (System group). No IP or personal data is stored. The
nightly workflow prunes rows older than 180 days on the 1st of each month; to
prune on demand run `nightly-backup.yml` via *workflow_dispatch*.

Aggregate page views (if enabled) are in Cloudflare **Web Analytics**.

## Error tracking

Server-side worker errors are in **Workers Logs** (Observability is enabled in
`wrangler.jsonc`; `wrangler tail` for live). Client-side errors have two layers:
the first-party diagnostics that land in **Events** (above), and optional
**Sentry** (free tier) for aggregated client stack traces. Sentry is off by
default — set the `VITE_SENTRY_DSN` build variable (Pages/Worker build env) to a
project DSN to enable it; when unset the SDK is dead-code-eliminated from the
bundle (zero cost). The CSP auto-allows the DSN's ingest origin at build time.

## Uptime alerts

`.github/workflows/uptime.yml` pings `/api/health` and the viewer every ~15 min
(GitHub cron is best-effort and can drift several minutes — this is monitoring,
not a hard SLA). On failure it opens a single deduplicated GitHub issue labelled
`outage`.

**When an `outage` issue appears:**

1. `curl -i https://cms.wear-run.help/api/health` — 200 `{"ok":true}` = recovered.
2. If down: Cloudflare dashboard → Workers & Pages → `run-apparel-viewer-cms` →
   Logs (Workers Observability is enabled), and `wrangler tail` for live logs.
3. Check the latest CI deploy didn't fail a migration (see above).
4. Once healthy, **close the `outage` issue** (a new one won't open while it's open).

To prove the alert path works: run `uptime.yml` via *workflow_dispatch* with a
bogus `target` URL — it should open an `outage` issue.

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

**The pipeline recipe for a raw CLO file** (the mesh, not the textures, is the cost
— a real export was 9.8 M triangles / 1 MB of textures):

```bash
pnpm pipeline optimize "raw.glb" --out out.glb --simplify 0.05 --meshopt
pnpm pipeline validate out.glb          # expect 0 translucent, < 40 MB, no CLO generator
```

`--simplify 0.05` (keep ~5 % of triangles) took one 364 MB export to 14 MB with no
visible quality loss. Lower the ratio to approach the 8 MB mobile guideline.

**Deferred (owner request):** remove/raise the 40 MB cap and add an upload
progress %/status in the admin. Both hinge on switching media uploads to
`clientUploads: true` (direct browser→R2) so the Worker body/memory limits and the
opaque "just loading" spinner stop applying. Not yet actioned.

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
> - **API:** ❌ still on `workers.dev`. A cutover attempt to `cms.wear-run.help`
>   was **rolled back**: free **Bot Fight Mode** *intermittently* returns HTTP
>   **403** to datacenter/automated requests on `cms.wear-run.help` (caught by
>   the post-deploy health check; ~low frequency but real). Residential browsers
>   usually pass, so casual `curl` tests give false confidence — do NOT trust a
>   handful of green curls. The `workers.dev` zone has no Bot Fight Mode and is
>   reliable. The existing "Exempt CMS API" WAF **Skip** rule cannot exempt the
>   *free* Bot Fight Mode (only Super Bot Fight Mode is per-host exemptible), so
>   it does NOT fully solve this — and it is therefore **load-bearing, not a
>   redundant leftover; do not delete it.**
> - **To finish the API half you need the Cloudflare Pro plan (~$20/mo):** enable
>   **Super Bot Fight Mode** + a WAF Skip rule for `http.host eq
>   "cms.wear-run.help"`, then repeat the repoint below and confirm the CI
>   health check stays green across several deploys before retiring workers.dev.

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
5. **KEEP the "Exempt CMS API subdomain from bot challenges" custom rule** —
   this supersedes older advice to remove it. It is load-bearing (skips managed
   rules / Browser Integrity Check / Security Level for the cms host, and
   deliberately does *not* skip rate-limiting rules, so the merged
   login-rate-limit keeps firing). With Super Bot Fight Mode on, its "All Super
   Bot Fight Mode Rules" checkbox becomes the step-1 exemption — one rule doing
   both jobs.
6. **Verify:** the CSP already allows `*.wear-run.help`, so no viewer change is
   needed. Check `curl` on the API + a `media.wear-run.help/...` URL (long
   `cache-control`), then load `viewer.wear-run.help/n001/navy`; run the QA
   checklist. Roll back by reverting step 4 and re-pointing `VITE_API_BASE_URL`
   at the workers.dev URL if anything regresses.

The admin panel is reachable at `cms.wear-run.help/admin` throughout (a real
browser solves any challenge automatically).

## Viewer: Pages → Worker cutover

The viewer can deploy either to Cloudflare **Pages** (current default) or to a
**Worker with Static Assets** (`apps/viewer/wrangler.jsonc`, Cloudflare's 2026
recommended static platform).

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
   is independent of `PAYLOAD_SECRET` — rotating the secret logs everyone out but
   does not change passwords (see "Rotating PAYLOAD_SECRET").
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
  (media) and `www.gstatic.com` (model-viewer's Draco/KTX2 decoders).

To change what the viewer may load, edit the generator (not the output) and
re-run the build; the webgl e2e spec fails on any CSP violation, so a missing
directive is caught in CI. If a subresource ever breaks in production, widen the
relevant directive there. The CSP is validated against the real 3D-model load in
`apps/viewer/e2e/webgl.spec.ts`.

## The home-directory git footgun (developer note)

`~` (the home directory) is itself a git repo on the original author's machine.
This project has its **own** `.git`, so commands run from inside it are safe —
but never run `git` from `~` or a parent directory, and never `git add -A` there.
