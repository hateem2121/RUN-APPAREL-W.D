#!/usr/bin/env node
/**
 * Prove a D1 backup actually restores, by restoring it.
 *
 * WHY. `nightly-backup.yml` exported a .sql file and uploaded it as an artifact, and
 * that was the whole of it — the only evidence the backup was usable was that
 * `wrangler d1 export` exited 0. A truncated upload, a dump cut off mid-INSERT, or a
 * schema the file cannot rebuild all exit 0 too, and every one of them is discovered
 * at the worst possible moment: during a restore, after the data is already gone.
 *
 * docs/BACKUP-RESTORE.md records that a human restore drill in 2026-07 found the
 * restore INSTRUCTIONS were broken. That was the right instinct and it happened once.
 * This is the same drill, every night, automatically.
 *
 * WHAT IT ASSERTS, strongest first:
 *
 *   1. The dump replays into a real SQLite database, and the RESTORED database then
 *      passes `PRAGMA foreign_key_check`. Not a parse — an execution. This is where a
 *      truncated file, an unbalanced quote or a row whose parent is missing actually
 *      fails. See `replay()` for why the check runs on the finished database rather
 *      than during the load — the short version is that a real `wrangler d1 export`
 *      inserts into a child table before it creates the parent, so loading with
 *      foreign keys ON rejects a perfectly good backup.
 *   2. Every table the dump claims to populate ends up with the row count the dump
 *      contains. A cascade during replay, or a statement silently skipped, shows up
 *      here as a shortfall. This matters because the root CLAUDE.md records that a
 *      DROP TABLE runs an implicit DELETE and that cascades — the exact mechanism
 *      behind the migration that "reported success" while emptying two tables nobody
 *      was watching.
 *   3. A named set of tables is non-empty. A syntactically perfect dump of an empty
 *      database is the failure that looks most like success.
 *
 * No new dependency: `node:sqlite` ships with Node 24, which this repo already pins.
 */

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

/**
 * Tables that must contain at least one row for the backup to be worth keeping.
 *
 * Kept SHORT on purpose. `events` is excluded — it is telemetry and is legitimately
 * empty on a quiet week, so requiring it would train someone to ignore this.
 * `raw_uploads` is excluded for the same reason: the ingest bucket expires after 14
 * days, so an empty table there is normal rather than alarming.
 *
 * These four cannot be empty on a live site: no products means no garment, no users
 * means nobody can log in to fix it, `site_settings` carries the catalogue and contact
 * details every "reference unavailable" page falls back to, and no `media` means the
 * product has no GLB and no posters — a backup that restores a catalogue with nothing
 * to look at.
 *
 * Names are the real D1 tables (verified against apps/cms/src/migrations); the test
 * beside this asserts they still exist in the schema, so this list cannot drift into
 * checking tables that were renamed away.
 */
export const MUST_NOT_BE_EMPTY = ['products', 'users', 'site_settings', 'media']

/**
 * VOLUME floors — L20-03, 2026-08-31.
 *
 * WHY "NOT EMPTY" IS NOT ENOUGH. `MUST_NOT_BE_EMPTY` catches a table that
 * cascade-deleted to zero, which is the 2026-07-29 incident it was written for. It
 * cannot see a dump that restored 3 products out of 67 — one row is not zero rows,
 * so the check passes and the nightly job reports a good backup. The whole value of
 * a backup is the part that would be missing.
 *
 * MEASURED, not chosen, against the 2026-08-29 dump: products 67, media 21,
 * users 2, site_settings 1, products_colourways 10. The floors below sit roughly a
 * quarter under each, so ordinary catalogue work never trips them and losing half
 * the catalogue always does.
 *
 * ⚠️ RAISE THESE WHEN THE CATALOGUE GROWS; do not lower one to make a red run go
 * green. A floor lowered to fit a bad backup is a floor that has stopped meaning
 * anything — the same rule as the coverage floors in scripts/check-coverage.mjs.
 */
export const MINIMUM_ROWS = {
  products: 50,
  media: 15,
  products_colourways: 5,
  users: 1,
}

