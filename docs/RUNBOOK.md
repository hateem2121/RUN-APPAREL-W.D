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
