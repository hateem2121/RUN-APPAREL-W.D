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

**Public media access — ✅ done (2026-07-22):** custom domain
`media.wear-run.help` is connected to `run-apparel-viewer-media` (Active), with
a **Cache Rule** `viewer-media-30d-edge-cache` (`http.host eq
"media.wear-run.help"` → eligible, Edge TTL 30 days, ignore origin
cache-control) and a **bucket CORS policy** (GET/HEAD from
`https://viewer.wear-run.help` and `http://localhost:5173`).
`PUBLIC_MEDIA_BASE_URL=https://media.wear-run.help` is set in `wrangler.jsonc`.
Fallback if media ever misbehaves: set the var to empty — media then streams
through the CMS worker — and purge the `media.wear-run.help` hostname cache.
⚠️ Never set this var to anything but a full `https://…` URL or empty: a stray
value (it was once `RUN`) breaks every media URL on the live site. History and
verification: `docs/RUNBOOK.md` → "API + media domain cutover".

## 3. CMS worker secrets & vars

```bash
npx wrangler secret put PAYLOAD_SECRET     # paste a long random string (openssl rand -hex 32)
```

Review `wrangler.jsonc` vars: `CMS_PUBLIC_URL`, `PUBLIC_MEDIA_BASE_URL`,
`VIEWER_ALLOWED_ORIGINS`, `VIEWER_API_CACHE_SECONDS`, `EMAIL_FROM_ADDRESS`,
`EMAIL_FROM_NAME`.

**Transactional email (Resend) — ✅ done (2026-07-22).** `wear-run.help` is
verified in Resend (records live on the `send.` subdomain +
`resend._domainkey`; the root Hostinger MX/SPF were untouched, and Resend's
"Enable Receiving" is deliberately **OFF** — inbound mail stays on Hostinger).
`RESEND_API_KEY` is set as a worker secret (sending-only key), and the
end-to-end test passed: `/admin` → *Forgot password* delivered to
`admin@wear-run.help`. To rotate the key: create a new key in Resend, update
the `RESEND_API_KEY` secret (dashboard → worker → Variables and Secrets, or
`npx wrangler secret put RESEND_API_KEY`), then delete the old key. If email
ever stops: check Resend's *Emails* log first, then the domain's Verified
status. Reference for rebuilding from scratch:

