import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Access, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import {
  APPLICATION_FILE_ACCEPT,
  APPLICATION_FILE_KINDS,
  APPLICATION_FILE_MAX_BYTES,
  APPLICATION_UPLOAD_MIME_TYPES,
} from '../lib/applicationFileTypes'
import { ApplicationFiles } from './ApplicationFiles'
import {
  deleteRememberedApplicationFiles,
  JobApplications,
  KEEP_DAYS,
  rememberApplicationFilesToDelete,
  setDeleteAfter,
} from './JobApplications'

/**
 * The careers form's storage (owner, F23, 2026-10-07: one CV, kept 12 months). What this guards
 * is the difference between "a private place for an applicant's CV" and "an anonymous upload
 * endpoint that serves whatever it is given" — one wrong line of config, as for inquiries.
 */

type Principal = { role?: string; _strategy?: string } | null
const ask = (rule: unknown, user: Principal) =>
  (rule as Access)({ req: { user } as unknown as PayloadRequest })

const person = { role: 'admin' }
const editor = { role: 'editor' }
const robot = { role: 'editor', _strategy: 'api-key' }

describe('who may touch an application and its CV', () => {
  it('nobody — not even an admin — creates either through the API; the route writes them', () => {
    for (const user of [null, person, robot]) {
      expect(ask(JobApplications.access?.create, user)).toBe(false)
      expect(ask(ApplicationFiles.access?.create, user)).toBe(false)
      expect(ask(ApplicationFiles.access?.update, user)).toBe(false)
    }
  })

  it('only a signed-in person reads them; anonymous and the robot key cannot', () => {
    for (const rule of [JobApplications.access?.read, ApplicationFiles.access?.read]) {
      expect(ask(rule, person)).toBe(true)
      expect(ask(rule, null)).toBe(false)
      expect(ask(rule, robot)).toBe(false)
    }
  })

  it('only an admin deletes them', () => {
    for (const rule of [JobApplications.access?.delete, ApplicationFiles.access?.delete]) {
      expect(ask(rule, person)).toBe(true)
      expect(ask(rule, editor)).toBe(false)
      expect(ask(rule, null)).toBe(false)
    }
  })
})

describe('a CV always downloads, never renders in the admin tab', () => {
  it('sends attachment, nosniff and no-store', () => {
    const upload = ApplicationFiles.upload
    if (typeof upload !== 'object' || !upload.modifyResponseHeaders) throw new Error('no hook')
    const headers = upload.modifyResponseHeaders({
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
    })
    expect(headers?.get('Content-Disposition')).toBe('attachment')
    expect(headers?.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers?.get('Cache-Control')).toContain('no-store')
  })
})

describe('where CVs are stored', () => {
  // Read as text: the config needs Cloudflare bindings to import (as inquiryFiles.test.ts does).
  const config = readFileSync(join(__dirname, '..', 'payload.config.ts'), 'utf8')
  const start = config.indexOf('env?.R2_INQUIRY')
  const instance = config.slice(start, config.indexOf('}),', start))

  it('in the EXISTING private inquiry bucket, under careers/', () => {
    expect(start).toBeGreaterThan(-1)
    expect(instance).toMatch(/'application-files':\s*\{\s*prefix:\s*'careers'\s*\}/)
  })

  it('with neither setting that makes Media’s files public', () => {
    expect(instance).not.toMatch(/generateFileURL|disablePayloadAccessControl|clientUploads/)
  })

  it('both collections are registered', () => {
    expect(config).toMatch(/\bJobApplications,/)
    expect(config).toMatch(/\bApplicationFiles,/)
  })
})

