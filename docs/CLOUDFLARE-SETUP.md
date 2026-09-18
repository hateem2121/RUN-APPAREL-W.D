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
`VIEWER_ALLOWED_ORIGINS`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.

`VIEWER_API_CACHE_SECONDS` was removed on 2026-08-18 (audit L2). It fed the
public viewer API's `Cache-Control`, and that header has no observable effect
here — a Worker's own response does not pass through the edge cache, and live
probes found no `cf-cache-status` on those responses at all. If the var is still
set in `wrangler.jsonc`, nothing reads it.

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

⚠️ **The exact expression, threshold and block duration are deliberately NOT written
here.** This repository is public; publishing the precise guessing budget for the admin
login hands an attacker the one number they cannot otherwise measure. Read the live rule
in the Cloudflare dashboard instead.

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
deep links like `/rxps/blush` resolve on Pages; `_headers` sets immutable caching
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
3. `https://cms.wear-run.help/api/public/viewer/rxps/wine` — JSON with product data.
4. `https://viewer.wear-run.help/rxps/wine` — model loads, tabs work.
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
| Marketing site (CMS Worker on zone routes) | `https://wear-run.help` — `www.` redirects here; `/admin` and `/api` here answer the site's 404 |
| Private catalogue and profile links (`run-apparel-apex-404`) | `https://catalogue.wear-run.help/<code>` and `https://profile.wear-run.help/<code>`, and the same two on `wear-run.com` (custom domains; each code is a Worker secret). The old `wear-run.help/catalogue` and `/profile` answer 410 |
| CMS worker (`run-apparel-viewer-cms`) | `https://cms.wear-run.help` (custom domain) — the viewer *calls* the API via the workers.dev URL instead (Bot Fight Mode, see RUNBOOK) |
| CMS admin | `https://cms.wear-run.help/admin` |
| CMS health | `https://cms.wear-run.help/api/health` |
| Public viewer API | `https://cms.wear-run.help/api/public/viewer/rxps/wine` |
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

---

## 11. The seven pieces this document never mentioned

⚠️ **Added 2026-08-31 (audit finding L20-08).** A ten-term probe over the 319 lines
above returned: `ingest 0 · queue 0 · container 0 · apex 0 · DNSSEC 0 · lifecycle 0
· Sentry 0`, against `media.wear-run 8 · custom domain 9 · Cache Rule 1`. Every one
of those seven zeroes is a **live production dependency**, so this file described a
system that could not serve a garment or a PDF.

That matters because `docs/BACKUP-RESTORE.md` grades "Cloudflare account lost" at
RTO ~1 day and calls it *"Estimate — never drilled"*. An estimate against an
incomplete parts list is not an estimate.

### 11.1 R2 ingest bucket + its lifecycle rule

```bash
npx wrangler@4.122.0 r2 bucket create run-apparel-viewer-ingest
```

Raw CLO uploads land here on their way to the shrink pipeline. It carries an
`expire-raw-uploads` lifecycle rule — **14 days, all prefixes** — and is in **no
backup**, deliberately: it is working space, not storage. A raw export older than
14 days is gone, which is why the canonical copy is local (`raw/CANONICAL.json`).

### 11.2 Queues

```bash
npx wrangler@4.122.0 queues create glb-shrink
npx wrangler@4.122.0 queues create glb-shrink-dlq
```

`glb-shrink` carries the upload jobs; `glb-shrink-dlq` is the dead-letter queue
where a thrice-failed garment leaves its only trace. **Both** are set to
**14 days** (`message_retention_period` 1209600 s, Cloudflare's documented maximum
on Workers Paid; the default is 345600 s and the FREE-tier maximum is 24 h, so
copying this number onto a free account will fail).

```bash
npx wrangler@4.122.0 queues update glb-shrink     --message-retention-period-secs 1209600
npx wrangler@4.122.0 queues update glb-shrink-dlq --message-retention-period-secs 1209600
```

⚠️ **This paragraph said the DLQ was "still at the 4-day default" when it was first
written on 2026-08-31, and that was WRONG.** It came from a stale project note
rather than a measurement. Both queues were independently re-read at 1209600 s by
two agents hours apart during the 2026-08-30 audit (finding L7-10), and
`modified_on` for the DLQ is 2026-08-30T14:07:33Z. The correction is left visible
because the mistake is the point: the audit's own conclusion is that this setting
lives ONLY in Cloudflare's control plane — a repo-wide grep for `1209600` or
`message_retention` finds nothing in shipping code — so there is nothing here to
check a claim against, and prose drifts (finding L7-01, still open).

### 11.3 The shrink Worker and its Container

