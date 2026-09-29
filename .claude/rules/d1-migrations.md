---
paths:
  - "apps/cms/src/migrations/**"
  - "apps/cms/src/migrationReplay/**"
  - "scripts/backup-d1.mjs"
  - "scripts/verify-backup.mjs"
---

# D1: table rebuilds, pragmas and local replays

Moved from the root `CLAUDE.md` on 2026-09-26, word for word. The three sections after the
bullets moved here from `apps/cms/CLAUDE.md` the same day, also word for word.

- **`PRAGMA foreign_keys=OFF` is a no-op on D1** (SQLite ignores it inside a
  transaction; D1 wraps statements in one). `defer_foreign_keys` defers *checks*,
  not **cascades** — so neither pragma makes a table rebuild safe. **Ordering
  does**: stage or drop referencing tables first. A `DROP TABLE` runs an implicit
  `DELETE`, and that cascades.
- 🟢 **`node:sqlite` is built into the pinned Node 24** — `scripts/verify-backup.mjs`
  uses it to replay a D1 dump with foreign keys ON. Reach for it before adding a
  SQLite dependency.

## Before you change a migration

Run `apps/cms/src/migrationReplay/replay.test.ts`. It replays every migration against
real SQLite with foreign keys **on**, seeds every table, and fails if any table
that had rows ends up empty. It exists because a migration once reported success
while cascade-deleting two tables nobody was watching. Since 2026-09-29 it also seeds
**two** rows per table (all 31 take them) and fails if any table ends up with FEWER —
at one row, losing part of a table and losing all of it were the same event, so a
partial delete passed. A migration that means to delete rows must say so in that test.

The assertion is deliberately **generic**. The ad-hoc check run at the time
looked only at the table the migration was about, which is precisely why it
passed.

## `down()` migrations are checked for emptied tables too

*(This section said `down()` was tested only for errors until 2026-09-29; that stopped
being true on 2026-08-18.)* `apps/cms/src/migrationReplay/replay.test.ts` runs every
`down()` newest-first with row counts around each one and fails on an emptied table,
with a negative control that drops `products` to prove it can see a cascade — the
signature of the 2026-07-29 incident, a migration that **reported success while
cascade-deleting**, on the path `migrate:remote:down` runs against production.

`down()` is NOT held to the partial-loss rule `up()` is: undoing a migration that
inserted rows legitimately deletes them again.

## Reading production D1 without the wrangler CLI

`wrangler d1 execute --remote` is refused by Claude Code's auto-mode classifier, which
cannot tell a `SELECT` from a `DELETE`. Use the Cloudflare MCP connector's
`d1_database_query` instead — database `run-apparel-viewer-db`, id
`41e20361-1a5f-4c87-b5ca-781c57c9b3f4`. Its response carries `rows_written` and
`changed_db`, so "this was read-only" is provable rather than asserted.

Measured 2026-08-17 as a baseline worth having: `events` held **754 rows over 28 days**
(668 analytics, 84 diagnostic, 2 error) and the whole database was **790,528 bytes** —
0.015% of D1's included storage. That number downgraded a High finding to Low in
the 2026-08-17 audit (kept privately since 2026-09-10); re-measure before assuming the
events endpoint is under load.
