# Runbook — operating the RUN APPAREL viewer

Day-to-day operations for the live stack. For first-time setup see
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md); for backups see
[BACKUP-RESTORE.md](BACKUP-RESTORE.md).

## How deploys work

The repo has a **single `main` branch** and no pull requests. Pushing to `main`
triggers `.github/workflows/ci.yml`:

1. **verify** — install, typecheck, all unit tests, build, Playwright e2e.
2. **deploy** (only if verify passes *and* `vars.DEPLOY_ENABLED == 'true'`) —
   deploys the CMS worker, builds + deploys the viewer to Pages, then hits
   `/api/health` as a gate.

So: **commit to `main`, push, watch the Actions tab.** A red build never
deploys. `gh run watch` follows the latest run from the CLI.

**Manual deploy fallback** (if CI is unavailable):

```bash
pnpm --filter @run-apparel/cms run deploy          # CMS worker (canonical command)
VITE_API_BASE_URL=https://cms.wear-run.help pnpm --filter @run-apparel/viewer build
pnpm --filter @run-apparel/viewer exec wrangler pages deploy apps/viewer/dist \
  --project-name run-apparel-viewer --branch main
curl -f https://cms.wear-run.help/api/health
```

Requires Cloudflare auth (`wrangler login` or `CLOUDFLARE_API_TOKEN`).

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

**Dependency updates** arrive as weekly grouped Dependabot PRs
(`.github/dependabot.yml`); the same CI gates run on them before merge.

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

## API + media domain cutover

**Where we are now (temporary).** The viewer calls the CMS API via the worker's
`run-apparel-viewer-cms.<account>.workers.dev` URL (the `VITE_API_BASE_URL` repo
variable), because the `wear-run.help` zone's **Bot Fight Mode** (protecting the
separate live commercial site) challenges automated requests to
`cms.wear-run.help` and — unlike Super Bot Fight Mode — it cannot be exempted
per-hostname. Media currently streams through the worker (`PUBLIC_MEDIA_BASE_URL`
empty). Visitors only ever see `viewer.wear-run.help`; the workers.dev URL is
internal. This is a workaround, not the end state.

**Target end state.** API served from `cms.wear-run.help` (Bot Fight Mode
resolved), media served direct from R2 at `media.wear-run.help` with long-lived
edge caching, and the workers.dev URL retired.

Do this as one coordinated cutover — **in this order**, so live media/API never
break mid-flight (each config flip is a one-liner already commented in
`apps/cms/wrangler.jsonc`):

1. **Resolve Bot Fight Mode for the API host.** In the zone → *Security → Bots*,
   turn on **Super Bot Fight Mode**, then *Security → WAF → Custom rules* add a
   **Skip** rule (skip Super Bot Fight Mode) for
   `http.host eq "cms.wear-run.help"`. Verify a plain `curl -fsS
   https://cms.wear-run.help/api/health` returns `{"ok":true}` with no challenge.
2. **Connect the media domain.** R2 → `run-apparel-viewer-media` → *Settings →
   Public access* → connect custom domain `media.wear-run.help`. Add a Cache Rule
   for `http.host eq "media.wear-run.help"` → *Edge TTL: a long value* (e.g. 30
   days) so media is cached hard at the edge.
3. **Point the viewer at the custom domain:**
   `gh variable set VITE_API_BASE_URL --body https://cms.wear-run.help`.
4. **Flip the two worker config values** in `apps/cms/wrangler.jsonc`:
   `PUBLIC_MEDIA_BASE_URL` → `"https://media.wear-run.help"`, and once step 3 is
   live, `workers_dev` → `false`. Commit + deploy (the next push/merge).
5. **Remove the temporary WAF "skip" custom rule** that was left on the zone from
   an earlier attempt (zone → *Security → WAF → Custom rules*) — it is superseded
   by the step-1 rule and should not linger.
6. **Verify:** the CSP already allows `*.wear-run.help`, so no viewer change is
   needed. Check `curl` on the API + a `media.wear-run.help/...` URL (long
   `cache-control`), then load `viewer.wear-run.help/n001/navy`; run the QA
   checklist. Roll back by reverting step 4 and re-pointing `VITE_API_BASE_URL`
   at the workers.dev URL if anything regresses.

The admin panel is reachable at `cms.wear-run.help/admin` throughout (a real
browser solves any challenge automatically).

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
