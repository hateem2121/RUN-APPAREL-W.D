import { DatabaseSync } from 'node:sqlite'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'

/**
 * A local SQLite stand-in for D1, so migrations can be replayed in a test.
 *
 * WHY THIS EXISTS. On 2026-07-29 a migration that rebuilt `products` reported
 * success, brought the colours across intact, and silently cascade-deleted
 * `products_performance_features` and `products_customisation_steps` — the live
 * page lost its "Performance" list and its build steps, and nothing anywhere
 * said so. It was caught by eye and restored from a pre-deploy backup.
 *
 * The session notes record the fix as "the replay harness fails loudly if any
 * child table ends up empty". No such harness was ever committed, so the
 * incident could recur exactly as before. This is it.
 *
 * The load-bearing detail is that the assertion is GENERIC. The ad-hoc check run
 * at the time only looked at the table the migration was about, which is
 * precisely why it passed while two other tables were being emptied. Here every
 * table is seeded and every table is checked.
 *
 * FOREIGN KEYS ARE ON. That is not incidental — it is the whole mechanism. D1
 * enforces `ON DELETE CASCADE` immediately, and `PRAGMA defer_foreign_keys`
 * defers the *checks*, not the cascades. A harness with foreign keys off would
 * have happily passed the migration that caused the incident.
 */

/** The subset of drizzle's SQL object the migrations use. */
type SqlQuery = Parameters<SQLiteSyncDialect['sqlToQuery']>[0]

export interface FakeDb {
  run: (query: SqlQuery) => void
  get: <T>(query: SqlQuery) => T | undefined
  all: <T>(query: SqlQuery) => T[]
}

export interface MigrationArgs {
  db: FakeDb
  payload: {
    logger: { warn: (m: string) => void; info: (m: string) => void; error: (m: string) => void }
  }
  req: Record<string, unknown>
}

export interface Migration {
  name: string
  up: (args: never) => Promise<void>
  down: (args: never) => Promise<void>
}

const dialect = new SQLiteSyncDialect()

/** Open an in-memory database with the same foreign-key behaviour D1 has. */
export function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys = ON;')
  return database
}

/**
 * Wrap a database as the `db` object migrations are handed.
 *
 * `run` uses `exec` for parameterless SQL because Payload's generated migrations
 * pack many statements into one template literal, and `prepare` only ever
 * compiles the first one — silently skipping the rest, which would make the
 * harness pass migrations it had barely executed.
 */
export function makeDb(database: DatabaseSync): FakeDb {
  return {
    run: (query) => {
      const { sql, params } = dialect.sqlToQuery(query)
      if (params.length === 0) database.exec(sql)
      else database.prepare(sql).run(...(params as never[]))
    },
    get: <T>(query: SqlQuery) => {
      const { sql, params } = dialect.sqlToQuery(query)
      return database.prepare(sql).get(...(params as never[])) as T | undefined
    },
    all: <T>(query: SqlQuery) => {
      const { sql, params } = dialect.sqlToQuery(query)
      return database.prepare(sql).all(...(params as never[])) as T[]
    },
  }
}

/** Captured log lines, so a test can assert a migration warned when it should. */
export interface CapturedLogs {
  warn: string[]
  info: string[]
  error: string[]
}

export function makeMigrationArgs(database: DatabaseSync): {
  args: MigrationArgs
  logs: CapturedLogs
} {
  const logs: CapturedLogs = { warn: [], info: [], error: [] }
  return {
    args: {
      db: makeDb(database),
      payload: {
        logger: {
          warn: (m) => logs.warn.push(m),
          info: (m) => logs.info.push(m),
          error: (m) => logs.error.push(m),
        },
      },
      req: {},
    },
    logs,
  }
}

/** User tables, excluding SQLite internals and Payload's own migration bookkeeping. */
export function listTables(database: DatabaseSync): string[] {
  return database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'
       ORDER BY name`,
    )
    .all()
    .map((row) => (row as { name: string }).name)
    .filter((name) => name !== 'payload_migrations')
}

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
  dflt_value: unknown
}

interface ForeignKeyInfo {
  table: string
  from: string
  to: string | null
}

/**
 * Order tables so every table comes after the ones it references, and seeding a
 * child never fails on a parent that does not exist yet. Cycles (which SQLite
 * permits) fall back to declaration order rather than looping forever.
 */
function topologicalOrder(database: DatabaseSync, tables: string[]): string[] {
  const dependencies = new Map<string, Set<string>>()
  for (const table of tables) {
    const keys = database
      .prepare(`PRAGMA foreign_key_list(\`${table}\`)`)
      .all() as unknown as ForeignKeyInfo[]
    dependencies.set(
      table,
      new Set(keys.map((k) => k.table).filter((t) => t !== table && tables.includes(t))),
    )
  }

  const ordered: string[] = []
  const placed = new Set<string>()
  let progress = true
  while (ordered.length < tables.length && progress) {
    progress = false
    for (const table of tables) {
      if (placed.has(table)) continue
      const deps = dependencies.get(table) ?? new Set()
      if ([...deps].every((d) => placed.has(d))) {
        ordered.push(table)
        placed.add(table)
        progress = true
      }
    }
  }
  for (const table of tables) if (!placed.has(table)) ordered.push(table)
  return ordered
}

