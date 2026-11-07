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
  isStopped,
  logLine,
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

type Row = {
  id: number
  createdAt?: string
  deleteAfter?: string | null
  updates: unknown
  updatesStoppedAt?: string | null
}

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

  it('adds exactly 2 calendar years, the one rule the collection hook shares', () => {
    expect(addCalendarYears(new Date('2026-11-07T00:00:00.000Z'), 2).toISOString()).toBe(
      '2028-11-07T00:00:00.000Z',
    )
    expect(addCalendarYears(new Date('2028-02-29T00:00:00.000Z'), 2).toISOString()).toBe(
      '2030-03-01T00:00:00.000Z',
    )
  })

  it('never deletes a record with a stop date, even unticked and long overdue', () => {
    const rows: Row[] = [
      {
        id: 1,
        deleteAfter: '2020-01-01T00:00:00.000Z',
        updates: false,
        updatesStoppedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        deleteAfter: '2020-01-01T00:00:00.000Z',
        updates: true,
        updatesStoppedAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 3, deleteAfter: '2020-01-01T00:00:00.000Z', updates: false, updatesStoppedAt: null },
      { id: 4, deleteAfter: '2020-01-01T00:00:00.000Z', updates: false, updatesStoppedAt: '' },
      { id: 5, deleteAfter: '2020-01-01T00:00:00.000Z', updates: false },
    ]
    // 3, 4 and 5 have no stop date and behave exactly as before.
    expect(idsDueForDeletion(rows, NOW)).toEqual([3, 4, 5])
    expect(rows.map(isStopped)).toEqual([true, true, false, false, false])
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
    run: async () => {
      const outcome = database.prepare(sql).run(...(params as never[]))
      return { meta: { changes: Number(outcome.changes) } }
    },
  })
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) =>
      Promise.all(statements.map((s) => s.run())),
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
    expect(result).toEqual({ due: 1, deleted: 1, minimised: 0 })
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
    expect(result).toEqual({ due: 2, deleted: 1, minimised: 0 })
    expect(ids(database)).toEqual([1])
    database.close()
  })

  it('touches only template_downloads, with one UPDATE and nothing that drops or alters', () => {
    for (const sql of Object.values(RETENTION_SQL)) {
      expect(sql).not.toMatch(/\b(DROP|ALTER|INSERT)\b/i)
    }
    expect(RETENTION_SQL.deleteOne).toMatch(/^DELETE FROM template_downloads WHERE /)
    expect(RETENTION_SQL.minimiseStopped).toMatch(/^UPDATE template_downloads SET /)
    expect(RETENTION_SQL.minimiseStopped).not.toMatch(/\bemail\b\s*=/)
    expect(RETENTION_SQL.selectCandidates).not.toMatch(/\bUPDATE\b/i)
    expect(RETENTION_SQL.deleteOne).not.toMatch(/\bUPDATE\b/i)
  })
})

type Full = {
  name: string
  email: string
  company: string
  country: string
  job_title: string | null
  whatsapp: string | null
  updates: number
  updates_stopped_at: string | null
  delete_after: string | null
}

