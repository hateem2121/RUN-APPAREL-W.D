import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations/index'
import { type MigrationArgs, makeMigrationArgs, openDatabase, seedEveryTable } from './harness'

/**
 * Polish X20 (the owner's answer Q9, 2026-10-03): the footer's tab says "Start a conversation".
 * The code default moved, and the STORED label is moved by 20261005_120000_footer_tab_one_name,
 * guarded on the exact old default as the 2026-09-07 change was. `replay.test.ts` already replays
 * every migration up and down and fails on an emptied or shrunk table; what it cannot see is a
 * label left unchanged, or a label the owner typed overwritten.
 *
 * What would have to break for these to fail: the guard dropped (an owner's own words replaced),
 * the old label spelled differently from the stored one (nothing changes, and every page keeps
 * the old name), a down() that writes over another label, or the migration registered before the
 * one that stored the old label.
 */

type Runner = (args: MigrationArgs) => Promise<void>

const NAME = '20261005_120000_footer_tab_one_name'

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

const labels = (database: DatabaseSync) =>
  database
    .prepare('SELECT cta_label FROM site_settings ORDER BY id')
    .all()
    .map((row) => (row as { cta_label: string }).cta_label)

async function run(database: DatabaseSync, step: 'up' | 'down') {
  if (!migration) throw new Error(`${NAME} is not registered in migrations/index.ts`)
  const { args } = makeMigrationArgs(database)
  await (migration[step] as unknown as Runner)(args)
}

describe('the footer tab’s one name (X20)', () => {
  it('renames the old default, leaves a label the owner typed alone, and runs twice harmlessly', async () => {
    const database = await databaseBefore()
    const ids = database
      .prepare('SELECT id FROM site_settings ORDER BY id')
      .all()
      .map((row) => (row as { id: number }).id)
    expect(ids.length, 'the replay seeds two settings rows to tell the cases apart').toBe(2)
    const set = database.prepare('UPDATE site_settings SET cta_label = ? WHERE id = ?')
    set.run('Start an inquiry', ids[0] ?? 0)
    set.run('Talk to us', ids[1] ?? 0)

    await run(database, 'up')
    expect(labels(database)).toEqual(['Start a conversation', 'Talk to us'])
    await run(database, 'up')
    expect(labels(database), 'a second run changed something').toEqual([
      'Start a conversation',
      'Talk to us',
    ])
    database.close()
  })

  it('down() gives back the old name and only where this migration wrote the new one', async () => {
    const database = await databaseBefore()
    const ids = database
      .prepare('SELECT id FROM site_settings ORDER BY id')
      .all()
      .map((row) => (row as { id: number }).id)
    const set = database.prepare('UPDATE site_settings SET cta_label = ? WHERE id = ?')
    set.run('Start an inquiry', ids[0] ?? 0)
    set.run('Talk to us', ids[1] ?? 0)

    await run(database, 'up')
    await run(database, 'down')
    expect(labels(database)).toEqual(['Start an inquiry', 'Talk to us'])
    database.close()
  })

  it('is registered once, after the change that stored "Start an inquiry", and is one guarded UPDATE each way', async () => {
    const names = migrations.map((entry) => entry.name)
    expect(names.filter((name) => name === NAME)).toHaveLength(1)
    expect(names.indexOf(NAME)).toBeGreaterThan(names.indexOf('20260907_120000_add_inquiries'))
    // Only the SQL is read, never the comments.
    const source = await readFile(
      join(import.meta.dirname, '..', 'migrations', `${NAME}.ts`),
      'utf8',
    )
    const statements = [...source.matchAll(/sql`((?:[^`\\]|\\.)*)`/g)].map((match) =>
      (match[1] ?? '').replaceAll('\\`', '`'),
    )
    expect(statements).toEqual([
      "UPDATE `site_settings` SET `cta_label` = 'Start a conversation' WHERE `cta_label` = 'Start an inquiry';",
      "UPDATE `site_settings` SET `cta_label` = 'Start an inquiry' WHERE `cta_label` = 'Start a conversation';",
    ])
  })
})
