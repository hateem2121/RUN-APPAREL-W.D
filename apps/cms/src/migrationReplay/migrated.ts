import type { DatabaseSync } from 'node:sqlite'
import { migrations } from '../migrations/index'
import { type MigrationArgs, makeMigrationArgs, openDatabase } from './harness'

type Runner = (args: MigrationArgs) => Promise<void>

/**
 * A fresh in-memory database with every migration in src/migrations/index.ts applied, in order:
 * the same replay that replay.test.ts runs. Tests that read or write the visit tables use it, so
 * they exercise the schema production gets from the deploy's migrate step, never a hand-typed copy.
 */
export async function migratedDatabase(): Promise<DatabaseSync> {
  const database = openDatabase()
  const { args } = makeMigrationArgs(database)
  for (const migration of migrations) {
    await (migration.up as unknown as Runner)(args)
  }
  return database
}
