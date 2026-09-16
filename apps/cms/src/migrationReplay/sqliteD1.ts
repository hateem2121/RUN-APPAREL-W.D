import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

/**
 * The part of the D1 binding API the documents Worker uses, over a real SQLite database.
 *
 * WHY A REAL DATABASE AND NOT A MOCK. A mock accepts any SQL string, so a column renamed in a
 * migration would stay green here and fail in production, where the only symptom is the
 * Worker's one log line. Given `migratedDatabase()`, every statement in infra/apex-404 runs
 * against the tables the real migrations create.
 *
 * ⚠️ IT REFUSES WHAT D1 REFUSES. D1 rejects an `undefined` binding (D1_TYPE_ERROR). A
 * stand-in that stored NULL instead would carry a missing `?? ''` straight to production.
 *
 * D1 binds `?NNN` parameters by number, and so does `node:sqlite`: measured 2026-09-16 on
 * Node 24.20.0 and 26.8.2, `SELECT ?1, ?2, ?1` bound with two values returns both, the first
 * twice. So values pass straight through, in order.
 */

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike
  run(): Promise<{ success: true; meta: { changes: number } }>
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }>
}

export interface D1Like {
  prepare(sql: string): D1StatementLike
  batch(statements: D1StatementLike[]): Promise<Array<{ success: true; results: unknown[] }>>
}

/** The subset of the D1 binding API the documents Worker uses, over a real SQLite database. `batch` runs in one transaction. */
export function d1From(database: DatabaseSync): D1Like {
  /** How to run each statement made here, so `batch` can run them all inside one transaction. */
  const steps = new WeakMap<D1StatementLike, () => unknown[]>()

  const make = (sql: string, values: readonly unknown[]): D1StatementLike => {
    const bound = (): SQLInputValue[] => {
      const missing = values.indexOf(undefined)
      if (missing !== -1) {
        throw new TypeError(
          `D1_TYPE_ERROR: Type 'undefined' not supported for value ?${missing + 1}`,
        )
      }
      return values as SQLInputValue[]
    }
    const statement: D1StatementLike = {
      bind: (...next) => make(sql, next),
      run: async () => {
        const { changes } = database.prepare(sql).run(...bound())
        return { success: true, meta: { changes: Number(changes) } }
      },
      first: async <T>() => (database.prepare(sql).get(...bound()) as T | undefined) ?? null,
      all: async <T>() => ({
        success: true,
        results: database.prepare(sql).all(...bound()) as T[],
      }),
    }
    steps.set(statement, () => database.prepare(sql).all(...bound()))
    return statement
  }

  return {
    prepare: (sql) => make(sql, []),
    batch: async (statements) => {
      const runs = statements.map((statement) => {
        const run = steps.get(statement)
        if (!run) throw new TypeError('batch() takes only statements this d1From() prepared')
        return run
      })
      database.exec('BEGIN')
      try {
        const results = runs.map((run) => ({ success: true as const, results: run() }))
        database.exec('COMMIT')
        return results
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
  }
}
