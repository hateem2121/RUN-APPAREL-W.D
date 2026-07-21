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

## Restoring D1

**Always dry-run into a throwaway database first** — this is the tested path:

```bash
cd apps/cms
# 1. create a scratch DB
pnpm exec wrangler d1 create run-apparel-viewer-db-restore-test
# 2. load the backup into it
pnpm exec wrangler d1 execute run-apparel-viewer-db-restore-test --remote \
  --file ../../backups/d1/run-apparel-viewer-db-<timestamp>.sql
# 3. sanity-check row counts
pnpm exec wrangler d1 execute run-apparel-viewer-db-restore-test --remote \
  --command "SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM colourways) AS colourways, (SELECT count(*) FROM media) AS media;"
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
