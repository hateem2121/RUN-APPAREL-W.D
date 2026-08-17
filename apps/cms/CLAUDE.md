# CLAUDE.md — apps/cms

Split out of the repo-root `CLAUDE.md` on 2026-08-15 by `/doctor`, for the same
reason the viewer traps moved on 2026-08-10 and the pipeline's on 2026-08-12: the
root file is loaded into *every* session in this repo, and these are only ever
needed by a session actually touching the CMS. They load automatically the moment
you touch `apps/cms/`. Paths below are repo-root-relative, as they were before the
move. Nothing below was reworded.

Root `CLAUDE.md` still holds the cross-cutting CMS material — the D1 pragma trap,
`fileColours` being deliberately outside `GATED_FIELDS`, and
**"Before you delete anything in the CMS"**, which stayed there on purpose because
it governs `apps/shrink/src/cms.ts` and `scripts/find-orphan-media.mjs` as well as
this app, and would stop loading for the shrink half if it moved here. Read the
root file first.

## Traps

- **Any Payload CLI task touching production D1 must set `NODE_ENV=production`**,
  or Payload runs a dev-mode schema push against it.
- **Put nothing but migrations in `apps/cms/src/migrations/`.** Payload's
  `readMigrationFiles` imports *every* `.ts`/`.js` there except `index.ts` and
  treats each as a migration. A test file added there on 2026-07-31 was imported
  during `migrate:remote`, ran `describe()` with no vitest runner, and stopped
  the production deploy. `src/migrationReplay/migrations.test.ts` now guards it.

## Writing products from a script

**Go through the REST API, never D1.** `Authorization: users API-Key <key>` — the
same header `apps/shrink/src/cms.ts` already uses. Every product write has to pass
`Products.beforeChange` (it derives `variantsVerified`, runs `assertPublishable`,
and writes an Events row when a live product loses its colour mapping), plus the
`beforeValidate` hooks that uppercase a code and derive a slug. A direct INSERT
skips all of it. `scripts/import-catalogue-products.mjs` is the worked example:
dry-run by default, idempotent by `productCode`, and it prints Payload's INNER
validation error (`errors[0].data.errors[]`) because the outer message is the
useless "The following field is invalid" with no field named.

⚠️ **A Payload API key cannot be read back after it is created.** It is encrypted
in D1 with `PAYLOAD_SECRET`, and the robot's copy lives in a Cloudflare secret
(`CMS_ROBOT_API_KEY` on `apps/shrink`) which Cloudflare will not return.
**Regenerating the robot's key breaks the shrink pipeline** — issue a key on a
different user instead, and untick it afterwards.

⚠️ **Never send `slug` when updating an existing product.** It is printed on
physical QR tags; `Products.ts` and `fields/colourways.ts` both enforce
suggest-never-correct. `productCode` and `sortOrder` are safe — neither is in a
URL. Send `sortOrder` too, or a re-run will not converge on your dataset.

**The whole printed catalogue is imported as of 2026-08-17** — the CMS holds
**67 products, not one**. 66 are drafts with no colourways, deliberately: the CLO
file names the colours (`ImportColoursFromFile`), so guessing 335 tag slugs was
refused. Three defects are in the PDF itself, not the data: its product codes are
unusable (67 products share 26; `R-XPB` alone is printed on 26 garments, so the
CMS codes are generated and do NOT match the book), pages 66/67 have their
material blocks crossed (which dropped a genuine-leather claim from a polyurethane
jacket — unsettled), and the index contradicts the artwork on two garments.
`scripts/catalogue-products.json` carries `sourcePage` on every row so any value
can be checked against the spread rather than trusted.

⚠️ **The PDF text layer drops ligatures** — `ti`, `fl`, `fi` all vanish, so
"Athletic" extracts as "Athle c" and "flatlock" as "atlock". Anything that
diffs that text against real copy must normalise, or it reports dozens of
phantom differences. No `pdftotext`/`mutool` on this machine; `pip install
--target ./pylibs pypdf` works.

## Before you change a migration

Run `apps/cms/src/migrationReplay/replay.test.ts`. It replays every migration against
real SQLite with foreign keys **on**, seeds every table, and fails if any table
that had rows ends up empty. It exists because a migration once reported success
while cascade-deleting two tables nobody was watching.

The assertion is deliberately **generic**. The ad-hoc check run at the time
looked only at the table the migration was about, which is precisely why it
passed.