/**
 * Tables whose row count is a FACT, not a range.
 *
 * `site_settings` is a Payload global: exactly one row, always. Two means a
 * migration duplicated it; zero means it is gone. Both are silent today.
 */
export const EXACT_ROWS = { site_settings: 1 }

/**
 * Count the INSERT statements per table in a dump, i.e. what the file CLAIMS it will
 * restore. Deliberately textual and deliberately conservative: it counts statements,
 * not tuples, so a multi-row `INSERT INTO t VALUES (…),(…)` counts as one. That
 * under-counts, which is the safe direction — the check is "at least what the file
 * claims", and under-counting can only make it more lenient, never falsely fail.
 *
 * @param {string} sql
 * @returns {Map<string, number>}
 */
export function claimedInserts(sql) {
  const counts = new Map()
  for (const match of sql.matchAll(/^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`[]?(\w+)/gim)) {
    const table = match[1]
    counts.set(table, (counts.get(table) ?? 0) + 1)
  }
  return counts
}

/**
 * Replay a dump into a fresh in-memory database and report what is actually there.
 *
 * @param {string} sql
 * @returns {{ tables: Map<string, number>, error: string | null }}
 */
export function replay(sql) {
  const db = new DatabaseSync(':memory:')
  try {
    /**
     * ⚠️ RESTORE WITH FOREIGN KEYS OFF, THEN CHECK THE RESULT. Both halves matter and
     * the first one is counter-intuitive — this was written the other way round and
     * was wrong.
     *
     * `wrangler d1 export` INTERLEAVES its output: it emits `CREATE TABLE
     * users_sessions` (which carries a foreign key to `users`), INSERTs rows into it,
     * and only afterwards emits `CREATE TABLE users`. With `foreign_keys = ON` that
     * INSERT dies on `no such table: main.users`, because SQLite must resolve the
     * parent table at DML time even when the CHECK is deferred. The dump's own
     * opening `PRAGMA defer_foreign_keys=TRUE` does not save it, and neither does
     * wrapping the replay in one transaction — both were tried against a real
     * production dump on 2026-08-13.
     *
     * That is the same family as the trap root CLAUDE.md already records — "PRAGMA
     * foreign_keys=OFF is a no-op on D1 … `defer_foreign_keys` defers *checks*, not
     * *cascades*" — one more instance of a deferral pragma meaning less than it
     * looks like it means.
     *
     * So enforcement moves to where it is strictly stronger: `PRAGMA
     * foreign_key_check` runs over the FINISHED database and reports every row whose
     * parent is missing, regardless of what order anything was inserted in. Checking
     * the restored RESULT is what actually matters; checking the insertion sequence
     * was only ever a proxy for it.
     *
     * HOW THIS WAS FOUND, because it is the point: every unit test passed while this
     * was broken. The fixtures were hand-written parents-first, so none of them could
     * exhibit the failure — precisely the pattern CLAUDE.md names as the cause of
     * three consecutive production bugs. It surfaced the first time the script was
     * pointed at a real export.
     */
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(sql)

    const violations = db.prepare('PRAGMA foreign_key_check').all()
    if (violations.length > 0) {
      const sample = violations
        .slice(0, 5)
        .map((v) => `${v.table} row ${v.rowid} -> missing parent in ${v.parent}`)
        .join('; ')
      db.close()
      return {
        tables: new Map(),
        kind: 'integrity',
        error:
          `${violations.length} foreign-key violation(s) in the RESTORED database: ${sample}. ` +
          'The dump loads, but rows in it point at parents that are not there.',
      }
    }
  } catch (error) {
    return {
      tables: new Map(),
      kind: 'unreadable',
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const tables = new Map()
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
  for (const row of names) {
    const name = String(row.name)
    const { c } = db.prepare(`SELECT count(*) AS c FROM "${name}"`).get()
    tables.set(name, Number(c))
  }
  db.close()
  return { tables, error: null }
}

/**
 * The whole verdict. Pure — takes SQL text, returns problems — so every failure mode
 * below can be tested with a string instead of a 40 MB production dump.
 *
 * @param {string} sql
 * @param {{ mustNotBeEmpty?: string[], minimumRows?: Record<string, number>, exactRows?: Record<string, number> }} [options]
 * @returns {{ ok: boolean, problems: string[], tables: Map<string, number> }}
 */
export function verify(
  sql,
  { mustNotBeEmpty = MUST_NOT_BE_EMPTY, minimumRows = MINIMUM_ROWS, exactRows = EXACT_ROWS } = {},
) {
  const problems = []

  if (!sql.trim()) {
    return { ok: false, problems: ['The dump is empty (0 bytes of SQL).'], tables: new Map() }
  }

  const { tables, error, kind } = replay(sql)
  if (error) {
    // The two failures need different advice, and giving the wrong one sends whoever
    // reads this alert looking in the wrong place. A truncation is an upload problem;
    // an integrity violation means the dump is complete and the DATA is wrong, which
    // is a far more interesting thing to be told at 3 a.m.
    const guidance =
      kind === 'integrity'
        ? '  The file is complete and loadable — the problem is in the data. Something ' +
          'deleted parent rows without their children, most likely a migration or a ' +
          'manual DELETE. This backup restores, but restores something already broken.'
        : '  This is what a truncated upload or a mid-statement cut looks like. The ' +
          'artifact from this run should not be trusted as a recovery point.'

    return {
      ok: false,
      problems: [`The dump does NOT restore cleanly: ${error}\n${guidance}`],
      tables,
    }
  }

  if (tables.size === 0) {
    problems.push('The dump replayed but created no tables at all.')
  }

  for (const [table, claimed] of claimedInserts(sql)) {
    const actual = tables.get(table)
    if (actual === undefined) {
      problems.push(`${table}: the dump inserts into it, but it does not exist after replay.`)
    } else if (actual < claimed) {
      problems.push(
        `${table}: the dump contains ${claimed} INSERT statement(s) but only ${actual} row(s) ` +
          'survived the replay — something deleted rows during restore (a cascade, most likely).',
      )
    }
  }

  for (const table of mustNotBeEmpty) {
    const actual = tables.get(table)
    if (actual === undefined) {
      problems.push(`${table}: missing entirely — this table must exist in any usable backup.`)
    } else if (actual === 0) {
      problems.push(
        `${table}: restored with 0 rows. A syntactically perfect dump of an empty database ` +
          'is the failure that looks most like success.',
      )
    }
  }

  // VOLUME — L20-03. "not zero" passes on 3 products out of 67, and the missing 64
  // are the entire reason anyone keeps a backup.
  for (const [table, floor] of Object.entries(minimumRows)) {
    const actual = tables.get(table)
    if (actual === undefined) continue // already reported by the checks above
    if (actual < floor) {
      problems.push(
        `${table}: restored ${actual} rows, below the floor of ${floor}. Not empty is not the ` +
          'same as intact — this dump is missing data that a real one would carry. Check the ' +
          'export before trusting this as a recovery point.',
      )
    }
  }

  // Counts that are facts rather than ranges. A Payload global has exactly one row;
  // two means a migration duplicated it, and nothing else would say so.
  for (const [table, expected] of Object.entries(exactRows)) {
    const actual = tables.get(table)
    if (actual === undefined) continue
    if (actual !== expected) {
      problems.push(
        `${table}: restored ${actual} rows where exactly ${expected} is correct. This is a ` +
          'global — more than one row means something duplicated it.',
      )
    }
  }

  return { ok: problems.length === 0, problems, tables }
}

function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('usage: node scripts/verify-backup.mjs <dump.sql>')
    process.exit(2)
  }

  let sql
  try {
    sql = readFileSync(path, 'utf8')
  } catch (error) {
    console.error(`::error::Cannot read ${path}: ${error.message}`)
    process.exit(1)
  }

  console.log(`[verify-backup] replaying ${path} (${(sql.length / 1024).toFixed(0)} KB)`)
  const { ok, problems, tables } = verify(sql)

  const rows = [...tables.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [table, count] of rows) {
    console.log(`  ${table.padEnd(32)} ${String(count).padStart(7)} rows`)
  }

  if (!ok) {
    for (const problem of problems) console.error(`::error::${problem}`)
    process.exit(1)
  }
  console.log(`[verify-backup] restored cleanly: ${rows.length} tables, 0 foreign-key violations.`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
