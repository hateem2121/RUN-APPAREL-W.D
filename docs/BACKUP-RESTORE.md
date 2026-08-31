# Backup & Restore

Everything the viewer depends on lives in **three** Cloudflare resources — and the
third one was missing from this table until 2026-08-31, which is why 71.2 MB of
customer-facing PDFs had no written recovery path at all:

| Resource | What it holds | Backed up by |
|---|---|---|
| **D1** `run-apparel-viewer-db` | all products, colourways, media rows, site settings, users, analytics events | `scripts/backup-d1.mjs` → `backups/d1/*.sql` |
| **R2** `run-apparel-viewer-media` | every uploaded GLB model + poster image | `scripts/backup-r2.mjs` → `backups/r2/<stamp>/media/` |
| **R2** `run-assets` | the two customer-facing PDFs the apex serves: `/catalogue` and `/profile` (71.2 MB) | `scripts/backup-r2.mjs` → `backups/r2/<stamp>/apex/` |

⚠️ **`run-assets` is SHARED with the separate `run-apparel` site**, which can write
to and delete from it. It is not this project's private bucket, and that is the
reason its contents need a backup of their own rather than being assumed safe.
`infra/apex-404/index.js` is what serves those two objects.

Backups are **gitignored** (a D1 export contains password hashes — never commit it).

## How much can we lose, and how fast can we be back?

Two numbers, in plain terms:

- **RPO — Recovery Point Objective.** How much recent work a restore would throw
  away. "RPO 24h" means you could lose up to a day of edits.
- **RTO — Recovery Time Objective.** How long the site stays broken while you fix it.

| What broke | Tool | RPO (work lost) | RTO (time down) | Confidence |
|---|---|---|---|---|
| Bad migration / bad edit, D1 | Time Travel | **~1 minute** | **~10 min** | Drilled 2026-07-29 — this is the failure that actually happened |
| D1 gone, or damage older than 30 days | nightly SQL dump | **up to 24h** | **~1h** | Drilled 2026-08-05; the drill is what found the restore instructions were wrong |
| Cloudflare account lost | nightly SQL dump (GitHub artifact) | **up to 24h** | **~1 day** | Estimate — never drilled, and it needs a new account, new domain binding and new secrets |
| Media (GLB/posters) deleted from R2 | weekly R2 mirror | **up to 7 days** | **~1h** | Estimate — mirror verified, restore never drilled end to end |
| Bad deploy (code, not data) | rollback | **0** | **~5 min** | See RUNBOOK → "Undoing a bad deploy" |
| Raw CLO export lost | **none — owner's own copies** | n/a | n/a | Deliberate: automated backup declined 2026-08-08. `raw/CANONICAL.json` records the checksum so an outside copy is *provable*, but nothing in this repo holds the file |

**The weakest row is the R2 one**, and it is weak in an uninteresting way: the
mirror runs weekly rather than nightly because a full media mirror costs egress
against a $5/month cap, and models change rarely. If a garment is re-shrunk on a
Tuesday and R2 is lost on a Friday, that model is regenerable from the raw export
— which is the row below it, and the one with no backup at all. Those two rows
are linked; do not read either alone.

**RTO here excludes noticing.** Detection is a separate number and it is the
larger one: see RUNBOOK → "Uptime alerts", where the *delivered* median gap
between scheduled checks was measured at ~45 minutes, not the 15 the cron
requests. External UptimeRobot checks run every 5 minutes and are the faster
signal.

### Restore drill log

A backup nobody has restored is a hypothesis. Add a row each time one is run.

| Date | What was drilled | Result |
|---|---|---|
| 2026-07-29 | D1 Time Travel, after the migration that emptied two tables | Worked; became the documented first resort |
| 2026-08-05 | D1 restore from a nightly SQL dump | Worked, **and found the written instructions were wrong** — they were corrected as a result |

**Next drill due: 2026-11-05** (quarterly). The one worth doing next is the R2
media restore, because it is the only row above whose RTO is a guess.

## ⚠️ What this document does NOT cover

**`run-apparel-db` — the OTHER site's database — is out of scope here.** It lives in
the same Cloudflare account, it is backed up by nothing in this repository, and
**D1 Time Travel is its only recovery path** (30 days, and it cannot recover a
database that has been deleted). It belongs to the commercial site, not to the
viewer.

That is a deliberate boundary, not an oversight (L7-03). Adding it to
`scripts/backup-d1.mjs` would make this repository responsible for restoring a
system it does not own, cannot test a restore of, and whose schema it does not
track — and a backup nobody has ever restored is the thing this document exists to
argue against.

What this repository DOES back up: `run-apparel-viewer-db` (nightly D1 dump,
restore-verified, kept as a GitHub artifact **and** in R2 under
`run-private/run-apparel-viewer-db/`), the `run-apparel-viewer-media` bucket, and
the two apex PDFs from `run-assets`.

## Taking a backup

```bash
# production (needs Cloudflare auth: wrangler login, or CLOUDFLARE_API_TOKEN)
node scripts/backup-d1.mjs            # → backups/d1/run-apparel-viewer-db-<timestamp>.sql
node scripts/backup-r2.mjs            # → backups/r2/<timestamp>/{media,apex}/
node scripts/backup-r2.mjs --apex-only # → just the two customer PDFs (71 MB)

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
npx wrangler@4.122.0 d1 time-travel info run-apparel-viewer-db

# Look at a moment before the damage WITHOUT changing anything yet.
npx wrangler@4.122.0 d1 time-travel info run-apparel-viewer-db --timestamp 2026-07-29T09:00:00Z

# Restore to it. This changes production — take a dump first (above) so you can
# get back to the current state if the rewind turns out to be the wrong call.
npx wrangler@4.122.0 d1 time-travel restore run-apparel-viewer-db --timestamp 2026-07-29T09:00:00Z
```