describe('the kinds of CV allowed (F23: PDF, Word, JPG or PNG, up to 10 MB)', () => {
  it('are exactly those four kinds', () => {
    expect(APPLICATION_FILE_KINDS.flatMap((kind) => kind.extensions).sort()).toEqual([
      'docx',
      'jpeg',
      'jpg',
      'pdf',
      'png',
    ])
    expect(APPLICATION_FILE_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it("Payload's list covers what its detector reports — a .docx reads as a zip", () => {
    const allowed = new Set(APPLICATION_UPLOAD_MIME_TYPES)
    for (const kind of APPLICATION_FILE_KINDS) {
      for (const type of kind.detected) expect(allowed.has(type), type).toBe(true)
    }
    expect(allowed.has('application/zip')).toBe(true)
    expect(ApplicationFiles.upload).toMatchObject({ mimeTypes: [...APPLICATION_UPLOAD_MIME_TYPES] })
  })

  it('never lets a page, a script, an SVG or a design file in', () => {
    const text = `${APPLICATION_UPLOAD_MIME_TYPES.join(' ')} ${APPLICATION_FILE_ACCEPT}`
    expect(text).not.toMatch(/svg|html|javascript|\.js\b|\.exe|photoshop|postscript|\.ai\b/)
    expect(APPLICATION_FILE_ACCEPT.split(',')).toEqual(['.jpg', '.jpeg', '.png', '.pdf', '.docx'])
  })
})

describe('kept 12 months (F23): the delete-after date', () => {
  const at = new Date('2026-10-07T08:00:00.000Z')

  it('is set to receipt plus 365 days when an application is created', () => {
    const data = setDeleteAfter({ data: {}, operation: 'create', now: at } as never)
    expect(KEEP_DAYS).toBe(365)
    expect(data.deleteAfter).toBe('2027-10-07T08:00:00.000Z')
  })

  it('is never moved by a later save (a status change keeps the original date)', () => {
    const data = setDeleteAfter({
      data: { status: 'reviewed', deleteAfter: '2099-01-01T00:00:00.000Z' },
      originalDoc: { deleteAfter: '2027-10-07T08:00:00.000Z' },
      operation: 'update',
      now: at,
    } as never)
    expect(data.deleteAfter).toBe('2027-10-07T08:00:00.000Z')
  })

  it('is wired as a beforeChange hook and shown, read-only, in the list', () => {
    expect(JobApplications.hooks?.beforeChange).toContain(setDeleteAfter)
    const field = JobApplications.fields.find((f) => 'name' in f && f.name === 'deleteAfter')
    expect((field?.admin as { readOnly?: boolean } | undefined)?.readOnly).toBe(true)
    expect(JobApplications.admin?.defaultColumns).toContain('deleteAfter')
  })
})

describe('deleting an application deletes its CV', () => {
  const fakeReq = (fileIds: number[]) => {
    const find = vi.fn(async () => ({ docs: fileIds.map((id) => ({ id })) }))
    const remove = vi.fn(async (_args: { id: number }) => ({}))
    const req = { context: {}, payload: { find, delete: remove } } as unknown as PayloadRequest
    return { req, find, remove }
  }
  const hookArgs = (req: PayloadRequest) =>
    ({ id: 9, req, collection: JobApplications, context: req.context }) as never

  it('finds the file before the row goes, and deletes it only after', async () => {
    const { req, find, remove } = fakeReq([21])
    await rememberApplicationFilesToDelete(hookArgs(req))
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'application-files',
        where: { application: { equals: 9 } },
        overrideAccess: true,
      }),
    )
    expect(remove).not.toHaveBeenCalled()
    await deleteRememberedApplicationFiles(hookArgs(req))
    expect(remove.mock.calls.map(([arg]) => arg.id)).toEqual([21])
  })

  it('deletes nothing it did not find first (negative control)', async () => {
    const { req, remove } = fakeReq([21])
    await deleteRememberedApplicationFiles(hookArgs(req))
    expect(remove).not.toHaveBeenCalled()
  })

  it('both hooks are wired on the collection', () => {
    expect(JobApplications.hooks?.beforeDelete).toContain(rememberApplicationFilesToDelete)
    expect(JobApplications.hooks?.afterDelete).toContain(deleteRememberedApplicationFiles)
  })
})
