---
paths:
  - "scripts/**"
  - "apps/cms/scripts/**"
  - "apps/shrink/src/cms.ts"
---

# Writing products, media and colours from a script

Moved from `apps/cms/CLAUDE.md` on 2026-09-26, word for word, so it loads only when you open
the files it governs (`docs/CLAUDE-MD-MAINTENANCE.md` explains the mechanism).

## Writing products from a script

🟡 **Go through the REST API, never D1.** `Authorization: users API-Key <key>` — the
same header `apps/shrink/src/cms.ts` already uses. Every product write has to pass
`Products.beforeChange` (it derives `variantsVerified`, runs `assertPublishable`,
and writes an Events row when a live product loses its colour mapping), plus the
`beforeValidate` hooks that uppercase a code and derive a slug. A direct INSERT
skips all of it. `scripts/import-catalogue-products.mjs` is the worked example:
dry-run by default, idempotent by `productCode`, and it prints Payload's INNER
validation error (`errors[0].data.errors[]`) because the outer message is the
useless "The following field is invalid" with no field named.

🟡 **A Payload API key cannot be read back after it is created.** It is encrypted
in D1 with `PAYLOAD_SECRET`, and the robot's copy lives in a Cloudflare secret
(`CMS_ROBOT_API_KEY` on `apps/shrink`) which Cloudflare will not return.
🟡 **Regenerating the robot's key breaks the shrink pipeline** — issue a key on a
different user instead, and untick it afterwards.
🟡 **Rotating `PAYLOAD_SECRET` kills EVERY API key, the robot's included**, and
*Generate new API key* stores nothing until **Save**. Follow `docs/RUNBOOK.md` →
"Rotating PAYLOAD_SECRET" (2026-09-10: skipping either stranded a job on Queued).

🟡 **Never send `slug` when updating an existing product.** It is printed on
physical QR tags; `Products.ts` and `fields/colourways.ts` both enforce
suggest-never-correct. `productCode` and `sortOrder` are safe — neither is in a
URL. Send `sortOrder` too, or a re-run will not converge on your dataset.

**The whole printed catalogue was imported on 2026-08-17** — 🟢 **67 products, not
one**, 66 of them then drafts with no colourways, deliberately: the CLO
file names the colours (`ImportColoursFromFile`), so guessing 335 tag slugs was
refused. Three defects are in the PDF itself, not the data: its product codes are
unusable (67 products share 26; `R-XPB` alone is printed on 26 garments, so the
CMS codes are generated and do NOT match the book), pages 66/67 have their
material blocks crossed (which dropped a genuine-leather claim from a polyurethane
jacket — unsettled), and the index contradicts the artwork on two garments.
`scripts/catalogue-products.json` carries `sourcePage` on every row so any value
can be checked against the spread rather than trusted.

🟢 **The PDF text layer drops ligatures** — `ti`, `fl`, `fi` all vanish, so
"Athletic" extracts as "Athle c" and "flatlock" as "atlock". Anything that
diffs that text against real copy must normalise, or it reports dozens of
phantom differences. No `pdftotext`/`mutool` on this machine; `pip install
--target ./pylibs pypdf` works.

## Uploading media and writing array fields

`POST /api/media` is **multipart**, not JSON: `-F "file=@x.webp;type=image/webp"` plus
`-F '_payload={"alt":"…"}'` for the other fields. The filename becomes the R2 key, so
name it the way the existing objects are named (`<product>-<colour>-poster.webp`).
`altText` on a colourway auto-fills from `productName` + `displayName` via a
`beforeValidate` hook, so leave it out rather than retyping it.

🟡 **A PATCH to an array field REPLACES THE WHOLE ARRAY.** Fetch the product first,
change only the field you mean to, and send **every row back with its `id`** — or
Payload drops the rows you omitted. Row order decides the default colourway and each
`slug` is printed on a physical QR tag, so a partial send is silent data loss. Print
the before/after per row and assert the order is unchanged *before* sending.

🟡 **zsh globs `[` in a URL.** `where[slug][equals]=x` dies with
`curl: (3) bad range in URL`. Percent-encode (`where%5Bslug%5D%5Bequals%5D=`) or quote it.

After an upload, fetch the object with a 🟡 **plain GET, never HEAD** — see the cached-404
trap in the root file. A fresh upload answers `200` with `cf-cache-status: MISS`.

## Writing to a product from a script — four things measured 2026-09-04

- **🟡 The shrink robot REFUSES to attach a model or import colours to a PUBLISHED product** —
  "swapping the model under a published page is your decision, not the robot's"
  (`apps/shrink/src/colourImport.ts`, and the same refusal for `glbAsset`). So a republish is
  TWO acts: the robot produces the Media doc, then a human PATCHes `glbAsset`. Do not read a
  `ready` raw upload as "the live page changed" — eleven garments went through on 2026-09-04
  and not one attached itself.
- **`retry` only fires on a false → true TRANSITION** (`rawUploadRetry.ts` → `retryDecision`:
  `doc.retry === true && previousDoc.retry !== true`). PATCHing `{retry:true}` onto a row that
  is already `true` returns **200 and does nothing at all**. Reset it to `false`, then tick it.
- **`sortOrder` is a plain `number` with no uniqueness rule**, so **10.5** inserts a product
  between 10 and 11 without renumbering the other 67. That is how `R-AJM` landed directly
  after `R-AJ`.
- **🟢 A corrected export now starts from local disk, always.** Until 2026-09-24 one
  usually already sat in R2 under `run-apparel-archive/fixed-glbs/…`, and
  `scripts/ingest-from-archive.mjs` started a shrink from an S3 `CopyObject` there —
  measured 16.9 MB in 4.9 s and 1.71 GiB in 110 s, inside Cloudflare. That archive bucket
  was retired by owner decision (docs/BACKUP-RESTORE.md); the script is gone with it, so
  every re-ingestion is now a fresh upload from the owner's Mac, the same as a first-time
  garment — `scripts/ingest-local-glb.mjs`, or a browser upload through the CMS at
  ~300 kB/s. 🟢 Its `clientUploadContext` must be TRUTHY, or `@payloadcms/storage-r2`
  skips its own >50 MB short-circuit and the CMS Worker tries to buffer the whole object
  to satisfy a create.