`apps/shrink` is a queue consumer that drives a Container running
`tools/asset-pipeline`. `wrangler deploy` from that package builds the Dockerfile
locally and pushes the image to Cloudflare's registry, which a plain
"Edit Cloudflare Workers" token **cannot** do — see the token-scope note at the top
of `.github/workflows/deploy-shrink.yml`. The container runs as **uid 1000** and can
write only under `/tmp`.

### 11.4 The apex Worker (both private document links)

`infra/apex-404/` is a deployed Worker (`run-apparel-apex-404`) with two custom domains,
`catalogue.wear-run.help` and `profile.wear-run.help`, each opening only with a code held as
a Worker secret (`CATALOGUE_CODE`, `PROFILE_CODE`), and four narrow apex routes
(`wear-run.help/catalogue*`, `/profile*`, and the `www.` pair) that answer 410. It reads the
PDFs and the page pictures from the **shared** `run-assets` bucket. Since 2026-09-06 the
apex itself — `wear-run.help/*` and `www.wear-run.help/*` — is the marketing site, served by
the CMS Worker; Cloudflare hands a request to the most specific route. CI deploys this Worker
BEFORE the CMS Worker because a route pattern belongs to one Worker at a time, and refuses to
deploy it without both secrets. Operating it: `docs/RUNBOOK.md` → "Private document links".

**The same two documents on `wear-run.com` (decided 2026-09-17, live from the merge that
deploys it).** `catalogue.wear-run.com` and `profile.wear-run.com` are two more custom
domains on this Worker, in the `wear-run.com` zone of the same account. The same words open
the same document on either address, and the `.help` pair must keep working forever because
links already sent use it. That zone's minimum is **TLS 1.2**, like `wear-run.help`. It was
1.3-only for five hours on 2026-09-17, until the email-signature project set it back after the
ruling in section 11.7. The zone audit log shows both changes.
⚠️ **The zone is shared** with the email-signature project (section 11.8), and in CI
`wrangler deploy` runs without a terminal — so it takes any hostname listed in
`infra/apex-404/wrangler.jsonc` from whichever Worker holds it, without asking. That file
may therefore name no other `wear-run.com` host, and `apps/cms/src/workerConfigs.test.ts`
fails if one appears.

⚠️ **The apex DNS record must stay proxied.** Zone routes require it; deleting it
takes the site and the four retired PDF routes offline. The private links are not on
it: `catalogue.` and `profile.wear-run.help` are custom domains whose DNS records
`wrangler deploy` creates.

⚠️ **Two zone rules for the document hosts live only in Cloudflare, not in any wrangler
file** (owner decisions D20, D21): created 2026-09-15 in `wear-run.help` for its two hosts,
and copied on 2026-09-17, with the same descriptions and matching only its two hosts, into
the `wear-run.com` zone. Named here by description, because no rule id may appear in this
public repository:

- the Configuration Rule **"Private document links: no Zaraz or Web Analytics
  injection (owner decision D20, 2026-09-15)"** — the pages allow no JavaScript at all;
- the Cache Rule **"Private document links: browsers follow the Worker's own
  Cache-Control (owner decision D21, 2026-09-15)"**.

Cloudflare's own documentation states that zone cache settings do not apply to Workers
Caching — the Worker's own `Cache-Control` response header is what actually decides —
so the proof that either rule does anything is a header check against the real response
after switch-on, not the dashboard screen.

**Document visits (decided 2026-09-15, live from the merge that deploys it).** The same
Worker also holds a D1 binding `VISITS`, pointed at the same database the CMS uses
(`run-apparel-viewer-db`), and two Cron Triggers: one daily, deleting visit records
older than 12 months, and one weekly, sending the Monday summary email. Two Worker
secrets configure the email — `RESEND_API_KEY` (a sending-only Resend key, restricted
to the `wear-run.help` domain, created by the owner) and `VISITS_EMAIL_TO` (the
recipient) — named here, values nowhere. CI's deploy requires neither: a week with
either secret missing simply records that week's email as not sent, and nothing about
the deploy itself depends on it.

### 11.5 DNSSEC

Active since 2026-08-30. ⚠️ **DNS is Cloudflare; REGISTRATION is Hostinger.** The DS
record must be filed with the `.help` registry, which only the registrar can do, and
Hostinger's API has no DNSSEC surface at all — so this is permanently a manual hPanel
step. Values: key tag **2371**, algorithm **13**, digest type **2**.

⚠️ Do **not** change nameservers while DNSSEC is on without disabling it at the
registrar first, or the domain goes dark for validating resolvers.

Verify with **both** controls, because an `ad` flag alone proves nothing:

