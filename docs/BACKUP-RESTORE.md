# Backup & Restore

Everything the viewer depends on lives in **four** Cloudflare resources. The third
was missing from this table until 2026-08-31, which is why 71.2 MB of customer-facing
PDFs had no written recovery path; the fourth was missing until 2026-09-02, which is
why 5.4 GB of master files existed once, on one disk (audit CI-02 / CI-08):

| Resource | What it holds | Backed up by |
|---|---|---|
| **D1** `run-apparel-viewer-db` | all products, colourways, media rows, site settings, users, analytics events | `scripts/backup-d1.mjs` → `backups/d1/*.sql` |
| **R2** `run-apparel-viewer-media` | every uploaded GLB model + poster image | `scripts/backup-r2.mjs` → `backups/r2/<stamp>/media/` |
| **R2** `run-assets` | the two customer-facing PDFs behind the private catalogue and profile links (71.2 MB); the page pictures under `documents/` are regenerated from them and not backed up | `scripts/backup-r2.mjs` → `backups/r2/<stamp>/apex/` |
| **R2** `run-apparel-archive` | the **master files**: the FIXED GLBs (five, plus three new exports added 2026-09-02, the two X-MILO PRO masters added 2026-09-03, and the same two masters re-exported that evening with the diffuse setting OFF under `fixed-glbs/2026-09-03-diffuse-off/`) and ten raw CLO exports (21 objects, 6.42 GB in the manifest; the ten superseded pre-diffuse-off copies are listed under `superseded` for the owner to delete) — the only off-machine copy | uploaded by hand with rclone (see below); byte counts verified nightly by `scripts/verify-archive.mjs` against `scripts/archive-manifest.json` |

