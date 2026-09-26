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

Run every command from the repo root. Every command below uses the
`npx --yes pnpm@10.34.5` form, because bare `pnpm` is unreliable here (a guard rewrites a
bare one typed into the Bash tool, but not one a script runs).

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

⚠️ **THE SLUG IS `rxps`, and a wrong one makes this whole step a no-op.** A wrong slug
returns **404, 84 bytes, `{"error":"not_found"}`**, and two 404s diff to nothing, so
step 5's "empty diff is the pass condition" passes *by construction* — the single check
that caught the last data-loss incident, passing no matter what the migration did to the
database.

```bash
curl -s https://cms.wear-run.help/api/public/viewer/rxps/wine > /tmp/rxps-wine-before.json
```

Sanity-check it is real data, not an error page — and do it every time, because
that is exactly the check that catches a wrong slug:

```bash
node -e "const d=require('/tmp/rxps-wine-before.json'); if (d.error) { console.error('REFUSED: got an error payload, not the product:', d); process.exit(1) } console.log(d.product.productCode, d.colourways.length + ' colourways,', JSON.stringify(d).length + ' bytes')"
```

Expect `R-XPS 5 colourways, ~5265 bytes` — measured 2026-09-08, unchanged on 2026-09-24.

⚠️ **Longer is fine; SHORTER, or a non-zero exit, is a stop.** The payload grows when
sales copy is added (it did on 2026-09-08), so "longer than expected" is the reading
that gets waved through. Re-measure this line whenever `slug` or `productCode` changes:
they are different fields, and a stale expected value leaves the reader unable to tell
a real regression from a documentation lag.

⚠️ A **403 from a `wear-run.help` host is inconclusive, not a failure** — free-plan
Bot Fight Mode intermittently blocks datacenter traffic. From a laptop it should be
fine; if you get one, retry rather than concluding anything.

### 3. Verify the branch is actually green

```bash
npx --yes pnpm@10.34.5 lint && npx --yes pnpm@10.34.5 typecheck && npx --yes pnpm@10.34.5 test && npx --yes pnpm@10.34.5 build
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
npx --yes pnpm@10.34.5 eval:artwork
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

`media.wear-run.help` is an R2 custom domain behind a 30-day edge Cache Rule. A miss
recorded before the file existed used to be served for weeks; since 2026-09-03 every
error from this host is `no-store` (a missing `.glb` answered `404 no-store BYPASS` on
2026-09-24), so a 404 now means the object is missing or its key differs. `HEAD` and
`GET` still land on different cache entries — a `HEAD` returning 200 proves nothing.

```bash
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' <the model URL>
```

Plain `GET`, bare URL, no `?v=`. If it 404s, confirm the object exists under exactly
that key — `--remote` is required, or wrangler reads LOCAL storage and reports a real
object as missing (`<key>` is the URL's path without the leading `/`):

```bash
npx --yes wrangler@4.140.0 r2 object get "run-apparel-viewer-media/<key>" --remote --file /tmp/r2-check
```

A **Custom Purge of that one URL** should not be needed for a 404 any more; it still
applies when a stale 200 is being served.

## Rollback

`docs/RUNBOOK.md` → "Undoing a bad deploy". Read the warning there first:
**rollback does not undo a database migration.**
