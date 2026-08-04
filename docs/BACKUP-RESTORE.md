# Backup & Restore

Everything the viewer depends on lives in two Cloudflare resources:

| Resource | What it holds | Backed up by |
|---|---|---|
| **D1** `run-apparel-viewer-db` | all products, colourways, media rows, site settings, users, analytics events | `scripts/backup-d1.mjs` → `backups/d1/*.sql` |
| **R2** `run-apparel-viewer-media` | every uploaded GLB model + poster image | `scripts/backup-r2.mjs` → `backups/r2/<stamp>/` |

Backups are **gitignored** (a D1 export contains password hashes — never commit it).

## Taking a backup

```bash
# production (needs Cloudflare auth: wrangler login, or CLOUDFLARE_API_TOKEN)
node scripts/backup-d1.mjs            # → backups/d1/run-apparel-viewer-db-<timestamp>.sql
node scripts/backup-r2.mjs            # → backups/r2/<timestamp>/<every media file>

# against the local dev database/bucket instead
node scripts/backup-d1.mjs --local
node scripts/backup-r2.mjs --local
```

Automated: `.github/workflows/nightly-backup.yml` runs the D1 export nightly (uploaded as a 90-day GitHub artifact) and the R2 mirror weekly. See [DEPLOY-BY-CLICKING.md](DEPLOY-BY-CLICKING.md) for the one-time secret setup.

## Restoring D1 — try Time Travel FIRST

D1 keeps **point-in-time recovery to any minute of the last 30 days**, automatically and
with no configuration ([Cloudflare D1 docs](https://developers.cloudflare.com/d1/)). For
the failure this project has actually had — a migration silently emptying two tables on
2026-07-29 — that is the right tool, and it is far better than the nightly dump: you
rewind to the minute *before* the migration ran instead of losing up to a day.

```bash
cd apps/cms
# What can I rewind to, and how far back does the window go?
pnpm exec wrangler d1 time-travel info run-apparel-viewer-db

# Look at a moment before the damage WITHOUT changing anything yet.
pnpm exec wrangler d1 time-travel info run-apparel-viewer-db --timestamp 2026-07-29T09:00:00Z

# Restore to it. This changes production — take a dump first (above) so you can
# get back to the current state if the rewind turns out to be the wrong call.
pnpm exec wrangler d1 time-travel restore run-apparel-viewer-db --timestamp 2026-07-29T09:00:00Z
```

Then verify with the row-count query in step 3 below, and re-capture
`GET /api/public/viewer/n001/navy` — that before/after diff is what caught the last
data-loss incident when the migration logs said success.

**The nightly SQL dump is still worth keeping**, for the one thing Time Travel cannot do:
it is an *off-platform* copy. Time Travel lives inside the same Cloudflare account, so it
does not protect against losing the account itself.

## Restoring D1 from a SQL dump

Use this when Time Travel cannot help — the damage is older than 30 days, or the account
is gone.

**Always dry-run into a throwaway database first.**

> Step 3 below used to select from `colourways`, a table dropped by
> `20260729_070548_inline_colourways.ts` when colours moved inline onto the
> product. The only documented rehearsal therefore ended in
> `no such table: colourways`. Colours now live in `products_colourways`.
> If you add a table, add it here — a restore nobody has run is not a backup.

```bash
cd apps/cms
# 1. create a scratch DB
pnpm exec wrangler d1 create run-apparel-viewer-db-restore-test
# 2. load the backup into it
pnpm exec wrangler d1 execute run-apparel-viewer-db-restore-test --remote \
  --file ../../backups/d1/run-apparel-viewer-db-<timestamp>.sql
# 3. sanity-check row counts
pnpm exec wrangler d1 execute run-apparel-viewer-db-restore-test --remote \
  --command "SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM products_colourways) AS colourways, (SELECT count(*) FROM media) AS media, (SELECT count(*) FROM raw_uploads) AS raw_uploads;"
# 4. tear the scratch DB down
pnpm exec wrangler d1 delete run-apparel-viewer-db-restore-test
```

**Real recovery** (production data lost/corrupted): restore into the live DB. Because the export includes `CREATE TABLE`, the target must be empty first — drop tables (or recreate the D1 database and update `database_id` in `wrangler.jsonc`), then:

```bash
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote \
  --file ../../backups/d1/run-apparel-viewer-db-<timestamp>.sql
curl -f https://cms.wear-run.help/api/health     # confirm the CMS is back
```

## Restoring R2

Put every backed-up object back into the bucket:

```bash
cd apps/cms
for f in ../../backups/r2/<timestamp>/*; do
  pnpm exec wrangler r2 object put "run-apparel-viewer-media/$(basename "$f")" --file "$f" --remote
done
```

Then reload a product in the viewer to confirm posters + models render.

## After any restore

1. `curl -f https://cms.wear-run.help/api/health` → `{"ok":true}`.
2. Open `https://viewer.wear-run.help/n001/navy` — model loads, colourways switch, contact links work.
3. Log into `/admin` and spot-check a product + its media.
