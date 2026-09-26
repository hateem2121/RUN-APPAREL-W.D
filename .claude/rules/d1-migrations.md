---
paths:
  - "apps/cms/src/migrations/**"
  - "apps/cms/src/migrationReplay/**"
  - "scripts/backup-d1.mjs"
  - "scripts/verify-backup.mjs"
---

# D1: table rebuilds, pragmas and local replays

Moved from the root `CLAUDE.md` on 2026-09-26, word for word. `apps/cms/CLAUDE.md` holds
the rest of the migration rules ("Before you change a migration").

- **`PRAGMA foreign_keys=OFF` is a no-op on D1** (SQLite ignores it inside a
  transaction; D1 wraps statements in one). `defer_foreign_keys` defers *checks*,
  not **cascades** — so neither pragma makes a table rebuild safe. **Ordering
  does**: stage or drop referencing tables first. A `DROP TABLE` runs an implicit
  `DELETE`, and that cascades.
- 🟢 **`node:sqlite` is built into the pinned Node 24** — `scripts/verify-backup.mjs`
  uses it to replay a D1 dump with foreign keys ON. Reach for it before adding a
  SQLite dependency.
