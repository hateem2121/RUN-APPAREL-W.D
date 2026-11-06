import type { Access, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import { migratedDatabase } from '../migrationReplay/migrated'
import { KEEP_DAYS, setDeleteAfter, TemplateDownloads } from './TemplateDownloads'

type Principal = { role?: string; _strategy?: string } | null
const ask = (rule: unknown, user: Principal) =>
  (rule as Access)({ req: { user } as unknown as PayloadRequest })

const adminPerson = { role: 'admin', _strategy: 'local-jwt' }
const adminRobot = { role: 'admin', _strategy: 'api-key' }

describe('who downloaded the tech-pack template', () => {
  it('only a signed-in person reads it, and nothing creates it through the API', () => {
    const access = TemplateDownloads.access ?? {}
    expect(ask(access.read, adminPerson)).toBe(true)
    // The robot's API key has no business reading who downloaded what (as for inquiries).
    expect(ask(access.read, adminRobot)).toBe(false)
    expect(ask(access.read, null)).toBe(false)
    // The download route writes with the local API after its own checks; the REST API cannot.
    expect(ask(access.create, adminPerson)).toBe(false)
    expect(ask(access.create, null)).toBe(false)
  })

  it('keeps the details 2 years from receipt, and a later save does not move the date', () => {
    const at = new Date('2026-11-06T10:00:00.000Z')
    expect(KEEP_DAYS).toBe(730)
    expect(setDeleteAfter({ data: {}, operation: 'create', now: at }).deleteAfter).toBe(
      '2028-11-05T10:00:00.000Z',
    )
    // An update keeps whatever the person set: the 2 years count from the LAST contact.
    const moved = { deleteAfter: '2029-01-01T00:00:00.000Z' }
    expect(setDeleteAfter({ data: moved, operation: 'update', now: at }).deleteAfter).toBe(
      '2029-01-01T00:00:00.000Z',
    )
  })

  it('records the yes to updates as read-only facts', () => {
    const field = (name: string) =>
      TemplateDownloads.fields.find((f) => 'name' in f && f.name === name) as
        | { admin?: { readOnly?: boolean }; defaultValue?: unknown }
        | undefined
    expect(field('updates')?.admin?.readOnly).toBe(true)
    expect(field('updates')?.defaultValue).toBe(false)
    expect(field('updatesAt')?.admin?.readOnly).toBe(true)
    // The date to delete by is the one field a person moves.
    expect(field('deleteAfter')?.admin?.readOnly).toBeUndefined()
  })

  it('the table gives no row a consent time or a delete date it was not given', async () => {
    const database = await migratedDatabase()
    const columns = database.prepare('PRAGMA table_info(template_downloads)').all() as unknown as {
      name: string
      dflt_value: unknown
    }[]
    const defaultOf = (column: string) => columns.find((c) => c.name === column)?.dflt_value
    expect(columns.length, 'the migration did not build the table').toBeGreaterThan(0)
    // A default here would stamp an unticked download with a consent time (the migration's header).
    expect(defaultOf('updates_at')).toBeNull()
    expect(defaultOf('delete_after')).toBeNull()
    // NEGATIVE CONTROL: the same reading sees a default where there is one.
    expect(String(defaultOf('created_at'))).toContain('strftime')
    database.close()
  })

  it('every field the collection names has its column', async () => {
    const database = await migratedDatabase()
    const names = (
      database.prepare('PRAGMA table_info(template_downloads)').all() as unknown as {
        name: string
      }[]
    ).map((c) => c.name)
    const snake = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    for (const field of TemplateDownloads.fields) {
      if ('name' in field) expect(names, field.name).toContain(snake(field.name))
    }
    const locks = (
      database.prepare('PRAGMA table_info(payload_locked_documents_rels)').all() as unknown as {
        name: string
      }[]
    ).map((c) => c.name)
    expect(locks).toContain('template_downloads_id')
    database.close()
  })
})
