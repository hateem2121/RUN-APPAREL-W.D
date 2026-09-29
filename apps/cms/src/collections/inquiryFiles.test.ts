import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Access, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import {
  INQUIRY_FILE_ACCEPT,
  INQUIRY_FILE_KINDS,
  INQUIRY_UPLOAD_MIME_TYPES,
} from '../lib/inquiryFileTypes'
import { deleteRememberedFiles, Inquiries, rememberFilesToDelete } from './Inquiries'
import { InquiryFiles } from './InquiryFiles'

/**
 * The files buyers attach (owner, 2026-09-29). What this guards is the difference between
 * "a private place for a buyer's tech pack" and "an anonymous upload endpoint that serves
 * whatever it is given from the admin's own origin" — which is one wrong line of config.
 */

type Principal = { role?: string; _strategy?: string } | null
const ask = (rule: unknown, user: Principal) =>
  (rule as Access)({ req: { user } as unknown as PayloadRequest })

const person = { role: 'admin' }
const robot = { role: 'editor', _strategy: 'api-key' }

describe('InquiryFiles access', () => {
  it('nobody — not even an admin — can create or change one through the API', () => {
    for (const user of [null, person, robot]) {
      expect(ask(InquiryFiles.access?.create, user)).toBe(false)
      expect(ask(InquiryFiles.access?.update, user)).toBe(false)
    }
  })

  it('only a signed-in person can open one; anonymous and the robot key cannot', () => {
    expect(ask(InquiryFiles.access?.read, person)).toBe(true)
    expect(ask(InquiryFiles.access?.read, null)).toBe(false)
    expect(ask(InquiryFiles.access?.read, robot)).toBe(false)
  })
})

describe('InquiryFiles downloads', () => {
  it('always download, never render in the admin tab', () => {
    const upload = InquiryFiles.upload
    if (typeof upload !== 'object' || !upload.modifyResponseHeaders) throw new Error('no hook')
    const headers = upload.modifyResponseHeaders({
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
    })
    expect(headers?.get('Content-Disposition')).toBe('attachment')
    expect(headers?.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers?.get('Cache-Control')).toContain('no-store')
  })

  it("the bucket's storage instance keeps Payload's access check in the way", () => {
    // Read as text: the config needs Cloudflare bindings to import. The instance that names
    // R2_INQUIRY must not carry either setting that makes Media's files public.
    const config = readFileSync(join(__dirname, '..', 'payload.config.ts'), 'utf8')
    const start = config.indexOf('env?.R2_INQUIRY')
    expect(start).toBeGreaterThan(-1)
    const instance = config.slice(start, config.indexOf('}),', start))
    expect(instance).toContain("'inquiry-files': true")
    expect(instance).not.toMatch(/generateFileURL|disablePayloadAccessControl|clientUploads/)
  })
})

describe('the kinds of file allowed', () => {
  it("Payload's own list covers every type its detector reports for an allowed file", () => {
    // Measured 2026-09-29: .docx/.xlsx/.pptx/.key read as application/zip, a modern .ai as PDF.
    const allowed = new Set(INQUIRY_UPLOAD_MIME_TYPES)
    for (const kind of INQUIRY_FILE_KINDS) {
      for (const type of kind.detected) expect(allowed.has(type), type).toBe(true)
    }
    expect(allowed.has('application/zip')).toBe(true)
    expect(allowed.has('application/pdf')).toBe(true)
  })

  it('never lets a page, a script or an SVG in', () => {
    const text = `${INQUIRY_UPLOAD_MIME_TYPES.join(' ')} ${INQUIRY_FILE_ACCEPT}`
    expect(text).not.toMatch(/svg|html|javascript|\.js\b|\.exe/)
  })

  it('the picker offers exactly the allowed extensions, each once', () => {
    const offered = INQUIRY_FILE_ACCEPT.split(',')
    expect(new Set(offered).size).toBe(offered.length)
    expect(offered).toEqual(expect.arrayContaining(['.pdf', '.docx', '.ai', '.psd', '.heic']))
  })
})

describe('deleting an inquiry deletes its files', () => {
  const fakeReq = (fileIds: number[]) => {
    const find = vi.fn(async () => ({ docs: fileIds.map((id) => ({ id })) }))
    const remove = vi.fn(async (_args: { id: number }) => ({}))
    const req = { context: {}, payload: { find, delete: remove } } as unknown as PayloadRequest
    return { req, find, remove }
  }
  const hookArgs = (req: PayloadRequest) =>
    ({ id: 7, req, collection: Inquiries, context: req.context }) as never

  it('finds the files before the row goes, and deletes them only after', async () => {
    const { req, find, remove } = fakeReq([11, 12])
    await rememberFilesToDelete(hookArgs(req))
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'inquiry-files',
        where: { inquiry: { equals: 7 } },
        overrideAccess: true,
      }),
    )
    // Nothing is deleted yet: if the inquiry's own delete failed, its files would survive.
    expect(remove).not.toHaveBeenCalled()
    await deleteRememberedFiles(hookArgs(req))
    expect(remove.mock.calls.map(([arg]) => arg.id)).toEqual([11, 12])
  })

  it('deletes nothing it did not find first (negative control)', async () => {
    const { req, remove } = fakeReq([11])
    await deleteRememberedFiles(hookArgs(req))
    expect(remove).not.toHaveBeenCalled()
  })

  it('both hooks are wired on the collection', () => {
    expect(Inquiries.hooks?.beforeDelete).toContain(rememberFilesToDelete)
    expect(Inquiries.hooks?.afterDelete).toContain(deleteRememberedFiles)
  })
})
