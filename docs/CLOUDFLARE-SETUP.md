# Cloudflare Setup — Manual Steps

Everything in this file happens in the Cloudflare dashboard or with `wrangler` —
it cannot be automated from the repository. All of it fits inside the **$5/month
Workers Paid plan** (D1 and R2 usage at this scale sit in the free allowances).
Work top-to-bottom; later steps depend on earlier ones.

> ## ⚠️ Isolation from the existing live site — read first
>
> This Cloudflare account **already runs a separate, live RUN APPAREL platform**:
> Worker **`run-apparel`**, D1 database **`run-apparel-db`** (real products,
> buyers, RFQs, inquiries), and R2 buckets **`run-assets`** / **`run-private`**.
> **The viewer must never touch any of those.** Deploying over the `run-apparel`
> worker or migrating against `run-apparel-db` would corrupt production data.
>
> The viewer uses its own **isolated** resources, and the data-plane ones already
> exist (created via the Cloudflare connector):
>
> | Resource | Name | ID / note |
> |---|---|---|
> | D1 (viewer) | `run-apparel-viewer-db` | `41e20361-1a5f-4c87-b5ca-781c57c9b3f4` — **schema already applied** |
> | R2 (viewer media) | `run-apparel-viewer-media` | created, empty |
> | Worker (viewer CMS) | `run-apparel-viewer-cms` | **not yet deployed** (never name it `run-apparel`) |
>
> `apps/cms/wrangler.jsonc` is already wired to the two resources above, so
> **steps 1, 2 and 4 below are already done** — they remain documented for
> reference and disaster recovery. Start at **step 3**.

## 0. Prerequisites

- A Cloudflare account with the `wear-run.help` zone added.
- `wrangler` logged in: `npx wrangler login` (run inside `apps/cms`).

## 1. D1 database (CMS data) — ✅ already created

```bash
# Already done (via the Cloudflare connector): run-apparel-viewer-db
# id 41e20361-1a5f-4c87-b5ca-781c57c9b3f4, already wired into wrangler.jsonc.
# To recreate from scratch you would run:
#   npx wrangler d1 create run-apparel-viewer-db
# then paste the printed database_id into apps/cms/wrangler.jsonc.
```

## 2. R2 bucket (models, posters, media) — ✅ already created

```bash
# Already done (via the Cloudflare connector): run-apparel-viewer-media
# To recreate:  npx wrangler r2 bucket create run-apparel-viewer-media
```

