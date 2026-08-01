import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations/index'

/**
 * Guard the contents of `src/migrations/`.
 *
 * WHY THIS EXISTS. Payload's `readMigrationFiles` reads the migration directory
 * and **dynamically imports every `.ts`/`.js` file in it except `index.ts`**,
 * treating each as a migration with `up`/`down`. Anything else put there — a
 * test, a helper, a fixture — is imported and run during `payload migrate`.
 *
 * That is not hypothetical. On 2026-07-31 a replay test and its harness were
 * added to that directory; the production deploy's `migrate:remote` step
 * imported the test file, `describe()` executed with no vitest runner attached,
 * and the migrate died with
 *
 *     TypeError: Cannot read properties of undefined (reading 'config')
 *
 * The gated deploy meant the live site was never touched, but the release
 * stopped. The replay test now lives here, outside that directory, and this
 * asserts the directory stays clean.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

/** A generated Payload migration: a timestamp, an underscore, a name. */
const MIGRATION_FILE = /^\d{8}_\d{6}_[a-z0-9_]+\.(ts|json)$/

describe('src/migrations contains only migrations', () => {
  it('has no test, helper or fixture files', async () => {
    const unexpected = (await readdir(MIGRATIONS_DIR)).filter(
      (file) => file !== 'index.ts' && !MIGRATION_FILE.test(file),
    )
    expect(
      unexpected,
      'Payload imports EVERY file in src/migrations/ during `payload migrate` and treats it ' +
        'as a migration. A test or helper there will run against production D1 and break the ' +
        'deploy. Put it in src/migrationReplay/ (or anywhere else) instead.',
    ).toEqual([])
  })

  it('every migration in index.ts really exports up and down', async () => {
    // The other half of the same failure mode: a file that IS a migration but
    // does not export the pair would fail at apply time, on production.
    for (const migration of migrations) {
      expect(typeof migration.up, `${migration.name}.up`).toBe('function')
      expect(typeof migration.down, `${migration.name}.down`).toBe('function')
    }
    expect(migrations.length).toBeGreaterThan(0)
  })

  it('index.ts lists every migration file on disk', async () => {
    // A migration committed but never added to index.ts silently never runs.
    const onDisk = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .map((file) => file.replace(/\.ts$/, ''))
      .sort()
    expect(migrations.map((m) => m.name).sort()).toEqual(onDisk)
  })
})