⚠️ **`run-assets` is SHARED with the separate `run-apparel` site**, which can write
to and delete from it. It is not this project's private bucket, and that is the
reason its contents need a backup of their own rather than being assumed safe.
`infra/apex-404/` serves those two objects, as each private link's Download button.

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
| Cloudflare account lost | nightly SQL dump (the ENCRYPTED GitHub artifact — needs the owner's backup key) | **up to 24h** | **~1 day** | Estimate — never drilled, and it needs a new account, new domain binding, new secrets and the backup key |
| Media (GLB/posters) deleted from R2 | weekly R2 mirror | **up to 7 days** | **~1h** | Estimate — mirror verified, restore never drilled end to end |
| Bad deploy (code, not data) | rollback | **0** | **~5 min** | See RUNBOOK → "Undoing a bad deploy" |
| Raw CLO export or FIXED GLB lost | **archive bucket** `run-apparel-archive` (and Time Machine, once the owner's drive is set up) | **since the last hand upload** — a new export is unprotected until it is uploaded and its manifest row added | **~1h** (a 1.5 GB download) | Uploaded and hash-checked 2026-09-02; sizes verified nightly; restore never drilled. Supersedes the 2026-08-08 "declined" decision, which predates the audit finding that the masters existed once, on one disk |

**The weakest row is the R2 one**, and it is weak in an uninteresting way: the
mirror runs weekly rather than nightly because a full media mirror costs egress
against a $5/month cap, and models change rarely. If a garment is re-shrunk on a
Tuesday and R2 is lost on a Friday, that model is regenerable from the raw export
— which is the row below it, and until 2026-09-02 the one with no backup at all.
Those two rows are linked; do not read either alone.

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
restore-verified, kept in R2 under `run-private/run-apparel-viewer-db/` **and** as an
age-encrypted GitHub artifact; the pre-deploy snapshot goes to R2 only, under
`run-private/run-apparel-viewer-db/pre-deploy/`), the `run-apparel-viewer-media` bucket, the
two apex PDFs from `run-assets`, and — verified rather than mirrored — the master
files in `run-apparel-archive`.

**Deliberately not in the archive — owner decision 2026-09-02:** CLO project files
(`.zprj`, 19 GB in Documents/clo plus four in Documents/3D New Project) stay on local
storage only, and the 110 older per-colourway exports in Documents/GLTF FILES (15.8 GB)
are not archived. The FIXED GLBs folder is the canonical home of production-ready files.

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

Automated: `.github/workflows/nightly-backup.yml` runs the D1 export nightly (copied to R2, and uploaded as a 90-day GitHub artifact ENCRYPTED to the owner's backup key) and the R2 mirror weekly (also encrypted). See [DEPLOY-BY-CLICKING.md](DEPLOY-BY-CLICKING.md) for the one-time secret setup, and "The backup key" below.

## The backup key (since 2026-09-10)

This repository is **public**, and anyone signed in to GitHub can download a workflow
artifact. So the nightly D1 dump and the R2 mirror are encrypted with
[age](https://github.com/FiloSottile/age) before they are uploaded, to the PUBLIC key in
`.github/backup-recipients.txt`. Only the owner holds the private half, outside GitHub and
outside Cloudflare. Until that file holds a key, the nightly job fails at its lock step and
uploads nothing to GitHub — the dump still reaches R2.

Making the key, once, on the owner's Mac (install age first with `brew install age`):

```bash
age-keygen -pq -o ~/Desktop/run-apparel-backup-key.txt
age-keygen -y ~/Desktop/run-apparel-backup-key.txt > ~/Desktop/run-apparel-backup-PUBLIC.txt
```

Store the whole of `run-apparel-backup-key.txt` in a password manager **and** on paper,
then delete that file. Add the one line from the PUBLIC file to
`.github/backup-recipients.txt` through a pull request. **Lose the private key and every
encrypted artifact is unreadable** — the R2 copies and D1 Time Travel are unaffected.

Unlocking a downloaded artifact needs age 1.3 or newer, which reads `-pq` keys:

```bash
# D1 dump (from a d1-backup-<run> artifact)
age -d -i run-apparel-backup-key.txt -o run-apparel-viewer-db-<stamp>.sql run-apparel-viewer-db-<stamp>.sql.age

# R2 mirror (from an r2-backup-<run> artifact) — recreates backups/r2/<stamp>/{media,apex}/
mkdir -p backups && age -d -i run-apparel-backup-key.txt r2-mirror.tar.age | tar -xf - -C backups
```

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
curl -sS -o /dev/null -D - https://viewer.wear-run.help/rxps/wine | head -1
```

`/catalogue` must answer **410**: it is retired and never serves a PDF. Then open both
private links from the owner's Passwords and press Download — the only check that reads
the restored objects, because no command here may hold a code.

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

## The archive bucket — the master files

`run-apparel-archive` (R2, Standard storage, no expiry rule, created 2026-09-02) holds
the files that until then existed once, on one disk: the five FIXED GLBs (the owner's
canonical production-ready folder) and the ten raw CLO exports from the repo's
gitignored 3D Products folder — 15 objects, 5.15 GB, plus three masters the owner exported on
1–2 September (APEX "File A", WOMEN ZIP-UP VEST, THE AGGRESSOR MEN JERSEY) under
`fixed-glbs/2026-09-02/`, and the two X-MILO PRO masters (SKIN-SUIT, BIB) the owner
re-exported on 3 September under `fixed-glbs/2026-09-03/`, and the same two masters
re-exported that evening with "Diffuse Color Combined on Texture" OFF under
`fixed-glbs/2026-09-03-diffuse-off/` (the export that carries a colour per colourway; the
earlier copies are listed under `superseded` in the manifest for the owner to delete): the
manifest verifies 21 objects, 6.42 GB; with the ten superseded copies still in the bucket it
holds 8.74 GB of the 10 GB that Standard storage gives free (uploaded at the connection's
~300 kB/s over the evening of 2026-09-03, hash-checked by `rclone check`). Standard storage rather
than Infrequent Access because the free 10 GB applies only to Standard, and Infrequent
Access adds a 30-day minimum and a retrieval fee (R2 pricing page, checked 2026-09-02).

`scripts/archive-manifest.json` is the list: every key with the byte count and SHA-256
measured on the local file before upload. The nightly check compares the bucket against
it, so **a file added to the bucket without a manifest row is unverified** — the check
prints such objects as "not in the manifest" rather than failing.

**Verify** (one REST call; `.github/workflows/nightly-backup.yml` runs it every night):

```bash
CLOUDFLARE_API_TOKEN=… node scripts/verify-archive.mjs
```

It exits 1 if any object is missing or the wrong size, and — deliberately — if the
listing or the manifest is empty, because a check that checked nothing must not exit
green. Proven both ways on 2026-09-02: a manifest with one byte count off by one made it
fail naming the file; pointed at an empty bucket it failed with "ZERO objects" and
every file listed as missing; the real manifest passed 15 of 15 (18 of 18 after the second batch, 20 of 20 after the third, 21 of 21 after the diffuse-off re-export).

**Restore.** `wrangler r2 object get` handles objects under 315 MB (wrangler's
documented ceiling). The larger ones — ARISAN BRA at 1.54 GB, Cycling-Bib at 1.31 GB,
the tennis dress, the skinsuit export — need rclone, which Cloudflare's docs recommend
for large objects. Its credentials derive from the API token: the Access Key ID is the
token's **id**, the secret is the **SHA-256 of the token's value**
(developers.cloudflare.com/r2/api/tokens). Set them in the environment so nothing is
written to disk:

```bash
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private \
  RCLONE_CONFIG_R2_ENDPOINT=https://d357a1779c40da5f8c44931f12390cc8.r2.cloudflarestorage.com \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=<the token id> \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$(printf '%s' "$CLOUDFLARE_API_TOKEN" | shasum -a 256 | cut -d' ' -f1)
rclone copy r2:run-apparel-archive/fixed-glbs ./restored/fixed-glbs      # all five FIXED GLBs
rclone check ./restored/fixed-glbs r2:run-apparel-archive/fixed-glbs     # hash comparison
shasum -a 256 "./restored/fixed-glbs/ARISAN BRA.glb"                      # against the manifest's sha256
```

**Add a file.** `rclone copy <file> r2:run-apparel-archive/<prefix>/ --s3-upload-cutoff 100M --s3-chunk-size 100M`,
then append a row to the manifest with `stat -f%z` and `shasum -a 256`, run the verify
command, and commit both together.
From this machine rclone reaches R2 at ~300 kB/s (2026-09-03: 17 MB in 62 s, 2.9 GB in
~3 h). Upload the masters first with `--transfers 1`, log to a file (`--log-file`,
`--stats 60s`), and if a stats line reads `0 B/s` twice, restart with
`--s3-chunk-size 25M --s3-upload-concurrency 1` — files already landed are skipped.


**The robot writes here too, since 2026-09-03 (fix plan Rank 12, audit CI-01).** After
every successful shrink the Worker streams the raw CLO export from the ingest bucket
into this one under `raw-exports/robot/<ingest key>`, with `rawUploadId` and
`archivedAt` as custom metadata (`apps/shrink/src/archiveRaw.ts`; idempotent by key
and size; best-effort, reported at the end of the upload's `Report`). These copies
have no manifest row on purpose — nobody hand-verifies a robot's write — so
`scripts/verify-archive.mjs` lists them as one counted line
(`robot-archived raw exports … N object(s), X GB`) instead of "unverified". Anything
else outside the manifest is still reported as unverified.

## After any restore

1. `curl -f https://cms.wear-run.help/api/health` → `{"ok":true}`.
2. Open `https://viewer.wear-run.help/rxps/wine` — model loads, colourways switch, contact links work.
3. Log into `/admin` and spot-check a product + its media.