function insertFull(database: DatabaseSync, id: number, f: Partial<Full> = {}) {
  const row: Full = {
    name: 'Ayesha Khan',
    email: `person${id}@example.invalid`,
    company: 'Khan Sports',
    country: 'Pakistan',
    job_title: 'Buyer',
    whatsapp: 'placeholder-whatsapp',
    updates: 1,
    updates_stopped_at: null,
    delete_after: '2024-01-01T00:00:00.000Z', // long overdue
    ...f,
  }
  database
    .prepare(
      `INSERT INTO template_downloads (id, name, email, company, country, job_title, whatsapp, updates, updates_stopped_at, delete_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      row.name,
      row.email,
      row.company,
      row.country,
      row.job_title,
      row.whatsapp,
      row.updates,
      row.updates_stopped_at,
      row.delete_after,
    )
}

const rowOf = (database: DatabaseSync, id: number) =>
  database.prepare('SELECT * FROM template_downloads WHERE id = ?').get(id) as unknown as
    | (Full & { id: number })
    | undefined

describe('someone who stopped the updates keeps only their email', () => {
  const STOPPED = '2026-11-01T00:00:00.000Z'

  it('blanks every personal field but the email, and never deletes the record', async () => {
    const database = await migratedDatabase()
    // Stopped subscriber, and stopped unticked record: both long past deleteAfter.
    insertFull(database, 1, { updates: 1, updates_stopped_at: STOPPED })
    insertFull(database, 2, { updates: 0, updates_stopped_at: STOPPED })
    const result = await deleteExpiredTemplateDownloads(d1Over(database), NOW)
    expect(result).toEqual({ due: 0, deleted: 0, minimised: 2 })
    expect(ids(database)).toEqual([1, 2])
    for (const id of [1, 2]) {
      const row = rowOf(database, id)
      expect(row?.email, 'the email is the do-not-send list').toBe(`person${id}@example.invalid`)
      expect(row).toMatchObject({
        name: '',
        company: '',
        country: '',
        job_title: null,
        whatsapp: null,
        updates_stopped_at: STOPPED,
      })
    }
    // A second run finds nothing left to change.
    expect(await deleteExpiredTemplateDownloads(d1Over(database), NOW)).toEqual({
      due: 0,
      deleted: 0,
      minimised: 0,
    })
    database.close()
  })

  it('leaves records with no stop date exactly as today: subscribers kept whole, others deleted when due', async () => {
    const database = await migratedDatabase()
    insertFull(database, 1, { updates: 1 }) // subscriber, overdue: kept, details untouched
    insertFull(database, 2, { updates: 0 }) // overdue: deleted
    insertFull(database, 3, { updates: 0, delete_after: '2027-01-01T00:00:00.000Z' }) // not yet
    insertFull(database, 4, { updates: 1, updates_stopped_at: STOPPED }) // stopped
    insertFull(database, 5, { updates: 0, updates_stopped_at: '' }) // empty string is "not stopped"
    const result = await deleteExpiredTemplateDownloads(d1Over(database), NOW)
    expect(result).toEqual({ due: 2, deleted: 2, minimised: 1 })
    expect(ids(database)).toEqual([1, 3, 4])
    expect(rowOf(database, 1)?.name).toBe('Ayesha Khan')
    expect(rowOf(database, 3)?.company).toBe('Khan Sports')
    expect(rowOf(database, 4)?.name).toBe('')
    database.close()
  })

  it('waits a day for a stopped record somebody has open in the admin', async () => {
    const database = await migratedDatabase()
    insertFull(database, 1, { updates_stopped_at: STOPPED })
    insertFull(database, 2, { updates_stopped_at: STOPPED })
    database.prepare('INSERT INTO payload_locked_documents (id) VALUES (1)').run()
    database
      .prepare(
        `INSERT INTO payload_locked_documents_rels (parent_id, path, template_downloads_id) VALUES (1, 'document', 1)`,
      )
      .run()
    const result = await deleteExpiredTemplateDownloads(d1Over(database), NOW)
    expect(result.minimised).toBe(1)
    expect(rowOf(database, 1)?.name).toBe('Ayesha Khan')
    expect(rowOf(database, 2)?.name).toBe('')
    database.close()
  })

  it('writes a count-only log line', () => {
    expect(logLine({ due: 3, deleted: 2, minimised: 4 })).toBe(
      '[template-retention] deleted 2, minimised 4 (1 skipped, open in the admin)',
    )
    expect(logLine({ due: 0, deleted: 0, minimised: 0 })).toBe(
      '[template-retention] deleted 0, minimised 0',
    )
  })
})

describe('a failure is reported, never thrown', () => {
  it('logs a count only and returns the numbers', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const database = await migratedDatabase()
    insert(database, 1, { updates: 0, deleteAfter: '2026-01-01T00:00:00.000Z' })
    const report = vi.fn()
    await runTemplateRetention({ D1: d1Over(database) }, report, NOW)
    expect(log).toHaveBeenCalledWith('[template-retention] deleted 1, minimised 0')
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
