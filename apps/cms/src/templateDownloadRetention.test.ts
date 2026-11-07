import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  addCalendarYears,
  deleteExpiredTemplateDownloads,
  dueDate,
  idsDueForDeletion,
  RETENTION_SQL,
  runTemplateRetention,
} from '../templateDownloadRetention.mjs'
import { migratedDatabase } from './migrationReplay/migrated'

/**
 * The daily deletion of template download records (owner approved 7 Nov 2026).
 *
 * The promise it keeps (privacy page, "Template downloads"): details kept 2 years from the last
 * contact; a person who ticked the updates box keeps their email and yes until they stop. So the
 * test that matters most is the subscriber: a 3-year-old record WITH updates must survive.
 */

const APP = fileURLToPath(new URL('..', import.meta.url))
const NOW = new Date('2026-11-07T12:00:00.000Z')
const day = (iso: string) => iso

type Row = { id: number; createdAt?: string; deleteAfter?: string | null; updates: unknown }

describe('which records are due', () => {
  it('keeps a record one day short of its date, deletes it exactly on the date', () => {
    const rows: Row[] = [
      { id: 1, deleteAfter: '2026-11-08T12:00:00.000Z', updates: false },
      { id: 2, deleteAfter: '2026-11-07T12:00:00.000Z', updates: false },
      { id: 3, deleteAfter: '2026-11-07T11:59:59.999Z', updates: false },
    ]
    // The boundary: `now >= due`, so a record exactly 2 years old is deleted.
    expect(idsDueForDeletion(rows, NOW)).toEqual([2, 3])
  })

  it('never deletes a person who ticked the updates box, however old the record', () => {
    const rows: Row[] = [
      {
        id: 1,
        createdAt: '2023-01-01T00:00:00.000Z',
        deleteAfter: '2025-01-01T00:00:00.000Z',
        updates: true,
      },
      {
        id: 2,
        createdAt: '2023-01-01T00:00:00.000Z',
        deleteAfter: '2025-01-01T00:00:00.000Z',
        updates: 1,
      },
      {
        id: 3,
        createdAt: '2023-01-01T00:00:00.000Z',
        deleteAfter: '2025-01-01T00:00:00.000Z',
        updates: false,
      },
    ]
    expect(idsDueForDeletion(rows, NOW)).toEqual([3])
  })

  it('keeps a record whose updates flag is missing or null (it could hide a yes)', () => {
    const rows: Row[] = [
      { id: 1, deleteAfter: '2020-01-01T00:00:00.000Z', updates: null },
      { id: 2, deleteAfter: '2020-01-01T00:00:00.000Z', updates: undefined },
    ]
    expect(idsDueForDeletion(rows, NOW)).toEqual([])
  })

  it('counts from the date the team moved on, not from receipt', () => {
    // Received 3 years ago, but the team wrote again recently and moved the date to 2028.
    const moved: Row = {
      id: 1,
      createdAt: '2023-11-01T00:00:00.000Z',
      deleteAfter: '2028-06-01T00:00:00.000Z',
      updates: false,
    }
    expect(idsDueForDeletion([moved], NOW)).toEqual([])
  })

  it('falls back to receipt plus 2 calendar years when there is no usable date', () => {
    const rows: Row[] = [
      { id: 1, createdAt: '2024-11-07T12:00:00.000Z', deleteAfter: null, updates: false },
      { id: 2, createdAt: '2024-11-08T12:00:00.000Z', deleteAfter: 'not a date', updates: false },
      { id: 3, createdAt: undefined, deleteAfter: null, updates: false },
    ]
    // 1: exactly 2 years -> due. 2: a day short -> kept. 3: no dates at all -> kept.
    expect(idsDueForDeletion(rows, NOW)).toEqual([1])
  })

  it('handles a 29 February record: 2 calendar years on is 1 March, never earlier', () => {
    const leap = new Date('2024-02-29T10:00:00.000Z')
    expect(addCalendarYears(leap, 2).toISOString()).toBe('2026-03-01T10:00:00.000Z')
    expect(dueDate({ createdAt: leap.toISOString(), deleteAfter: null })?.toISOString()).toBe(
      '2026-03-01T10:00:00.000Z',
    )
    const row: Row = { id: 1, createdAt: leap.toISOString(), deleteAfter: null, updates: false }
    expect(idsDueForDeletion([row], new Date('2026-02-28T23:59:59.000Z'))).toEqual([])
    expect(idsDueForDeletion([row], new Date('2026-03-01T10:00:00.000Z'))).toEqual([1])
    // A 28 Feb record keeps the same month and day (a leap year in between does not shift it).
    expect(addCalendarYears(new Date('2027-02-28T00:00:00.000Z'), 2).toISOString()).toBe(
      '2029-02-28T00:00:00.000Z',
    )
  })

  it('does nothing for an empty list', () => {
    expect(idsDueForDeletion([], NOW)).toEqual([])
  })
})

/** D1's calling shape over node:sqlite, so the real SQL runs against the real migrated schema. */
function d1Over(database: DatabaseSync) {
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    all: async () => ({
      results: database.prepare(sql).all(...(params as never[])) as Record<string, unknown>[],
    }),
    run: () => database.prepare(sql).run(...(params as never[])),
  })
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) =>
      statements.map((s) => ({ meta: { changes: Number(s.run().changes) } })),
  }
}