```bash
dig +dnssec A dnssec-failed.org @8.8.8.8              # must be SERVFAIL
dig +dnssec A sigfail.verteiltesysteme.net @8.8.8.8   # must be SERVFAIL
dig +dnssec A wear-run.help @8.8.8.8                  # must be NOERROR + ad
```

### 11.6 Sentry

Error reporting for the viewer. `VITE_SENTRY_DSN` at build time puts the origin into
the CSP `connect-src` **and** derives the `report-uri` (see
`apps/viewer/scripts/csp.mjs`). `SENTRY_DSN` is also set on the shrink Worker;
without it `sentry.ts` silently no-ops.

⚠️ The CMS Worker reports to **nothing** — audit finding L6-03, still open.

### 11.7 Zone settings that live in no file

Applied 2026-08-30 and guarded daily by `scripts/zone-security-probe.mjs`: minimum
TLS **1.2**, SSL mode **strict**, HSTS (2 years, subdomains, `preload` deliberately
**off** as a one-way door), CAA records naming all four partner CAs, and
`model/gltf-binary` added to the compression list (**−7.6 MB per garment**, measured
on the wire).

⚠️ `security_level: essentially_off` is **deliberate** and must not be "fixed":
Cloudflare's bot challenge has broken this viewer before.

Cache and firewall rules are recorded with their rollback JSON in
the private audit's live-changes record.

**Three decisions from the 2026-09-18 security scans** (internet.nl, MDN HTTP Observatory,
securityheaders.com; results kept privately):

- **Minimum TLS stays 1.2 on purpose.** internet.nl marks this zone down for Cloudflare's
  default TLS 1.2 cipher list, cipher order and SHA-1 signature support; changing that list
  without dropping TLS 1.2 needs the paid Advanced Certificate Manager. Measured instead:
  in the week to 2026-09-17, 3,469 of 129,308 TLS requests (2.7%) still used TLS 1.2 —
  nearly all robots, but a few modern browser names that only negotiate 1.2 behind an office
  filter or antivirus, who would see an error page. Mozilla's server guide (TLSRef) calls
  1.2 + 1.3 "the recommended configuration for the vast majority of services", and
  `scripts/zone-security-probe.mjs` uses a successful 1.2 handshake as each host's own
  control, so a 1.3-only zone would blind it. Revisit if the 1.2 share reaches zero.
- **0-RTT is off** (since 2026-09-18). TLS 1.3 early data can be replayed by anyone on the
  network path, and internet.nl failed it on every host. The cost is one round trip on a
  resumed connection.
- **The www. and cms. redirects carry security headers from a response-header Transform
  Rule**, "www./cms. redirects: the site's security headers, which OpenNext does not attach
  to a redirect (2026-09-18)". OpenNext 4.1.0 returns a matched redirect before it attaches
  the site's own headers (`routingHandler.js`), so no setting in `apps/cms` can reach those
  responses. The rule matches only a 3xx on those two hosts, and
  `scripts/public-security-probe.mjs` checks it after every deploy and daily. A wrapper
  Worker around OpenNext (planned for the CSP nonce work) could take it over.

HSTS `includeSubDomains` also covers `url7790.wear-run.help`, a DNS-only CNAME to SendGrid
used for click tracking, which cannot serve HTTPS for that name. Click tracking is off, so no
link points there and nothing breaks. **Do not turn SendGrid click tracking on** without
first giving that host HTTPS.

### 11.8 Other projects on these zones — never delete

Recorded 2026-09-17 at the owner's request. These live in the same Cloudflare account and
belong to the separate **email-signature project**, whose Worker is `run-domain-edge`.
Nothing in this repository creates, reads or deploys them, so no test here would notice one
disappearing — and deleting one breaks company email, not this site.

On `wear-run.help`:

| Record | What it is |
|---|---|
| Custom domain `mta-sts.wear-run.help` (Worker `run-domain-edge`) | serves the MTA-STS policy |
| TXT `_mta-sts.wear-run.help` | announces that policy |
| TXT `default._bimi.wear-run.help` | the BIMI logo record; its own comment names the R2 bucket `run-email-assets` |
| TXT `_dmarc.wear-run.help` and TXT `_smtp._tls.wear-run.help` | DMARC and TLS-RPT, **managed by that project** |

`scripts/check-email-dns.mjs` still reads DMARC and TLS-RPT, but a value that changed may be
that project's deliberate edit: check with it before "fixing" a record.

On `wear-run.com`, the apex, `www.`, `go.`, `assets.` and `mta-sts.` belong to that project
too. Its apex and `www.` redirect to `wear-run.help`, which is how an old
`wear-run.com/catalogue` link still reaches the 410 page — no route of ours is needed there.
Only `catalogue.` and `profile.wear-run.com` are this repository's (section 11.4).

