import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations/index'
import { type MigrationArgs, makeMigrationArgs } from './harness'
import { migratedDatabase } from './migrated'

/**
 * VA-14 (visual audit, 2026-10-02): `events.inp_ms`, where a speed report keeps how long the
 * slowest tap of the visit took. `replay.test.ts` already replays every migration up and down and
 * fails on an emptied table; what it cannot see is a column spelled differently here and in
 * `collections/Events.ts`. Payload snake_cases the field name `inpMs`, so `inp_ms` is two hand
 * spellings in two files, and a mismatch would fail EVERY events insert, which the public endpoint
 * swallows by design: the symptom would be a speed table that quietly stops filling, exactly as
 * `replay.test.ts` explains for `lcp_ms`.
 *
 * What would have to break for these to fail: the column named anything but `inp_ms`, typed
 * anything but numeric, given a default (every old row would then read as a measured number),
 * made required, or the down() dropping more than that one column.
 */

type Runner = (args: MigrationArgs) => Promise<void>

const NAME = '20261002_120000_add_web_vitals_inp'

describe('events.inp_ms (VA-14)', () => {
  it('is a nullable numeric column with no default, named the way Payload names inpMs', async () => {
    const database = await migratedDatabase()
    const column = database
      .prepare('PRAGMA table_info(events)')
      .all()
      .map((row) => row as { name: string; type: string; notnull: number; dflt_value: unknown })
      .find((candidate) => candidate.name === 'inp_ms')
    expect(column, 'Payload snake_cases `inpMs` to `inp_ms`').toBeDefined()
    expect(column?.type, 'a `type: number` field is numeric here').toBe('numeric')
    expect(column?.notnull, 'every old row and every other event leaves it empty').toBe(0)
    expect(column?.dflt_value, 'a default would make every old row look measured').toBeNull()
    database.close()
  })

  it('stores a speed report with its garment and all three numbers, and leaves other events empty', async () => {
    const database = await migratedDatabase()
    const insert = database.prepare(
      'INSERT INTO events (id, type, event, product, lcp_ms, cls, inp_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    insert.run(9201, 'analytics', 'web_vitals', 'R-XPS', 2400, 0.012, 216)
    // A visit with no tap: the viewer sends no INP, and the row holds nothing for it, not a 0.
    insert.run(9202, 'analytics', 'web_vitals', 'R-XPS', 1800, 0, null)
    insert.run(9203, 'analytics', 'model_loaded', 'R-XPS', null, null, null)
    const rows = database
      .prepare(
        'SELECT id, product, lcp_ms, cls, inp_ms FROM events WHERE id IN (9201, 9202, 9203) ORDER BY id',
      )
      .all()
      .map((row) => ({ ...row }))
    expect(rows).toEqual([
      { id: 9201, product: 'R-XPS', lcp_ms: 2400, cls: 0.012, inp_ms: 216 },
      { id: 9202, product: 'R-XPS', lcp_ms: 1800, cls: 0, inp_ms: null },
      { id: 9203, product: 'R-XPS', lcp_ms: null, cls: null, inp_ms: null },
    ])
    database.close()
  })

  it('is registered once, after the migration that gave the table its other speed columns', () => {
    const names = migrations.map((migration) => migration.name)
    expect(names.filter((name) => name === NAME)).toHaveLength(1)
    expect(names.indexOf(NAME)).toBeGreaterThan(
      names.indexOf('20260917_120000_add_web_vitals_values'),
    )
  })

  it('is a single ALTER TABLE each way and never rebuilds the table', async () => {
    // A regenerated migration (`payload migrate:create`) diffs against a snapshot many generations
    // stale and rebuilds `events` — the shape of the 2026-07-29 cascade (d1-migrations rule). Only
    // the SQL is read here, never the comments, which discuss table rebuilds on purpose.
    const source = await readFile(
      join(import.meta.dirname, '..', 'migrations', `${NAME}.ts`),
      'utf8',
    )
    const statements = [...source.matchAll(/sql`((?:[^`\\]|\\.)*)`/g)].map((match) =>
      (match[1] ?? '').replaceAll('\\`', '`'),
    )
    expect(statements).toEqual([
      'ALTER TABLE `events` ADD `inp_ms` numeric;',
      'ALTER TABLE `events` DROP COLUMN `inp_ms`;',
    ])
  })

  it('down() takes away that one column and keeps every row and every other column', async () => {
    const database = await migratedDatabase()
    const insert = database.prepare(
      'INSERT INTO events (id, type, event, product, lcp_ms, cls, inp_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    insert.run(9211, 'analytics', 'web_vitals', 'R-XPS', 2400, 0.012, 216)
    insert.run(9212, 'analytics', 'web_vitals', 'R-MM', 1800, 0.001, null)
    const columnsBefore = database
      .prepare('PRAGMA table_info(events)')
      .all()
      .map((row) => (row as { name: string }).name)

    const migration = migrations.find((candidate) => candidate.name === NAME)
    if (!migration) throw new Error(`${NAME} is not registered in migrations/index.ts`)
    const { args } = makeMigrationArgs(database)
    await (migration.down as unknown as Runner)(args)

    const columnsAfter = database
      .prepare('PRAGMA table_info(events)')
      .all()
      .map((row) => (row as { name: string }).name)
    expect(columnsAfter).toEqual(columnsBefore.filter((name) => name !== 'inp_ms'))
    const kept = database
      .prepare('SELECT id, product, lcp_ms, cls FROM events WHERE id IN (9211, 9212) ORDER BY id')
      .all()
      .map((row) => ({ ...row }))
    expect(kept).toEqual([
      { id: 9211, product: 'R-XPS', lcp_ms: 2400, cls: 0.012 },
      { id: 9212, product: 'R-MM', lcp_ms: 1800, cls: 0.001 },
    ])
    database.close()
  })
})