function insert(
  database: DatabaseSync,
  id: number,
  fields: { updates: number; deleteAfter: string | null; createdAt?: string },
) {
  database
    .prepare(
      `INSERT INTO template_downloads (id, name, email, company, country, updates, delete_after, created_at)
       VALUES (?, 'N', 'n@example.invalid', 'C', 'PK', ?, ?, ?)`,
    )
    .run(id, fields.updates, fields.deleteAfter, fields.createdAt ?? '2024-01-01T00:00:00.000Z')
}

const ids = (database: DatabaseSync) =>
  (database.prepare('SELECT id FROM template_downloads ORDER BY id').all() as { id: number }[]).map(
    (r) => r.id,
  )

describe('the real SQL against the real migrated schema (foreign keys on)', () => {
  it('deletes the expired no-updates records and keeps the subscriber and the unexpired', async () => {
    const database = await migratedDatabase()
    insert(database, 1, { updates: 0, deleteAfter: day('2026-01-01T00:00:00.000Z') }) // expired
    insert(database, 2, { updates: 1, deleteAfter: day('2024-01-01T00:00:00.000Z') }) // subscriber, 3 years old
    insert(database, 3, { updates: 0, deleteAfter: day('2027-01-01T00:00:00.000Z') }) // not yet
    const result = await deleteExpiredTemplateDownloads(d1Over(database), NOW)
    expect(result).toEqual({ due: 1, deleted: 1 })
    expect(ids(database)).toEqual([2, 3])
    database.close()
  })

  it('skips a record somebody has open in the admin instead of failing the whole run', async () => {
    const database = await migratedDatabase()
    insert(database, 1, { updates: 0, deleteAfter: '2026-01-01T00:00:00.000Z' }) // expired, locked
    insert(database, 2, { updates: 0, deleteAfter: '2026-01-02T00:00:00.000Z' }) // expired
    database.prepare('INSERT INTO payload_locked_documents (id) VALUES (1)').run()
    database
      .prepare(
        `INSERT INTO payload_locked_documents_rels (parent_id, path, template_downloads_id) VALUES (1, 'document', 1)`,
      )
      .run()
    // CONTROL: without the lock guard the same DELETE hits the foreign key. This is what the
    // guard in RETENTION_SQL.deleteOne exists for.
    expect(() => database.prepare('DELETE FROM template_downloads WHERE id = 1').run()).toThrow()
    const result = await deleteExpiredTemplateDownloads(d1Over(database), NOW)
    expect(result).toEqual({ due: 2, deleted: 1 })
    expect(ids(database)).toEqual([1])
    database.close()
  })

  it('touches only template_downloads', () => {
    for (const sql of Object.values(RETENTION_SQL)) {
      expect(sql).not.toMatch(/\b(DROP|ALTER|UPDATE|INSERT)\b/i)
    }
    expect(RETENTION_SQL.deleteOne).toMatch(/^DELETE FROM template_downloads WHERE /)
  })
})

describe('a failure is reported, never thrown', () => {
  it('logs a count only and returns the numbers', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const database = await migratedDatabase()
    insert(database, 1, { updates: 0, deleteAfter: '2026-01-01T00:00:00.000Z' })
    const report = vi.fn()
    await runTemplateRetention({ D1: d1Over(database) }, report, NOW)
    expect(log).toHaveBeenCalledWith('[template-retention] deleted 1')
    expect(report).not.toHaveBeenCalled()
    // Nothing personal in the line.
    expect(String(log.mock.calls[0]?.[0])).not.toMatch(/@|example/)
    log.mockRestore()
    database.close()
  })

  it('reports a database failure and does not throw out of scheduled', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('D1 is down')
    const report = vi.fn().mockResolvedValue(true)
    const broken = {
      prepare: () => {
        throw boom
      },
      batch: async () => [],
    }
    await expect(runTemplateRetention({ D1: broken }, report, NOW)).resolves.toBeNull()
    expect(report).toHaveBeenCalledWith(boom)
    // A reporter that itself fails still does not throw.
    await expect(
      runTemplateRetention(
        { D1: broken },
        async () => Promise.reject(new Error('sentry down')),
        NOW,
      ),
    ).resolves.toBeNull()
    // A missing binding is a failure too, not a silent no-op.
    await expect(runTemplateRetention({}, report, NOW)).resolves.toBeNull()
    error.mockRestore()
  })
})

describe('the Worker is wired to run it', () => {
  const read = (rel: string) => readFileSync(join(APP, rel), 'utf8')

  it('wrangler.jsonc carries the one daily cron (comments stripped before parsing)', () => {
    const config = JSON.parse(
      read('wrangler.jsonc')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    ) as { triggers?: { crons?: string[] } }
    expect(config.triggers?.crons).toEqual(['35 0 * * *'])
  })

  it('worker.mjs exports a scheduled handler that runs the job and reports through Sentry', () => {
    const source = read('worker.mjs')
    expect(source).toMatch(/export default \{[\s\S]*?async scheduled\(/)
    expect(source).toContain("from './templateDownloadRetention.mjs'")
    expect(source).toContain('runTemplateRetention(env')
    expect(source).toContain('reportToSentry')
    // waitUntil keeps the run alive after scheduled returns.
    expect(source).toMatch(/scheduled[\s\S]*?ctx\.waitUntil\(/)
  })
})
