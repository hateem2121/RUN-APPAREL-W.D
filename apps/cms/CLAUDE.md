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

## Before you change a migration

Run `apps/cms/src/migrationReplay/replay.test.ts`. It replays every migration against
real SQLite with foreign keys **on**, seeds every table, and fails if any table
that had rows ends up empty. It exists because a migration once reported success
while cascade-deleting two tables nobody was watching.

The assertion is deliberately **generic**. The ad-hoc check run at the time
looked only at the table the migration was about, which is precisely why it
passed.
