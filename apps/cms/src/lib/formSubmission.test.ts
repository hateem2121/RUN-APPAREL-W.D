import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckedFile } from './inquiryFiles'

/**
 * What both forms do after their row is stored (2026-10-25). The two routes' own tests
 * (`contact/submit/route.test.ts`, `careers/submit/route.test.ts`) prove each form end to end;
 * these hold the shared module's own contract, one step at a time, with Payload and Resend replaced
 * by recorders.
 */

const payload = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))

import {
  annotate,
  clientAddress,
  completeSubmission,
  type CompletedSubmission,
  saveFiles,
  sendNotification,
  type SubmissionStorage,
} from './formSubmission'

const INQUIRY: SubmissionStorage = {
  collection: 'inquiries',
  filesCollection: 'inquiry-files',
  ownerField: 'inquiry',
}
const APPLICATION: SubmissionStorage = {
  collection: 'job-applications',
  filesCollection: 'application-files',
  ownerField: 'application',
}

const checked = (name: string, size = 2048): CheckedFile => ({
  name,
  size,
  type: 'application/pdf',
  file: new File(['%PDF'], name),
})

const fetchMock = vi.fn()

beforeEach(() => {
  payload.create.mockReset().mockResolvedValue({ id: 1 })
  payload.update.mockReset().mockResolvedValue({})
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('clientAddress', () => {
  const from = (headers: Record<string, string>) =>
    clientAddress(new Request('https://wear-run.com/x', { headers }))

  it('prefers Cloudflare’s header, then the proxy’s, then one shared key', () => {
    expect(from({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })).toBe('1.1.1.1')
    expect(from({ 'x-forwarded-for': '2.2.2.2' })).toBe('2.2.2.2')
    expect(from({})).toBe('unknown')
  })
})

describe('sendNotification', () => {
  const mail = {
    fromName: 'RUN APPAREL tests',
    to: 'to@example.com',
    replyTo: 'who@example.com',
    subject: 'Subject',
    text: 'Body',
  }

  it('posts one JSON message to Resend with the key, and reports success', async () => {
    expect(await sendNotification(mail)).toEqual({ notified: true })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer test-key')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({
      from: 'RUN APPAREL tests <inquiries@wear-run.help>',
      to: ['to@example.com'],
      reply_to: 'who@example.com',
      subject: 'Subject',
      text: 'Body',
    })
  })

  it('leaves reply_to out when there is no one to reply to', async () => {
    await sendNotification({ ...mail, replyTo: undefined })
    await sendNotification({ ...mail, replyTo: '' })
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(init.body)).not.toHaveProperty('reply_to')
    }
  })

  it('says why, and does not call Resend, when the Worker holds no key', async () => {
    vi.stubEnv('RESEND_API_KEY', '  ')
    expect(await sendNotification(mail)).toEqual({
      notified: false,
      notifyError: 'RESEND_API_KEY is not set on this Worker',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports Resend’s status and the start of its answer, cut to 200 characters', async () => {
    fetchMock.mockResolvedValue(new Response('x'.repeat(500), { status: 422 }))
    const outcome = await sendNotification(mail)
    expect(outcome.notified).toBe(false)
    expect(outcome.notifyError).toBe(`Resend answered 422: ${'x'.repeat(200)}`)
  })

  it('never throws: a network failure comes back as a reason', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await sendNotification(mail)).toEqual({
      notified: false,
      notifyError: 'Error: offline',
    })
  })
})

describe('saveFiles', () => {
  it('writes one record per file, in the private files collection, naming its owner', async () => {
    const result = await saveFiles(
      INQUIRY,
      12,
      [checked('a.pdf'), checked('b.pdf')],
      'inquiry',
      'a file',
    )
    expect(result.saved.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(result.filesError).toBeUndefined()
    expect(payload.create).toHaveBeenCalledTimes(2)
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'inquiry-files',
      data: { inquiry: 12 },
      file: { name: 'a.pdf', mimetype: 'application/pdf', size: 2048 },
      overrideAccess: true,
    })
  })

  it('names the careers owner field and collection for a CV', async () => {
    await saveFiles(APPLICATION, 5, [checked('cv.pdf')], 'application', 'the CV')
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'application-files',
      data: { application: 5 },
    })
  })

  it('keeps going after a file fails, and names every failure', async () => {
    payload.create.mockRejectedValueOnce(new Error('R2 refused')).mockResolvedValue({ id: 2 })
    const result = await saveFiles(
      INQUIRY,
      1,
      [checked('bad.pdf'), checked('good.pdf')],
      'inquiry',
      'a file',
    )
    expect(result.saved.map((f) => f.name)).toEqual(['good.pdf'])
    expect(result.filesError).toBe('Not saved: bad.pdf (Error: R2 refused)')
    expect(console.error).toHaveBeenCalledWith(
      '[inquiry] stored, but a file was not:',
      'bad.pdf',
      expect.any(Error),
    )
  })

  it('words the log for the CV the way the careers route always has', async () => {
    payload.create.mockRejectedValue(new Error('x'))
    await saveFiles(APPLICATION, 1, [checked('cv.pdf')], 'application', 'the CV')
    expect(console.error).toHaveBeenCalledWith(
      '[application] stored, but the CV was not:',
      'cv.pdf',
      expect.any(Error),
    )
  })

  it('cuts each reason to 80 characters and the whole note to 500', async () => {
    payload.create.mockRejectedValue(new Error('y'.repeat(300)))
    const files = Array.from({ length: 12 }, (_, i) => checked(`file-${i}.pdf`))
    const result = await saveFiles(INQUIRY, 1, files, 'inquiry', 'a file')
    expect(result.filesError?.length).toBe(500)
    expect(result.filesError?.startsWith('Not saved: file-0.pdf (Error: ')).toBe(true)
  })
})