/** A value that satisfies a column's declared type and NOT NULL constraint. */
function valueFor(column: ColumnInfo, index: number): string | number {
  const type = column.type.toUpperCase()
  if (type.includes('INT')) return index + 1
  if (
    type.includes('REAL') ||
    type.includes('FLOA') ||
    type.includes('DOUB') ||
    type.includes('NUMERIC')
  ) {
    return index + 1
  }
  // Payload stores array-row ids and enums as text; a short unique string suits both.
  return `seed-${index + 1}`
}

export interface SeedResult {
  /** Tables that received a row, with the id used. */
  seeded: Map<string, string | number>
  /** Tables that could not be seeded (unsatisfiable constraints), for reporting. */
  skipped: string[]
}

/**
 * Put one row in every table, parents before children.
 *
 * Deliberately generic rather than a hand-written fixture: a fixture only covers
 * the tables whoever wrote it thought about, and the incident happened precisely
 * in the tables nobody thought about.
 */
export function seedEveryTable(database: DatabaseSync): SeedResult {
  const tables = topologicalOrder(database, listTables(database))
  const seeded = new Map<string, string | number>()
  const skipped: string[] = []

  for (const [index, table] of tables.entries()) {
    const columns = database
      .prepare(`PRAGMA table_info(\`${table}\`)`)
      .all() as unknown as ColumnInfo[]
    const foreignKeys = database
      .prepare(`PRAGMA foreign_key_list(\`${table}\`)`)
      .all() as unknown as ForeignKeyInfo[]
    const fkByColumn = new Map(foreignKeys.map((k) => [k.from, k.table]))

    const names: string[] = []
    const values: (string | number | null)[] = []
    for (const column of columns) {
      // An INTEGER PRIMARY KEY is an alias for rowid — let SQLite assign it.
      const isAutoId = column.pk === 1 && column.type.toUpperCase().includes('INT')
      if (isAutoId) continue

      const parent = fkByColumn.get(column.name)
      if (parent) {
        const parentId = seeded.get(parent)
        // A required reference to a table we could not seed makes this row
        // impossible; skip rather than insert something that violates the FK.
        if (parentId === undefined) {
          if (column.notnull) {
            skipped.push(table)
            names.length = 0
            break
          }
          continue
        }
        names.push(column.name)
        values.push(parentId)
        continue
      }

      if (!column.notnull && column.dflt_value === null && column.pk === 0) continue
      names.push(column.name)
      values.push(valueFor(column, index))
    }

    if (names.length === 0 && skipped.at(-1) === table) continue

    const placeholders = names.map(() => '?').join(', ')
    const columnList = names.map((n) => `\`${n}\``).join(', ')
    try {
      const statement = names.length
        ? `INSERT INTO \`${table}\` (${columnList}) VALUES (${placeholders})`
        : `INSERT INTO \`${table}\` DEFAULT VALUES`
      database.prepare(statement).run(...(values as never[]))
      const row = database.prepare(`SELECT * FROM \`${table}\` LIMIT 1`).get() as Record<
        string,
        unknown
      >
      const idColumn = columns.find((c) => c.pk === 1)?.name ?? 'id'
      seeded.set(table, (row?.[idColumn] as string | number) ?? 1)
    } catch {
      skipped.push(table)
    }
  }

  return { seeded, skipped }
}

/** Row count per table, the before/after snapshot the assertion compares. */
export function countRows(database: DatabaseSync): Map<string, number> {
  const counts = new Map<string, number>()
  for (const table of listTables(database)) {
    const row = database.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).get() as { n: number }
    counts.set(table, row.n)
  }
  return counts
}

/**
 * Tables that held rows before and hold none after.
 *
 * This is the assertion the 2026-07-29 incident needed and did not have. A table
 * that is dropped on purpose is not reported — only one that still exists and
 * has been silently emptied.
 */
export function emptiedTables(before: Map<string, number>, after: Map<string, number>): string[] {
  const lost: string[] = []
  for (const [table, count] of before) {
    if (count === 0) continue
    if (!after.has(table)) continue // dropped deliberately — a schema change, not data loss
    if (after.get(table) === 0) lost.push(table)
  }
  return lost.sort()
}