**Two redirects that old emails use — keep them forever.** `wear-run.help/map` (302 to the
Google Maps pin) and `wear-run.help/meeting` (301 to the Apollo meeting-booking page) are
Cloudflare **redirect rules**, named "Map" and "Book Meeting", in no file. Their expressions
match the PATH on every proxied host of the zone and run before any Worker, so a site page
at either path would never be seen. `scripts/apex-probe.mjs` checks both after every deploy
and daily, by host, so the target's path can still change.

---

## Protecting the 3D models (added 2026-09-05)

Two controls, deployed by hand in the dashboard. They are **not in git** — nothing in
this repo can create or verify them — so this is the only operational record. The
reasoning and the live measurements are in the 2026-09-05 product-page audit, kept
privately since 2026-09-10.

### WAF custom rule — hotlinked models

| Field | Value |
|---|---|
| Name | `Block hotlinked 3D models (referrer must be our own origin)` |
| Expression | `(http.host eq "media.wear-run.help" and ends_with(http.request.uri.path, ".glb") and len(http.referer) > 0 and not starts_with(http.referer, "https://viewer.wear-run.help/") and not starts_with(http.referer, "https://cms.wear-run.help/"))` |
| Action | Block |
| Order | 2 (after the CMS-API skip rule) |

⚠️ **`len(http.referer) > 0` IS LOAD-BEARING — do not "tighten" it away.** The viewer's
own model fetch sends `Referer: https://viewer.wear-run.help/` and **no `Origin` header
at all** (measured before the rule was written; a rule keyed on `Origin` would match
nothing). Dropping the length test would block every referrer-less client — `curl`, a
privacy browser that strips the header, the backup script — which is a self-inflicted
outage wearing a security badge. The failure mode of a miss is today's behaviour.

⚠️ **IT WAS `contains "wear-run.help"` FOR HALF A DAY, AND THAT WAS BYPASSABLE.**
`contains` matches the string anywhere in the referrer, so all five of these returned
**206**: `https://evil.com/wear-run.help`, `https://wear-run.help.evil.com/`,
`https://notwear-run.help/`, `https://evil.com/?x=wear-run.help`,
`https://viewer.wear-run.help.attacker.io/`. Anyone appending the string to their own
URL, or registering a lookalike subdomain, defeated it. Key on the referrer's **origin
prefix**, never on a substring of the host. Re-measured after the fix: all five 403,
and the viewer's own referrer, a deep viewer path, the CMS admin and a referrer-less
request all still 206.

**Images are deliberately NOT gated.** A poster with a hostile referrer still returns
200, on purpose — see PP3-N-07 in the audit.

### Response-header Transform Rule — `media.wear-run.help`

| Field | Value |
|---|---|
| Name | `media headers: Timing-Allow-Origin for the viewer's own page + CORP same-site …` |
| If | `(http.host eq "media.wear-run.help")` |
| Set static | `Timing-Allow-Origin` = `https://viewer.wear-run.help` |
| Set static | `Cross-Origin-Resource-Policy` = `same-site` |

**`same-site`, not `same-origin`.** The viewer and the media host share the registrable
domain `wear-run.help`, so the viewer's own fetches are allowed while a foreign page
embedding a model is refused by the browser itself — the half a WAF rule cannot do,
since a `Referer` is forgeable and this is not.

⚠️ **ADD HEADERS TO THIS ONE RULE, NEVER A SECOND RULE ON THE SAME HOST.** This domain
*joins* duplicate headers from every matching rule with a comma rather than picking a
winner — the same trap `_headers` has, documented in `apps/viewer/CLAUDE.md`.

⚠️ **Verified before trusting it:** all 11 models still 206 with both headers,
`Timing-Allow-Origin` survived the edit, and every `og:image` across the sampled pages
points at `viewer.wear-run.help/og/…` rather than `media.wear-run.help`, so no
link-preview image is subject to CORP.

### After changing an object in R2, PURGE

Deleting or overwriting an R2 object does **not** change what the edge serves. Measured
2026-09-05: two objects deleted from R2 and removed from the CMS still returned **200
with `cf-cache-status: HIT`** and ages of 178,483 s and 23,981 s, under
`max-age=31536000`. Without a Custom Purge of each exact URL the change is cosmetic for
a year. Caching → Configuration → Purge Cache → Custom Purge → URL, up to 30 at a time.
Verify with a **plain GET**, never a HEAD — they land on different edge cache entries on
this domain.

### Search Console

A **Domain** property `sc-domain:wear-run.help` was created 2026-09-05 and **auto-verified**
— Google recognised Cloudflare as the DNS provider, so no TXT record was needed. It
therefore depends on the zone staying on Cloudflare nameservers.
