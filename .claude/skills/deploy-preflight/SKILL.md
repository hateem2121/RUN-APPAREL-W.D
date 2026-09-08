---
name: deploy-preflight
description: Walk the pre-deploy safety steps for this repo in order — D1 backup, the before-capture of the live payload, the merge, then the after-diff. Use before merging anything to main that touches the CMS, a migration, or the viewer.
disable-model-invocation: true
---

# Deploy preflight

**Only the owner starts this.** It touches production and it is deliberately not
model-invocable — see the frontmatter.

Merging to `main` runs the pre-deploy D1 migrate and deploys CMS + viewer. There is
no separate "deploy" button to reconsider at; the merge *is* the deploy.

## Why the before/after capture is the whole point

The migration logs said success during the last data-loss incident. What caught it
was diffing one live API response before and after. Backups make it *recoverable*;
the capture is what makes it *noticed*. Do not skip step 2 because step 1 succeeded.

## Steps

Run every command from the repo root. `pnpm` is not on PATH here — every command
below uses the `npx --yes pnpm@10.33.0` form, and a guard will refuse the bare one.

### 1. Back up D1

```bash
node scripts/backup-d1.mjs
```

No arguments means `--remote`, i.e. **production** — that is the one you want here.
It writes a timestamped `.sql` under `backups/d1/` and needs Cloudflare auth
(`wrangler login`, or `CLOUDFLARE_API_TOKEN` in the environment).

Confirm it is not zero bytes before continuing:

```bash
ls -lh backups/d1 | tail -3
```

See `docs/BACKUP-RESTORE.md` for the restore path — read it now, not during an
incident.

### 2. Capture the live payload BEFORE

⚠️ **THE SLUG IS `rxps`. THIS FILE SAID `n001` UNTIL 2026-08-17 AND THAT MADE THIS
WHOLE STEP A NO-OP.** Measured that day: `n001/wine` returns **404, 84 bytes,
`{"error":"not_found"}`**; `rxps/wine` returns the real 5-colourway payload at
4,264 bytes. Two 404s diff to nothing, so step 5's "empty diff is the pass
condition" was satisfied *by construction* — the single check that caught the last
data-loss incident would have passed no matter what the migration did to the
database. The rename happened on 2026-08-15 and the scripts and `uptime.yml` were
fixed the same day; this file was missed.

```bash
curl -s https://cms.wear-run.help/api/public/viewer/rxps/wine > /tmp/rxps-wine-before.json
```

Sanity-check it is real data, not an error page — and do it every time, because
that is exactly the check that would have caught the stale slug above:

```bash
node -e "const d=require('/tmp/rxps-wine-before.json'); if (d.error) { console.error('REFUSED: got an error payload, not the product:', d); process.exit(1) } console.log(d.product.productCode, d.colourways.length + ' colourways,', JSON.stringify(d).length + ' bytes')"
```

Expect `R-XPS 5 colourways, ~5265 bytes` — MEASURED 2026-09-08.

⚠️ This said `~4477 bytes` until then. The payload GREW because the per-garment
sales copy landed (`customisationIntro`, `performanceFeatures`); nothing was lost.
Recording it because a stale expected value is the failure this file already warns
about twice below, and "longer than expected" is the reading that gets waved
through — the stop condition is SHORTER, or a non-zero exit.

⚠️ This line said `RXPS ... ~4264 bytes` until then. `productCode` went
`RXPS` -> `R-XPS` on 2026-08-17 while the SLUG stayed `rxps`, so that rename has
now rotted this file TWICE (see the `n001` warning above). A stale expected value
makes the one check that caught the last data-loss incident ambiguous: the reader
cannot tell a real regression from a documentation lag. Re-measure this line
whenever either field changes. Anything shorter, or a non-zero exit, is a stop.

⚠️ A **403 from a `wear-run.help` host is inconclusive, not a failure** — free-plan
Bot Fight Mode intermittently blocks datacenter traffic. From a laptop it should be
fine; if you get one, retry rather than concluding anything.

### 3. Verify the branch is actually green

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test && npx --yes pnpm@10.33.0 build
```

`pnpm build` is not optional and is not covered by typecheck — that gap is
documented in CLAUDE.md and a dependency change has already gone through it.

The shrink container is **not** a workspace member, so the above skips it:

```bash
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit && cd -
```

If a preset or anything under `tools/asset-pipeline/` changed, also run the
artwork eval **on an idle machine** (a busy one reads ~0.48pp low):

```bash
npx --yes pnpm@10.33.0 eval:artwork
```

### 4. Merge

Merge to `main`. Watch the run:

```bash
gh run watch
```

### 5. Capture AFTER, and diff

```bash
curl -s https://cms.wear-run.help/api/public/viewer/rxps/wine > /tmp/rxps-wine-after.json
diff <(node -e "console.log(JSON.stringify(require('/tmp/rxps-wine-before.json'),null,1))") \
     <(node -e "console.log(JSON.stringify(require('/tmp/rxps-wine-after.json'),null,1))")
```

**Empty diff is the pass condition.** Any disappearance of colourways, an emptied
field, or a shorter response is the signal to stop and consider rollback.

### 6. If a model URL changed, fetch it the way a browser will

A cached 404 is real here: `media.wear-run.help` is an R2 custom domain with a
30-day edge Cache Rule, so a miss recorded before the file existed is served for
weeks. `HEAD` and `GET` land on different cache entries — a `HEAD` returning 200
proves nothing.

```bash
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' <the model URL>
```

Plain `GET`, bare URL, no `?v=`. If it 404s, the fix is a **Custom Purge of that
one URL** in Cloudflare — the object is almost certainly fine in R2.

## Rollback

`docs/RUNBOOK.md` → "Undoing a bad deploy". Read the warning there first:
**rollback does not undo a database migration.**
