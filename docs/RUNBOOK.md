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

Schema changes ship with the code: the deployed Worker applies committed
migrations on cold start (`prodMigrations` in `apps/cms/src/payload.config.ts`).
The workflow to add one:

```bash
# 1. change collections, then generate the migration
pnpm --filter @run-apparel/cms migrate:create <name>
# 2. commit the generated src/migrations/* files and push — the next deploy applies them
```

**If a migration fails on deploy** (health check red): take a backup, then apply
the SQL by hand and redeploy:

```bash
node scripts/backup-d1.mjs                     # safety first
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote \
  --command "SELECT * FROM payload_migrations"        # see what's applied
# apply the specific migration SQL if needed:
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote --file src/migrations/<file>.sql
```

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

## Why the viewer calls workers.dev (not cms.wear-run.help)

The `wear-run.help` zone has **Bot Fight Mode** enabled (protecting the separate
live commercial site). It challenges automated requests to `cms.wear-run.help`,
and — unlike Super Bot Fight Mode — it **cannot be exempted per-hostname** (it's
a zone-wide toggle). A cross-origin `fetch` from the viewer can't solve that
challenge, so the viewer would break.

Fix in place: the viewer's `VITE_API_BASE_URL` **repo variable** points at the
CMS worker's `run-apparel-viewer-cms.<account>.workers.dev` URL, which is on the
`workers.dev` zone (no Bot Fight Mode). Visitors only ever see
`viewer.wear-run.help`; the API URL is internal. `workers_dev: true` in
`apps/cms/wrangler.jsonc` keeps that URL enabled.

To move the API back onto the clean `cms.wear-run.help` domain later: disable
Bot Fight Mode for that host (or upgrade to Super Bot Fight Mode + a WAF skip
rule for `http.host eq "cms.wear-run.help"`), then
`gh variable set VITE_API_BASE_URL --body https://cms.wear-run.help` and push.

The admin panel is reachable at both `cms.wear-run.help/admin` (a real browser
solves the managed challenge automatically) and the workers.dev `/admin`.

## Login protection

The admin login locks an account for 10 minutes after 5 failed attempts
(`maxLoginAttempts`/`lockTime` on the Users collection). An optional Cloudflare
rate-limit rule on `cms.wear-run.help/api/users/login` adds an edge layer — see
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md).

## The home-directory git footgun (developer note)

`~` (the home directory) is itself a git repo on the original author's machine.
This project has its **own** `.git`, so commands run from inside it are safe —
but never run `git` from `~` or a parent directory, and never `git add -A` there.