describe('annotate', () => {
  it('writes the data onto the row with access overridden', async () => {
    await annotate('job-applications', 9, { notified: true })
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'job-applications',
      id: 9,
      data: { notified: true },
      overrideAccess: true,
    })
  })

  it('never throws', async () => {
    payload.update.mockRejectedValue(new Error('locked'))
    await expect(annotate('inquiries', 1, { notified: true })).resolves.toBeUndefined()
  })
})

describe('completeSubmission', () => {
  const base = (over: Partial<CompletedSubmission> = {}): CompletedSubmission => ({
    storage: INQUIRY,
    id: 3,
    files: [],
    logTag: 'inquiry',
    fileNoun: 'a file',
    recipient: () => 'boss@example.com',
    compose: (extras) => ({
      fromName: 'RUN APPAREL tests',
      replyTo: 'who@example.com',
      subject: 'Subject',
      text: `files=${extras.files.map((f) => `${f.name}:${f.size}`).join(',')};error=${extras.filesError ?? ''};open=${extras.adminUrl}`,
    }),
    adminUrl: 'https://admin.example/3',
    count: { event: 'thing_submitted', placement: 'site-thing' },
    ...over,
  })
  const sentMail = () => JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)

  it('saves files, then mail, then the note, then the count, in that order', async () => {
    const order: string[] = []
    payload.create.mockImplementation(async ({ collection }: { collection: string }) => {
      order.push(`create:${collection}`)
      return { id: 1 }
    })
    payload.update.mockImplementation(async ({ data }: { data: object }) => {
      order.push(`update:${Object.keys(data).join(',')}`)
      return {}
    })
    fetchMock.mockImplementation(async () => {
      order.push('mail')
      return new Response('{}')
    })
    await completeSubmission(
      base({
        files: [checked('a.pdf')],
        recipient: async () => {
          order.push('recipient')
          return 'boss@example.com'
        },
      }),
    )
    expect(order).toEqual([
      'create:inquiry-files',
      'recipient',
      'mail',
      'update:notified',
      'create:events',
    ])
  })

  it('sends to the resolved recipient with the files named and sized, and links the admin', async () => {
    await completeSubmission(
      base({ files: [checked('a.pdf', 2048), checked('b.pdf', 3 * 1024 * 1024)] }),
    )
    expect(sentMail()).toMatchObject({
      from: 'RUN APPAREL tests <inquiries@wear-run.help>',
      to: ['boss@example.com'],
      reply_to: 'who@example.com',
      subject: 'Subject',
      text: 'files=a.pdf:2 KB,b.pdf:3.0 MB;error=;open=https://admin.example/3',
    })
  })

  it('writes notified: true onto the row after a good send', async () => {
    await completeSubmission(base())
    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'inquiries',
      id: 3,
      data: { notified: true },
      overrideAccess: true,
    })
  })

  it('writes the reason onto the row after a failed send, and logs it', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    await completeSubmission(base())
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'inquiries',
      id: 3,
      data: { notified: false, notifyError: 'Resend answered 500: nope' },
      overrideAccess: true,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[inquiry] stored but not notified:',
      'Resend answered 500: nope',
    )
  })

  it('records a file failure on the row and in the email, once, and still sends', async () => {
    payload.create.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'inquiry-files') throw new Error('R2 refused')
      return { id: 1 }
    })
    await completeSubmission(base({ files: [checked('a.pdf')] }))
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'inquiries',
      id: 3,
      data: { filesError: 'Not saved: a.pdf (Error: R2 refused)' },
      overrideAccess: true,
    })
    expect(sentMail().text).toContain('files=;error=Not saved: a.pdf (Error: R2 refused)')
  })

  it('does not touch the files collection, or write a files note, when nothing was attached', async () => {
    await completeSubmission(base())
    expect(payload.create.mock.calls.map(([args]) => args.collection)).toEqual(['events'])
    const written = payload.update.mock.calls.map(([args]) => Object.keys(args.data))
    expect(written).toEqual([['notified']])
  })

  it('counts the submission with its event and placement and nothing personal', async () => {
    await completeSubmission(base())
    expect(payload.create).toHaveBeenCalledWith({
      collection: 'events',
      data: { type: 'analytics', event: 'thing_submitted', placement: 'site-thing' },
      overrideAccess: true,
    })
  })

  it('works the same for a job application’s collection', async () => {
    await completeSubmission(
      base({ storage: APPLICATION, id: 8, logTag: 'application', fileNoun: 'the CV' }),
    )
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'job-applications', id: 8 }),
    )
  })

  it('never throws when the note, the count or the mail all fail', async () => {
    payload.update.mockRejectedValue(new Error('locked'))
    payload.create.mockRejectedValue(new Error('events down'))
    fetchMock.mockRejectedValue(new Error('offline'))
    await expect(completeSubmission(base())).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '[inquiry] stored but not counted:',
      expect.any(Error),
    )
  })
})
