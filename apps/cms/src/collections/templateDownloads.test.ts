import type { Access, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import { migratedDatabase } from '../migrationReplay/migrated'
import { KEEP_YEARS } from '../../templateDownloadRetention.mjs'
import { setDeleteAfter, TemplateDownloads } from './TemplateDownloads'

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

  it('keeps the details for exactly 2 calendar years, and a later save does not move the date', () => {
    expect(KEEP_YEARS).toBe(2)
    const at = new Date('2026-11-07T10:00:00.000Z')
    expect(setDeleteAfter({ data: {}, operation: 'create', now: at }).deleteAfter).toBe(
      '2028-11-07T10:00:00.000Z',
    )
    // 29 February has no same date two years on: 1 March, never shorter than 2 years.
    const leap = new Date('2028-02-29T10:00:00.000Z')
    expect(setDeleteAfter({ data: {}, operation: 'create', now: leap }).deleteAfter).toBe(
      '2030-03-01T10:00:00.000Z',
    )
    // An update keeps whatever the person set: the 2 years count from the LAST contact.
    const moved = { deleteAfter: '2029-01-01T00:00:00.000Z' }
    expect(setDeleteAfter({ data: moved, operation: 'update', now: at }).deleteAfter).toBe(
      '2029-01-01T00:00:00.000Z',
    )
  })

  it('no save can change what was recorded; only the date to delete by moves', () => {
    const updateRule = (name: string) => {
      const field = TemplateDownloads.fields.find((f) => 'name' in f && f.name === name) as
        | { access?: { update?: (args: unknown) => unknown } }
        | undefined
      return field?.access?.update
    }
    const named = TemplateDownloads.fields.flatMap((f) => ('name' in f ? [f.name] : []))
    expect(named.length).toBeGreaterThan(10)
    for (const name of named) {
      if (name === 'deleteAfter' || name === 'updatesStoppedAt') continue
      // A signed-in admin's REST PATCH is refused field by field (security review, 6 Nov 2026).
      expect(updateRule(name)?.({ req: { user: adminPerson } }), name).toBe(false)
    }
    // NEGATIVE CONTROL: the two fields a person sets have no such rule, and the consent record
    // beside the stop date keeps its lock.
    expect(updateRule('deleteAfter')).toBeUndefined()
    expect(updateRule('updatesStoppedAt')).toBeUndefined()
    expect(updateRule('updates')?.({ req: { user: adminPerson } })).toBe(false)
    expect(updateRule('updatesAt')?.({ req: { user: adminPerson } })).toBe(false)
  })

  it('a signed-in person may stop the updates; the stop is a labelled, plain-words date field', () => {
    const field = TemplateDownloads.fields.find(
      (f) => 'name' in f && f.name === 'updatesStoppedAt',
    ) as { type?: string; label?: string; admin?: { readOnly?: boolean; description?: string } }
    expect(field.type).toBe('date')
    expect(field.label).toBe('Updates stopped on')
    expect(field.admin?.readOnly).toBeUndefined()
    expect(field.admin?.description).toMatch(/today's date/)
    // The collection lets a signed-in person (not the robot) save a change.
    const access = TemplateDownloads.access ?? {}
    expect(ask(access.update, adminPerson)).toBe(true)
    expect(ask(access.update, adminRobot)).toBe(false)
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
    // A default on the stop date would mark every download as stopped, and the clean-up would strip
    // each person's details.
    expect(defaultOf('updates_stopped_at')).toBeNull()
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
