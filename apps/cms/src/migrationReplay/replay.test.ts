import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations/index'
import {
  type MigrationArgs,
  countRows,
  emptiedTables,
  listTables,
  makeMigrationArgs,
  openDatabase,
  seedEveryTable,
} from './harness'

/**
 * Replay every migration against a real SQLite database with foreign keys ON,
 * and fail if any migration silently empties a table that had rows.
 *
 * ⚠️ THIS LIVES OUTSIDE src/migrations/ ON PURPOSE. Payload's
 * `readMigrationFiles` imports EVERY .ts file in the migration directory except
 * index.ts and treats each as a migration. Putting this file there broke
 * `migrate:remote` on the production deploy of 2026-07-31: Payload imported the
 * test, `describe()` ran with no vitest runner attached, and the deploy stopped
 * at the migrate step. The gated design meant nothing was deployed and the live
 * site was untouched — but nothing shipped either. `migrations.test.ts` now
 * guards the directory's contents.
 *
 * THIS IS THE TEST THE 2026-07-29 INCIDENT NEEDED. `inline_colourways` rebuilt
 * `products`; the implicit DROP cascade-deleted `products_performance_features`
 * and `products_customisation_steps`. The migration reported success, the
 * colours arrived intact, and the live page lost its "Performance" list and its
 * build steps with nothing anywhere saying so.
 *
 * The ad-hoc check run at the time asserted only on the table the migration was
 * about, which is exactly why it passed. So the assertion here is generic: seed
 * every table, then check every table.
 *
 * `docs/SESSION-2026-07-29.md` records this harness as the fix. It was never
 * committed — this is it, arriving late.
 */

type Runner = (args: MigrationArgs) => Promise<void>