Then verify with the row-count query in step 3 below, and re-capture
`GET /api/public/viewer/rxps/wine` — that before/after diff is what caught the last
data-loss incident when the migration logs said success.

> Use a **live** colour slug. This said `navy`, which was retired on 2026-08-05;
> a retired slug still answers 200 by falling back to the default colourway, so
> the capture would have compared two fallback responses and stayed identical
> even if the real colourway rows had been lost — the exact failure this diff
> exists to catch. Corrected 2026-08-07.

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
npx wrangler@4.122.0 d1 create run-apparel-viewer-db-restore-test
# 2. load the backup into it
npx wrangler@4.122.0 d1 execute run-apparel-viewer-db-restore-test --remote \
  --file ../../backups/d1/run-apparel-viewer-db-<timestamp>.sql
# 3. sanity-check row counts
npx wrangler@4.122.0 d1 execute run-apparel-viewer-db-restore-test --remote \
  --command "SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM products_colourways) AS colourways, (SELECT count(*) FROM media) AS media, (SELECT count(*) FROM raw_uploads) AS raw_uploads;"
# 4. tear the scratch DB down
npx wrangler@4.122.0 d1 delete run-apparel-viewer-db-restore-test
```

**Real recovery** (production data lost/corrupted): restore into the live DB. Because the export includes `CREATE TABLE`, the target must be empty first — drop tables (or recreate the D1 database and update `database_id` in `wrangler.jsonc`), then:

```bash
cd apps/cms
npx wrangler@4.122.0 d1 execute run-apparel-viewer-db --remote \
  --file ../../backups/d1/run-apparel-viewer-db-<timestamp>.sql
curl -f https://cms.wear-run.help/api/health     # confirm the CMS is back
```

## Restoring R2

⚠️ **A BACKUP HAS TWO FOLDERS AND THEY GO TO TWO DIFFERENT BUCKETS.**
`scripts/backup-r2.mjs` writes `backups/r2/<stamp>/media/…` **and**
`backups/r2/<stamp>/apex/…`. The version of this section that ran until
2026-08-31 looped over `<stamp>/*`, which after that layout change yields two
**directories** — and `r2 object put --file <a directory>` restores **nothing**.
It also sent everything to `run-apparel-viewer-media`, which is the wrong bucket
for the PDFs, and never mentioned that the PDFs were in the backup at all.

Set the stamp once, then run both loops:

```bash
cd apps/cms
BASE=../../backups/r2/<timestamp>

# Sanity-check the layout BEFORE restoring anything. Two folders, both non-empty.
find "$BASE" -maxdepth 1 -mindepth 1 -type d
find "$BASE/media" -type f | wc -l     # expect the media-object count
find "$BASE/apex"  -type f | wc -l     # expect 2
```

```bash
# 1. Media objects -> run-apparel-viewer-media.
#    The key is the path RELATIVE to media/, never `basename`: an object key may
#    contain slashes, and basename would flatten it to a different key.
find "$BASE/media" -type f | while read -r f; do
  key="${f#"$BASE/media/"}"
  npx wrangler@4.122.0 r2 object put "run-apparel-viewer-media/$key" --file "$f" --remote
done
```

```bash
# 2. The two customer-facing PDFs -> run-assets. A DIFFERENT BUCKET, shared with
#    the separate run-apparel site, and the one infra/apex-404/index.js reads.
#    Their keys contain spaces, so keep every expansion quoted.
find "$BASE/apex" -type f | while read -r f; do
  key="${f#"$BASE/apex/"}"
  npx wrangler@4.122.0 r2 object put "run-assets/$key" --file "$f" --remote
done
```

**Then verify, and verify the way a browser asks — a plain GET, never `HEAD`.**
`HEAD` lands on a different edge cache entry and has twice returned a different
answer from `GET` on this domain:

```bash
curl -sS -o /dev/null -D - https://wear-run.help/catalogue | head -1
curl -sS -o /dev/null -D - https://wear-run.help/profile   | head -1
curl -sS -o /dev/null -D - https://viewer.wear-run.help/rxps/wine | head -1
```

Reload a product in the viewer and confirm posters and models render.

### Drilling this without touching real data

A restore procedure nobody has run is a guess. Practise on a throwaway key —
it exercises the exact command path without overwriting anything real:

```bash
echo "restore drill $(date -u +%FT%TZ)" > /tmp/_restore-drill.txt
npx wrangler@4.122.0 r2 object put "run-apparel-viewer-media/_restore-drill.txt" \
  --file /tmp/_restore-drill.txt --remote
npx wrangler@4.122.0 r2 object get "run-apparel-viewer-media/_restore-drill.txt" \
  --file /tmp/_restore-drill.out --remote && cat /tmp/_restore-drill.out
npx wrangler@4.122.0 r2 object delete "run-apparel-viewer-media/_restore-drill.txt" --remote
```

## After any restore

1. `curl -f https://cms.wear-run.help/api/health` → `{"ok":true}`.
2. Open `https://viewer.wear-run.help/rxps/wine` — model loads, colourways switch, contact links work.
3. Log into `/admin` and spot-check a product + its media.