1. Create a free account at [resend.com](https://resend.com) and **verify a
   sending domain** (add the DNS records it lists to the `wear-run.help` zone;
   skip Resend's optional DMARC record — the zone already has one).
2. Set `EMAIL_FROM_ADDRESS` in `wrangler.jsonc` vars to an address on that domain
   (e.g. `noreply@wear-run.help`) and `EMAIL_FROM_NAME` to `RUN APPAREL`.
3. Create an API key and store it as a worker secret:
   `npx wrangler secret put RESEND_API_KEY`, then redeploy.
4. Test: `/admin` → *Forgot password* for a real user → confirm the email lands.

**Edge rate-limit on the admin login — ✅ done (2026-07-22).** The free plan
includes exactly **one** rate-limiting rule with fixed values (read them in the
dashboard, not here; longer windows need a paid tier), and the
slot was already used by the zone-wide "Leaked credential check" rule. The two
were therefore **merged** into a single rule, deployed and live-tested
(rejected logins, then 429 once over the limit):

| Field | Value |
|---|---|
| Name | `Leaked credentials + CMS admin login limit` |
| If incoming requests match | Cloudflare's leaked-credential check, OR a POST to the CMS admin login path |
| Rate / characteristic / action | Held privately — see the operator note, not this file |

This layers on top of the built-in Payload login lockout (5 attempts → 10-min
account lock) with an IP-level edge limit, so an attacker can't cycle accounts.
Do not delete the leaked-credential half — it guards the whole zone (including
the separate commercial site). Note the "Exempt CMS API" skip rule deliberately
does **not** skip rate-limiting rules, so this rule still fires on the cms host.

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

## 6. Viewer on Cloudflare Pages — ⛔ superseded (2026-07-22)

> The viewer now deploys as the **`run-apparel-viewer-site` Worker** (Static
> Assets) serving `viewer.wear-run.help`; the `run-apparel-viewer` Pages
> project was **deleted** after the cutover. CI deploys the worker because the
> `VIEWER_DEPLOY_TARGET` repo variable is `worker` — see `docs/RUNBOOK.md` →
> "Viewer: Pages → Worker cutover" (including the rollback that recreates the
> Pages project). The steps below are kept only as a historical reference for
> that rollback.

Dashboard → Workers & Pages → **Create → Pages → Connect to Git** → select this repo.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @run-apparel/viewer build` |
| Build output directory | `apps/viewer/dist` |
| Environment variable | `VITE_API_BASE_URL=https://cms.wear-run.help` |

The committed `apps/viewer/public/_redirects` (`/* /index.html 200`) makes direct
deep links like `/n001/navy` resolve on Pages; `_headers` sets immutable caching
for hashed assets.

### Custom domain

Pages project → *Custom domains* → **Set up a custom domain** → `viewer.wear-run.help`.
Cloudflare creates the DNS record automatically because the zone is on the same account.

## 7. CORS check

`VIEWER_ALLOWED_ORIGINS` in `wrangler.jsonc` must include `https://viewer.wear-run.help`
(and `http://localhost:5173` for local development). Redeploy the worker after
changes. (`https://run-apparel-viewer.pages.dev` was removed 2026-07-22 when the
Pages project was deleted.) The R2 bucket CORS policy mirrors this list — update
both together, and purge the `media.wear-run.help` hostname cache after editing
the bucket policy.

## 8. Cloudflare Web Analytics (only analytics allowed)

**Already done — nothing to configure.** The beacon is embedded directly in
`apps/viewer/index.html` as a `<script src>` with the zone's token, which is a
public site tag and not a secret. No cookies, no third-party trackers.

It is a hard-coded tag on purpose, and there are two separate reasons:

- **Automatic Setup cannot be used here.** It injects an inline bootstrap at the
  edge, *after* the build has computed its Content-Security-Policy hashes, so the
  policy blocks it on every page load and the beacon never runs. The hash cannot
  be pinned either — it embeds a per-request ray id. See `apps/viewer/scripts/csp.mjs`.
- **The build-variable route was removed on 2026-08-09.** `VITE_CF_BEACON_TOKEN`
  fed an `initAnalytics()` that had never once run: the variable was never set, so
  every build baked in an empty string, and even with a token the function's own
  guard would have found the `index.html` tag and returned. Do not re-add it —
  injecting from JavaScript would put a second beacon on the page.

To point the viewer at a *dedicated* Web Analytics site rather than the zone one,
replace the token in `apps/viewer/index.html` and rebuild.

## 9. Smoke test

1. `https://cms.wear-run.help/admin` — log in, confirm collections exist.
2. `https://cms.wear-run.help/api/health` — `{"ok":true}`.
3. `https://cms.wear-run.help/api/public/viewer/n001/wine` — JSON with product data.
4. `https://viewer.wear-run.help/n001/wine` — poster appears instantly, model loads, tabs work.
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
| CMS worker (`run-apparel-viewer-cms`) | `https://cms.wear-run.help` (custom domain) — the viewer *calls* the API via the workers.dev URL instead (Bot Fight Mode, see RUNBOOK) |
| CMS admin | `https://cms.wear-run.help/admin` |
| CMS health | `https://cms.wear-run.help/api/health` |
| Public viewer API | `https://cms.wear-run.help/api/public/viewer/n001/wine` |
| Media (R2 `run-apparel-viewer-media`) | `https://media.wear-run.help/<file>` (30-day edge cache) |
| Viewer (Worker `run-apparel-viewer-site`) | `https://viewer.wear-run.help` (custom domain; workers.dev/preview URLs disabled) |

Notes for future maintenance:

- **CMS custom domain** is declared in `apps/cms/wrangler.jsonc` (`routes` →
  `cms.wear-run.help`, `custom_domain: true`); `wrangler deploy` manages the DNS
  record. **Viewer custom domain** `viewer.wear-run.help` is attached to the
  `run-apparel-viewer-site` Worker in the dashboard (the Worker manages its own
  DNS record; since 2026-07-22 — previously a CNAME to the deleted Pages
  project). **Media custom domain** `media.wear-run.help` is attached to the R2
  bucket in the dashboard.
- **`PAYLOAD_SECRET`** is set as a worker secret (`wrangler secret put`).
- **Seeding production D1 + R2 from the CLI:** the `seed`/`migrate` scripts use
  wrangler's local platform proxy. To target the *remote* (production) D1/R2,
  temporarily add `"remote": true` to the `d1_databases` and `r2_buckets`
  bindings in `wrangler.jsonc`, then run
  `PAYLOAD_LOCAL_D1=1 PAYLOAD_SECRET=… SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… pnpm --filter @run-apparel/cms exec payload run src/seed/run.ts`
  (`getPlatformProxy` proxies the marked bindings to the live resources). Revert
  the `"remote"` flags afterwards. N001 (“Velocity Performance Tee”, 3
  colourways) is seeded and its GLB/posters live in `run-apparel-viewer-media`.
- **Web Analytics:** the `wear-run.help` zone beacon is embedded directly in
  `apps/viewer/index.html` (SPA route changes tracked). Creating a *dedicated*
  viewer-only site needs an API token with Account Analytics **edit** permission
  (or the dashboard); swap the token in that file and rebuild if you create one.
  See step 8 for why it is not a build variable.