describe('migration replay', () => {
  it('has migrations to replay', () => {
    expect(migrations.length).toBeGreaterThan(0)
  })

  it('runs every migration up, in order, from an empty database', async () => {
    const database = openDatabase()
    const { args } = makeMigrationArgs(database)

    for (const migration of migrations) {
      await (migration.up as unknown as Runner)(args)
    }

    // Sanity: the schema the rest of the suite assumes actually got built.
    const tables = listTables(database)
    expect(tables).toContain('products')
    expect(tables).toContain('products_colourways')
    expect(tables).toContain('media')
    database.close()
  })

  /**
   * The two schema changes of 2026-08-17, asserted against real SQLite rather
   * than inferred from the DDL string.
   *
   * ⚠️ WHY THIS IS NOT PARANOIA. Payload derives a column name from a field name
   * by snake_casing it, and the migration writes that name by hand — two
   * independent spellings of the same thing, in two files, with nothing joining
   * them. A mismatch does not fail a build, a typecheck or a lint: Payload would
   * simply write to a column D1 does not have, and the owner would type a
   * description, press save, and watch it vanish. The projection tests cannot see
   * this because they never touch a database, and the replay test above cannot
   * see it because it only asks whether tables kept their ROWS.
   *
   * The round trip is the assertion. `products` already has a NOT NULL column or
   * two, so the insert names only what it needs and lets the rest default.
   */
  it('stores and returns a product short description, and builds the build-process tables', async () => {
    const database = openDatabase()
    const { args } = makeMigrationArgs(database)
    for (const migration of migrations) {
      await (migration.up as unknown as Runner)(args)
    }

    const columns = database
      .prepare('PRAGMA table_info(products)')
      .all()
      .map((row) => (row as { name: string }).name)
    expect(
      columns,
      'Payload snake_cases `shortDescription` to `short_description`; the migration ' +
        'must spell it the same way or a saved description silently goes nowhere',
    ).toContain('short_description')

    /**
     * Required columns are DERIVED, not listed. `products` carries several NOT
     * NULL columns with no default (product_name, product_code, slug, …) and the
     * set moves with the schema — a hard-coded list turns the next required
     * column into a puzzling failure in a test about descriptions.
     */
    const required = database
      .prepare('PRAGMA table_info(products)')
      .all()
      .map((row) => row as { name: string; notnull: number; dflt_value: unknown })
      .filter((c) => c.notnull === 1 && c.dflt_value === null && c.name !== 'id')
      .map((c) => c.name)

    const insert = (id: number, description: string | null) => {
      const names = ['id', ...required, ...(description === null ? [] : ['short_description'])]
      const values = [
        id,
        ...required.map((name) => `${name}-${id}`),
        ...(description === null ? [] : [description]),
      ]
      database
        .prepare(
          `INSERT INTO products (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        )
        .run(...values)
    }

    const written = 'A race-fit training tee built for long summer mileage.'
    insert(9001, written)
    const readBack = database
      .prepare('SELECT short_description FROM products WHERE id = ?')
      .get(9001) as { short_description: string | null }
    expect(readBack.short_description).toBe(written)

    // Nullable with no default: every product created before this migration has
    // no description, and `projectViewer.ts` turns null into '' on the way out so
    // the viewer's fallback paragraph is the only thing that decides.
    insert(9002, null)
    const empty = database
      .prepare('SELECT short_description FROM products WHERE id = ?')
      .get(9002) as { short_description: string | null }
    expect(empty.short_description).toBeNull()

    const tables = listTables(database)
    expect(tables).toContain('build_process')
    expect(tables).toContain('build_process_customisation_steps')

    database.close()
  })

  it.each(migrations.map((m, index) => [m.name, index] as const))(
    'migration %s preserves every table that had rows',
    async (_name, index) => {
      const database = openDatabase()
      const { args } = makeMigrationArgs(database)

      // Everything up to, but not including, the migration under test.
      for (const migration of migrations.slice(0, index)) {
        await (migration.up as unknown as Runner)(args)
      }
      if (index === 0) {
        // Nothing exists yet, so there is no data for the first migration to
        // lose. It still has to run clean, which the previous test covers.
        database.close()
        return
      }

      const { seeded } = seedEveryTable(database)
      expect(seeded.size).toBeGreaterThan(0)
      const before = countRows(database)

      await (migrations[index]!.up as unknown as Runner)(args)

      const lost = emptiedTables(before, countRows(database))
      expect(
        lost,
        `${migrations[index]!.name} emptied ${lost.join(', ')}. A table that still exists but lost every ` +
          'row is data loss, not a schema change — stage its rows outside the foreign-key graph before ' +
          'rebuilding the parent, as inline_colourways does.',
      ).toEqual([])

      database.close()
    },
  )

  it('runs every migration down, newest first, without a foreign-key error', async () => {
    // The down paths have never been executed. Two of them were generated with
    // `PRAGMA foreign_keys=OFF` guarding a table rebuild — a no-op on D1, since
    // SQLite ignores that pragma inside a transaction and D1 wraps statements in
    // one — and dropped a table while a live column still referenced it. With
    // foreign keys genuinely on, as they are here and on D1, that raises.
    const database = openDatabase()
    const { args } = makeMigrationArgs(database)
    for (const migration of migrations) {
      await (migration.up as unknown as Runner)(args)
    }
    seedEveryTable(database)

    for (const migration of [...migrations].reverse()) {
      await expect(
        (migration.down as unknown as Runner)(args),
        `${migration.name}.down() failed`,
      ).resolves.not.toThrow()
    }
    database.close()
  })

  it('reproduces the 2026-07-29 data loss when the staging is removed', async () => {
    // The harness is only worth having if it FAILS on the original bug. This
    // rebuilds `products` the naive way — exactly the shape the shipped
    // migration had before the fix — and asserts the check catches it.
    const database = openDatabase()
    const { args } = makeMigrationArgs(database)
    for (const migration of migrations) {
      await (migration.up as unknown as Runner)(args)
    }
    seedEveryTable(database)
    const before = countRows(database)
    expect(before.get('products_performance_features')).toBeGreaterThan(0)

    // No staging: create a new products table, copy the parents, drop the old.
    // The DROP cascades into every child that references it.
    database.exec('PRAGMA foreign_keys = ON;')
    database.exec(`
      CREATE TABLE \`__products_new\` (\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL);
      INSERT INTO \`__products_new\` (\`id\`) SELECT \`id\` FROM \`products\`;
      DROP TABLE \`products\`;
      ALTER TABLE \`__products_new\` RENAME TO \`products\`;
    `)

    const lost = emptiedTables(before, countRows(database))
    expect(lost).toContain('products_performance_features')
    expect(lost).toContain('products_customisation_steps')
    database.close()
  })

  it('enforces foreign keys, without which the check above cannot fire', () => {
    // If this ever reads 0 the whole harness is decorative: cascades are what
    // caused the incident, and PRAGMA defer_foreign_keys does not stop them.
    const database = openDatabase()
    const row = database.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(row.foreign_keys).toBe(1)
    database.close()
  })
})
