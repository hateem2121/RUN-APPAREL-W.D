import type { Access } from 'payload'
import { describe, expect, it } from 'vitest'
import { DocumentVisitEmails } from './DocumentVisitEmails'
import { DocumentVisits } from './DocumentVisits'
import { DocumentVisitSalts } from './DocumentVisitSalts'
import { migratedDatabase } from '../migrationReplay/migrated'

/**
 * The three visit-records tables: access control, field shape and the real schema a
 * migration produces. `apps/cms/src/access/roles.test.ts` already proves `isAdmin`
 * itself; this file proves each collection actually WIRES it (or a hard `false`) to
 * every operation, and that the migration in this task builds the table the SQL in
 * Task 5 and Task 8 expects.
 */

type Actor = { role?: unknown } | null
const call = (fn: Access, user: Actor): unknown =>
  (fn as (args: { req: { user: Actor } }) => unknown)({ req: { user } })

const ADMIN = { role: 'admin' }
const EDITOR = { role: 'editor' }
const ANON = null

describe('document-visits access', () => {
  it('read and delete are admin only; create and update are false for everyone', () => {
    expect(call(DocumentVisits.access!.read!, ADMIN)).toBe(true)
    expect(call(DocumentVisits.access!.read!, EDITOR)).toBe(false)
    expect(call(DocumentVisits.access!.read!, ANON)).toBe(false)
    expect(call(DocumentVisits.access!.delete!, ADMIN)).toBe(true)
    expect(call(DocumentVisits.access!.delete!, EDITOR)).toBe(false)
    expect(call(DocumentVisits.access!.delete!, ANON)).toBe(false)
    for (const user of [ADMIN, EDITOR, ANON]) {
      expect(call(DocumentVisits.access!.create!, user)).toBe(false)
      expect(call(DocumentVisits.access!.update!, user)).toBe(false)
    }
  })
})

describe('document-visit-salts access', () => {
  it('is false for everyone, all four operations — nobody reads a salt through the API', () => {
    for (const user of [ADMIN, EDITOR, ANON]) {
      expect(call(DocumentVisitSalts.access!.read!, user)).toBe(false)
      expect(call(DocumentVisitSalts.access!.create!, user)).toBe(false)
      expect(call(DocumentVisitSalts.access!.update!, user)).toBe(false)
      expect(call(DocumentVisitSalts.access!.delete!, user)).toBe(false)
    }
  })
})

describe('document-visit-emails access', () => {
  it('read is admin only; create, update and delete are false for everyone', () => {
    expect(call(DocumentVisitEmails.access!.read!, ADMIN)).toBe(true)
    expect(call(DocumentVisitEmails.access!.read!, EDITOR)).toBe(false)
    expect(call(DocumentVisitEmails.access!.read!, ANON)).toBe(false)
    for (const user of [ADMIN, EDITOR, ANON]) {
      expect(call(DocumentVisitEmails.access!.create!, user)).toBe(false)
      expect(call(DocumentVisitEmails.access!.update!, user)).toBe(false)
      expect(call(DocumentVisitEmails.access!.delete!, user)).toBe(false)
    }
  })
})

describe('document-visits field names, in order', () => {
  it('matches the contract exactly', () => {
    expect(DocumentVisits.fields.map((f) => ('name' in f ? f.name : undefined))).toEqual([
      'day',
      'document',
      'kind',
      'visitor',
      'firstAt',
      'lastAt',
      'minutesActive',
      'opens',
      'furthestPage',
      'pagesTotal',
      'downloads',
      'country',
      'region',
      'city',
      'timezone',
      'network',
      'device',
      'system',
      'browser',
      'language',
      'cameFrom',
    ])
  })
})

interface ColumnInfo {
  name: string
}
interface IndexListRow {
  name: string
  unique: number
}
interface IndexInfoRow {
  name: string
}