**Public media access (recommended):** dashboard → R2 → `run-apparel-viewer-media`
→ *Settings → Public access* → connect a custom domain `media.wear-run.help`. Add
a **Cache Rule** for `http.host eq "media.wear-run.help"` with a long Edge TTL
(e.g. 30 days) so media is cached hard at the edge. Then set `PUBLIC_MEDIA_BASE_URL`
in `wrangler.jsonc` vars to `https://media.wear-run.help` and redeploy. If you skip
this, leave the var empty — media then streams through the CMS worker (works, but
misses R2's long-lived edge caching). This is step 2 of the coordinated cutover in
`docs/RUNBOOK.md` → "API + media domain cutover".

## 3. CMS worker secrets & vars

```bash
npx wrangler secret put PAYLOAD_SECRET     # paste a long random string (openssl rand -hex 32)
```

Review `wrangler.jsonc` vars: `CMS_PUBLIC_URL`, `PUBLIC_MEDIA_BASE_URL`,
`VIEWER_ALLOWED_ORIGINS`, `VIEWER_API_CACHE_SECONDS`.

**Edge rate-limit on the admin login (recommended).** Dashboard → the
`wear-run.help` zone → *Security → WAF → Rate limiting rules* → *Create rule*:

| Field | Value |
|---|---|
| Name | `cms-admin-login` |
| If incoming requests match | `(http.host eq "cms.wear-run.help" and http.request.uri.path eq "/api/users/login" and http.request.method eq "POST")` |
| Rate | 10 requests per 10 minutes |
| Counting characteristic | IP |
| Action | Block (or Managed Challenge) for 10 minutes |

This layers on top of the built-in Payload login lockout (5 attempts → 10-min
account lock) with an IP-level edge limit, so an attacker can't cycle accounts.
The free plan includes **one** rate-limiting rule, so spend it here (the login).

**Consider a public-API limit too** (needs a 2nd rule → a paid WAF tier): a
looser limit such as `http.request.uri.path contains "/api/public/"` at, say,
300 req / min / IP → Managed Challenge. Not required — the public API is cached
at the edge (`s-maxage`) and exposes only published data — but it caps abuse.

## 4. Database schema — ✅ already applied

The initial Payload migration (`apps/cms/src/migrations/20260720_185735_initial`)
has **already been applied** to `run-apparel-viewer-db`, and the
`payload_migrations` table records it — so the first deploy sees the schema as
current and does nothing. The tables are empty (0 products), ready for content.

For reference, the schema is produced/managed by:

```bash
npx payload migrate:create initial     # (already generated & committed)
pnpm --filter @run-apparel/cms migrate # applies pending migrations to the wired D1
```

Run `pnpm --filter @run-apparel/cms migrate` again only after you add new
migrations (i.e. after changing collections and running `migrate:create`).

## 5. Deploy the CMS worker

```bash
pnpm --filter @run-apparel/cms run deploy    # canonical command (= opennextjs-cloudflare build && deploy)
```

This deploys the Worker named **`run-apparel-viewer-cms`** (from `wrangler.jsonc`).
**Do not rename it to `run-apparel`** — that is the separate live site. Migrations
are **not** applied on cold start; apply any pending ones to the remote D1 first
with `pnpm --filter @run-apparel/cms migrate:remote` (CI does this automatically in
the `deploy` job, before the Worker ships — see `docs/RUNBOOK.md` → Database
migrations). Confirm it is healthy:

```bash
curl -f https://cms.wear-run.help/api/health     # → {"ok":true}
```

Then dashboard → Workers & Pages → `run-apparel-viewer-cms` → *Settings* →
*Domains & Routes* → **Add custom domain** → `cms.wear-run.help`.

Visit `https://cms.wear-run.help/admin` — the first-user screen appears; **create
your own Admin / Director account** (your email + your password). Do **not** run
the local dev seed against production — it creates a known-password dev admin for
local use only. Real products: upload pipeline-processed GLB/poster assets via the
admin panel.

## 6. Viewer on Cloudflare Pages

Dashboard → Workers & Pages → **Create → Pages → Connect to Git** → select this repo.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @run-apparel/viewer build` |
| Build output directory | `apps/viewer/dist` |
| Environment variable | `VITE_API_BASE_URL=https://cms.wear-run.help` |
| Environment variable (optional) | `VITE_CF_BEACON_TOKEN=<from step 8>` |

The committed `apps/viewer/public/_redirects` (`/* /index.html 200`) makes direct
deep links like `/n001/navy` resolve on Pages; `_headers` sets immutable caching
for hashed assets.

### Custom domain

Pages project → *Custom domains* → **Set up a custom domain** → `viewer.wear-run.help`.
Cloudflare creates the DNS record automatically because the zone is on the same account.

## 7. CORS check

`VIEWER_ALLOWED_ORIGINS` in `wrangler.jsonc` must include `https://viewer.wear-run.help`
(and `http://localhost:5173` for local development). Redeploy the worker after changes.

## 8. Cloudflare Web Analytics (only analytics allowed)

Dashboard → Analytics & Logs → **Web Analytics** → *Add a site* → `viewer.wear-run.help`
→ copy the **beacon token** → set it as `VITE_CF_BEACON_TOKEN` in the Pages build env
(and optionally in CMS Site Settings for reference). No cookies, no third-party trackers.

## 9. Smoke test

1. `https://cms.wear-run.help/admin` — log in, confirm collections exist.
2. `https://cms.wear-run.help/api/health` — `{"ok":true}`.
3. `https://cms.wear-run.help/api/public/viewer/n001/navy` — JSON with product data.
4. `https://viewer.wear-run.help/n001/navy` — poster appears instantly, model loads, tabs work.
5. Run through `docs/QA-CHECKLIST.md`.

## 10. GitHub Actions auto-deploy (makes `git push` deploy)

So every push to `main` deploys automatically (after tests pass):

1. Cloudflare dashboard → *My Profile → API Tokens → Create Token* → grant
   **Workers Scripts: Edit**, **Cloudflare Pages: Edit**, **D1: Edit**,
   **Workers R2 Storage: Edit** on this account. Copy the token.
2. Store it and the account id as repo secrets, and enable deploys:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --body "<token>"
   gh secret set CLOUDFLARE_ACCOUNT_ID --body "<account-id>"
   # Same value as the worker's PAYLOAD_SECRET — the deploy job's pre-deploy
   # migration step and the "Apply worker secret" step both read it:
   gh secret set PAYLOAD_SECRET --body "<same long random string as the worker secret>"
   gh variable set DEPLOY_ENABLED --body true      # turns on the deploy/backup/uptime jobs
   ```

3. (Optional) `gh variable set VITE_CF_BEACON_TOKEN --body "<beacon>"` from step 8.

Until `DEPLOY_ENABLED` is `true`, CI only runs tests — it never deploys. See
[RUNBOOK.md](RUNBOOK.md) for the deploy/migration/uptime playbooks.

## Summary — what's done vs. what remains

Already completed via the Cloudflare connector (data plane, isolated resources):

| ✅ | Action | Result |
|---|---|---|
| 1 | Create isolated D1 `run-apparel-viewer-db` | id `41e20361-1a5f-4c87-b5ca-781c57c9b3f4`, wired into wrangler.jsonc |
| 2 | Create isolated R2 `run-apparel-viewer-media` | empty bucket, wired into wrangler.jsonc |
| 4 | Apply initial schema to the new D1 | 14 tables + `payload_migrations` recorded |

Remaining (need an authenticated `wrangler` / API token, or the dashboard — the
connector cannot deploy Workers/Pages, upload R2 objects, set secrets, attach
domains, or create Web Analytics sites):

| ⬜ | Action | Where |
|---|---|---|
| 3 | Set `PAYLOAD_SECRET` on `run-apparel-viewer-cms` | wrangler |
| 5 | Deploy worker `run-apparel-viewer-cms` + add `cms.wear-run.help` | wrangler + dashboard |
| 5b | (optional) R2 public domain `media.wear-run.help` + set `PUBLIC_MEDIA_BASE_URL` | dashboard |
| 6 | Create Pages project + build settings + `viewer.wear-run.help` | dashboard |
| 7 | Confirm CORS origins | wrangler.jsonc |
| 8 | Create Web Analytics site, set beacon token | dashboard |
| 9 | First admin user (or `pnpm --filter @run-apparel/cms seed`, then change password) | /admin |

**Never touch** the existing `run-apparel` worker, `run-apparel-db`, `run-assets`,
or `run-private` — those belong to the separate live site.

## Live endpoints (once deployed)

The isolated viewer stack deploys via GitHub Actions on push to `main` once
step 10 is done (or via the manual commands above). Endpoints:

| Piece | URL |
|---|---|
| CMS worker (`run-apparel-viewer-cms`) | `https://cms.wear-run.help` (custom domain) |
| CMS admin | `https://cms.wear-run.help/admin` |
| CMS health | `https://cms.wear-run.help/api/health` |
| Public viewer API | `https://cms.wear-run.help/api/public/viewer/n001/navy` |
| Viewer (Pages `run-apparel-viewer`) | `https://viewer.wear-run.help` (custom domain) / `https://run-apparel-viewer.pages.dev` |

Notes for future maintenance:

- **CMS custom domain** is declared in `apps/cms/wrangler.jsonc` (`routes` →
  `cms.wear-run.help`, `custom_domain: true`); `wrangler deploy` manages the DNS
  record. **Viewer custom domain** `viewer.wear-run.help` is attached to the
  Pages project (Cloudflare auto-creates the CNAME).
- **`PAYLOAD_SECRET`** is set as a worker secret (`wrangler secret put`).
- **Seeding production D1 + R2 from the CLI:** the `seed`/`migrate` scripts use
  wrangler's local platform proxy. To target the *remote* (production) D1/R2,
  temporarily add `"remote": true` to the `d1_databases` and `r2_buckets`
  bindings in `wrangler.jsonc`, then run
  `PAYLOAD_LOCAL_D1=1 PAYLOAD_SECRET=… SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… pnpm --filter @run-apparel/cms exec payload run src/seed/run.ts`
  (`getPlatformProxy` proxies the marked bindings to the live resources). Revert
  the `"remote"` flags afterwards. N001 (“Velocity Performance Tee”, 3
  colourways) is seeded and its GLB/posters live in `run-apparel-viewer-media`.
- **Web Analytics:** the viewer build bakes in the `wear-run.help` zone Web
  Analytics beacon token via `VITE_CF_BEACON_TOKEN` (SPA route changes tracked).
  Creating a *dedicated* viewer-only Web Analytics site needs an API token with
  Account Analytics **edit** permission (or the dashboard); swap
  `VITE_CF_BEACON_TOKEN` and rebuild if you create one.
