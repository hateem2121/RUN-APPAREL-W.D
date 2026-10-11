import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations/index'
import { type MigrationArgs, makeMigrationArgs, openDatabase, seedEveryTable } from './harness'

/**
 * The buyers' address is inquiry@ since 2026-10-11 (owner; DECISIONS-BETA-WEBSITE D37). The code
 * default moved, and the STORED Site Settings email is moved by 20261011_120000_site_email_inquiry,
 * guarded on the exact old address as the footer tab's name was (`footerTabName.test.ts`): without
 * it every page, and every contact-form notification, kept partner@ until someone edited the admin.
 *
 * What would have to break for these to fail: the guard dropped (an address the owner typed
 * replaced), the old address spelled differently from the stored one (nothing changes), a down()
 * that writes over another address, or the migration registered before the one that stored
 * partner@.
 */

type Runner = (args: MigrationArgs) => Promise<void>

const NAME = '20261011_120000_site_email_inquiry'

const migration = migrations.find((candidate) => candidate.name === NAME)

/** Every migration before this one applied, and rows seeded in every table, as the replay does. */
async function databaseBefore(): Promise<DatabaseSync> {
  const database = openDatabase()
  const { args } = makeMigrationArgs(database)
  for (const earlier of migrations) {
    if (earlier.name === NAME) break
    await (earlier.up as unknown as Runner)(args)
  }
  seedEveryTable(database, { rowsPerTable: 2 })
  return database
}

const emails = (database: DatabaseSync) =>
  database
    .prepare('SELECT email FROM site_settings ORDER BY id')
    .all()
    .map((row) => (row as { email: string }).email)

/** The first row holds the old default, the second an address the owner typed. */
function storeAddresses(database: DatabaseSync) {
  const ids = database
    .prepare('SELECT id FROM site_settings ORDER BY id')
    .all()
    .map((row) => (row as { id: number }).id)
  expect(ids.length, 'the replay seeds two settings rows to tell the cases apart').toBe(2)
  const set = database.prepare('UPDATE site_settings SET email = ? WHERE id = ?')
  set.run('partner@wear-run.com', ids[0] ?? 0)
  set.run('sales@example.com', ids[1] ?? 0)
}

async function run(database: DatabaseSync, step: 'up' | 'down') {
  if (!migration) throw new Error(`${NAME} is not registered in migrations/index.ts`)
  const { args } = makeMigrationArgs(database)
  await (migration[step] as unknown as Runner)(args)
}

describe('the buyers’ address is inquiry@ (D37)', () => {
  it('moves the old default, leaves an address the owner typed alone, and runs twice harmlessly', async () => {
    const database = await databaseBefore()
    storeAddresses(database)

    await run(database, 'up')
    expect(emails(database)).toEqual(['inquiry@wear-run.com', 'sales@example.com'])
    await run(database, 'up')
    expect(emails(database), 'a second run changed something').toEqual([
      'inquiry@wear-run.com',
      'sales@example.com',
    ])
    database.close()
  })

  it('down() gives back partner@ and only where this migration wrote inquiry@', async () => {
    const database = await databaseBefore()
    storeAddresses(database)

    await run(database, 'up')
    await run(database, 'down')
    expect(emails(database)).toEqual(['partner@wear-run.com', 'sales@example.com'])
    database.close()
  })

  it('is registered once, after the table that stored partner@, and is one guarded UPDATE each way', async () => {
    const names = migrations.map((entry) => entry.name)
    expect(names.filter((name) => name === NAME)).toHaveLength(1)
    expect(names.indexOf(NAME)).toBeGreaterThan(names.indexOf('20260720_185735_initial'))
    // Only the SQL is read, never the comments.
    const source = await readFile(
      join(import.meta.dirname, '..', 'migrations', `${NAME}.ts`),
      'utf8',
    )
    const statements = [...source.matchAll(/sql`((?:[^`\\]|\\.)*)`/g)].map((match) =>
      (match[1] ?? '').replaceAll('\\`', '`'),
    )
    expect(statements).toEqual([
      "UPDATE `site_settings` SET `email` = 'inquiry@wear-run.com' WHERE `email` = 'partner@wear-run.com';",
      "UPDATE `site_settings` SET `email` = 'partner@wear-run.com' WHERE `email` = 'inquiry@wear-run.com';",
    ])
  })
})