describe('the real schema a migration produces', () => {
  it('document_visits has exactly the columns the Worker and the admin expect', async () => {
    const database = await migratedDatabase()
    const columns = (
      database.prepare('PRAGMA table_info(document_visits)').all() as unknown as ColumnInfo[]
    )
      .map((c) => c.name)
      .sort()
    expect(columns.sort()).toEqual(
      [
        'id',
        'day',
        'document',
        'kind',
        'visitor',
        'first_at',
        'last_at',
        'minutes_active',
        'opens',
        'furthest_page',
        'pages_total',
        'downloads',
        'country',
        'region',
        'city',
        'timezone',
        'network',
        'device',
        'system',
        'browser',
        'language',
        'came_from',
        'updated_at',
        'created_at',
      ].sort(),
    )
    database.close()
  })

  it('document_visits has a UNIQUE index over exactly day, document, visitor, kind', async () => {
    const database = await migratedDatabase()
    const indexes = database
      .prepare('PRAGMA index_list(document_visits)')
      .all() as unknown as IndexListRow[]
    const compound = indexes.find((idx) => {
      const cols = (
        database.prepare(`PRAGMA index_info(\`${idx.name}\`)`).all() as unknown as IndexInfoRow[]
      ).map((c) => c.name)
      return (
        cols.length === 4 && ['day', 'document', 'visitor', 'kind'].every((c) => cols.includes(c))
      )
    })
    expect(compound, 'no index over exactly day, document, visitor, kind').toBeDefined()
    expect(compound?.unique).toBe(1)
    // Confirmed by calling this Payload version's real buildIndexName() directly with
    // the same inputs traverseFields.js passes for a compound index (Step 3) — not
    // required by the contract, but pins the name this migration actually produces.
    expect(compound?.name).toBe('day_document_visitor_kind_idx')
    database.close()
  })

  it('document_visit_salts.day and document_visit_emails.week are UNIQUE', async () => {
    const database = await migratedDatabase()
    for (const [table, column] of [
      ['document_visit_salts', 'day'],
      ['document_visit_emails', 'week'],
    ] as const) {
      const indexes = database
        .prepare(`PRAGMA index_list(${table})`)
        .all() as unknown as IndexListRow[]
      const match = indexes.find((idx) => {
        const cols = (
          database.prepare(`PRAGMA index_info(\`${idx.name}\`)`).all() as unknown as IndexInfoRow[]
        ).map((c) => c.name)
        return cols.length === 1 && cols[0] === column
      })
      expect(match, `${table}.${column} has no unique index`).toBeDefined()
      expect(match?.unique, `${table}.${column}`).toBe(1)
    }
    database.close()
  })

  /**
   * A negative control MUST run both ways (root CLAUDE.md). This proves the column
   * assertion above can actually fail, not just that it happens to pass.
   */
  it('NEGATIVE CONTROL: the column assertion fails when came_from is renamed', async () => {
    const database = await migratedDatabase()
    database.exec('ALTER TABLE document_visits RENAME COLUMN came_from TO came_from_renamed')
    const columns = (
      database.prepare('PRAGMA table_info(document_visits)').all() as unknown as ColumnInfo[]
    )
      .map((c) => c.name)
      .sort()
    expect(columns.includes('came_from')).toBe(false)
    database.close()
  })

  /**
   * `first_at`, `last_at` and `sent_at` are `type: 'date'` fields the Worker (Task 5)
   * and the weekly-email guard (Task 8) set explicitly — they must carry NO column
   * default. Every committed migration since `20260720_185735_initial` gives a
   * `date`-typed column no default at all: `reset_password_expiration` and
   * `lock_until` (`20260720_185735_initial.ts` lines 23 and 27, Payload's own
   * built-in `date` fields, and the only other `date` fields this repo has ever had)
   * are plain `text`, and `grep -n strftime src/migrations/*.ts` shows `strftime` on
   * no column anywhere but `updated_at`/`created_at`. A default here would matter in
   * production: a FAILED weekly-email attempt must store `sent_at` as NULL, and a
   * `strftime('now')` default would instead read back a timestamp for a send that
   * never happened.
   */
  it('document_visits.first_at/last_at and document_visit_emails.sent_at have no column default', async () => {
    const database = await migratedDatabase()
    interface ColumnDefault {
      name: string
      dflt_value: unknown
    }
    const defaultOf = (table: string, column: string) => {
      const columns = database
        .prepare(`PRAGMA table_info(${table})`)
        .all() as unknown as ColumnDefault[]
      return columns.find((c) => c.name === column)?.dflt_value
    }
    expect(defaultOf('document_visits', 'first_at')).toBeNull()
    expect(defaultOf('document_visits', 'last_at')).toBeNull()
    expect(defaultOf('document_visit_emails', 'sent_at')).toBeNull()
    database.close()
  })
})
