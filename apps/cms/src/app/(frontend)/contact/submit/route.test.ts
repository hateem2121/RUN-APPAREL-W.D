import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetInquiryRate, MAX_PER_IP } from '../../../../lib/inquiryRate'

/**
 * `POST /contact/submit`, held end to end with Payload and Resend replaced by recorders.
 *
 * Written 2026-10-25 BEFORE the contact and careers routes shared their sending code, to pin what
 * a buyer is told and what is stored, so the shared module could be proven to change neither.
 * The browser suite (`e2e/inquiry.spec.ts`, `e2e/inquirySecurity.spec.ts`) holds the same routes
 * against a real server; this one reaches the branches a browser cannot (a Resend outage, a file
 * that will not save, a database that is down).
 */

const payload = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findGlobal: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))

const fetchMock = vi.fn()

import { POST } from './route'

/** A PDF that ENDS like one (the byte check reads `%%EOF` and `xref`). */
const PDF = '%PDF-1.7\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n9\n%%EOF\n'

const GOOD = { name: 'Amy Buyer', email: 'amy@example.com', message: 'Hoodies for a club.' }

function post(
  fields: Record<string, string> = GOOD,
  options: { ip?: string; files?: File[]; headers?: Record<string, string> } = {},
): Promise<Response> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  for (const file of options.files ?? []) form.append('files', file)
  const headers: Record<string, string> = { ...options.headers }
  if (options.ip) headers['cf-connecting-ip'] = options.ip
  return POST(
    new Request('https://wear-run.com/contact/submit', {
      method: 'POST',
      body: form,
      headers,
    }) as NextRequest,
  )
}

const where = (res: Response) => res.headers.get('location')
const rowsOf = (collection: string) =>
  payload.create.mock.calls.filter(([args]) => args.collection === collection)
const emailBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string)

beforeEach(() => {
  __resetInquiryRate()
  payload.create.mockReset().mockResolvedValue({ id: 7 })
  payload.update.mockReset().mockResolvedValue({})
  payload.findGlobal.mockReset().mockResolvedValue({ email: ' sales@example.com ' })
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

describe('a good inquiry', () => {
  it('is stored, emailed and counted, and the buyer is sent to the thank-you panel', async () => {
    const res = await post({ ...GOOD, company: 'Club Co', subject: 'Teamwear' })
    expect(res.status).toBe(303)
    expect(where(res)).toBe('https://wear-run.com/contact?sent=1#inquiry-done')

    expect(rowsOf('inquiries')).toHaveLength(1)
    expect(rowsOf('inquiries')[0][0]).toMatchObject({
      data: {
        name: 'Amy Buyer',
        email: 'amy@example.com',
        company: 'Club Co',
        status: 'new',
        notified: false,
      },
      overrideAccess: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
    })
    expect(emailBody()).toMatchObject({
      from: 'RUN APPAREL inquiries <inquiries@wear-run.help>',
      to: ['sales@example.com'],
      reply_to: 'amy@example.com',
      subject: 'Inquiry — Club Co — Teamwear',
    })
    expect(emailBody().text).toContain(
      'Open:    https://cms.wear-run.help/admin/collections/inquiries/7',
    )

    expect(payload.update).toHaveBeenCalledWith({
      collection: 'inquiries',
      id: 7,
      data: { notified: true },
      overrideAccess: true,
    })
    expect(rowsOf('events')[0][0]).toMatchObject({
      data: { type: 'analytics', event: 'inquiry_submitted', placement: 'site-contact-form' },
      overrideAccess: true,
    })
  })

  it('stores the inquiry BEFORE mail is attempted', async () => {
    const order: string[] = []
    payload.create.mockImplementation(async ({ collection }: { collection: string }) => {
      order.push(`create:${collection}`)
      return { id: 7 }
    })
    fetchMock.mockImplementation(async () => {
      order.push('mail')
      return new Response('{}')
    })
    await post()
    expect(order.indexOf('create:inquiries')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('create:inquiries')).toBeLessThan(order.indexOf('mail'))
  })

  it('gets the address as data, not a redirect, when the page uploads it itself', async () => {
    const res = await post(GOOD, { headers: { 'x-form-progress': '1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ to: '/contact?sent=1#inquiry-done' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('stores an attached file against its inquiry, in the private collection, and names it in the email', async () => {
    const res = await post(GOOD, { files: [new File([PDF], 'tech pack.pdf')] })
    expect(where(res)).toContain('sent=1')
    const stored = rowsOf('inquiry-files')
    expect(stored).toHaveLength(1)
    expect(stored[0][0]).toMatchObject({
      data: { inquiry: 7 },
      file: { mimetype: 'application/pdf', size: PDF.length },
      overrideAccess: true,
    })
    expect(Buffer.isBuffer(stored[0][0].file.data)).toBe(true)
    expect(emailBody().text).toMatch(/Files: {3}.*\.pdf \(1 KB\)/)
  })

  it('falls back to the default recipient when the site settings cannot be read', async () => {
    payload.findGlobal.mockRejectedValue(new Error('db down'))
    const res = await post()
    expect(where(res)).toContain('sent=1')
    expect(emailBody().to).toHaveLength(1)
    expect(emailBody().to[0]).toMatch(/@/)
  })
})

describe('a bad or missing field', () => {
  it('names the failing fields in the address, and stores and sends nothing', async () => {
    const res = await post({ name: '', email: 'nope', message: '' })
    expect(res.status).toBe(303)
    expect(where(res)).toBe(
      'https://wear-run.com/contact?error=invalid&fields=name,email,message#inquiry-problem',
    )
    expect(payload.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a POST with nothing in it as invalid, never a 500', async () => {
    const res = await post({})
    expect(res.status).toBe(303)
    expect(where(res)).toContain('error=invalid')
  })

  it('answers a body that is not a form with error=unreadable', async () => {
    const res = await POST(
      new Request('https://wear-run.com/contact/submit', {
        method: 'POST',
        body: 'plain text',
        headers: { 'content-type': 'text/plain' },
      }) as NextRequest,
    )
    expect(where(res)).toBe('https://wear-run.com/contact?error=unreadable#inquiry-problem')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('thanks a bot that fills the hidden field, and stores and sends nothing', async () => {
    const res = await post({ ...GOOD, website: 'https://spam.example' })
    expect(where(res)).toBe('https://wear-run.com/contact?sent=1#inquiry-done')
    expect(payload.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('a refused file', () => {
  it('refuses a program renamed .pdf whole, with the reason as a code, and stores nothing', async () => {
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'tech.pdf')
    const res = await post(GOOD, { files: [exe] })
    expect(where(res)).toBe('https://wear-run.com/contact?error=files&reason=type#inquiry-problem')
    expect(payload.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a sixth file', async () => {
    const files = Array.from({ length: 6 }, (_, i) => new File([PDF], `p${i}.pdf`))
    const res = await post(GOOD, { files })
    expect(where(res)).toContain('error=files&reason=too-many')
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('a rate-limited sender', () => {
  it('refuses the sixth inquiry from one address, and not another address', async () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) {
      expect(where(await post(GOOD, { ip: '203.0.113.9' })), `inquiry ${i + 1}`).toContain('sent=1')
    }
    const sixth = await post(GOOD, { ip: '203.0.113.9' })
    expect(where(sixth)).toBe('https://wear-run.com/contact?error=too-many#inquiry-problem')
    expect(rowsOf('inquiries')).toHaveLength(MAX_PER_IP)

    expect(where(await post(GOOD, { ip: '203.0.113.10' }))).toContain('sent=1')
  })

  it('does not spend the allowance on refused forms: after six refusals a good one goes', async () => {
    for (let i = 0; i < MAX_PER_IP + 1; i += 1) {
      const refused = await post({ ...GOOD, email: 'nope' }, { ip: '203.0.113.11' })
      expect(where(refused)).toContain('error=invalid')
    }
    expect(where(await post(GOOD, { ip: '203.0.113.11' }))).toContain('sent=1')
  })

  it('reads the address from x-forwarded-for when cf-connecting-ip is absent', async () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) {
      await post(GOOD, { headers: { 'x-forwarded-for': '203.0.113.12' } })
    }
    const sixth = await post(GOOD, { headers: { 'x-forwarded-for': '203.0.113.12' } })
    expect(where(sixth)).toContain('error=too-many')
  })
})

describe('when something fails after the form is accepted', () => {
  it('says so, and sends nothing, when the inquiry cannot be stored', async () => {
    payload.create.mockRejectedValue(new Error('D1 is down'))
    const res = await post()
    expect(where(res)).toBe('https://wear-run.com/contact?error=storage#inquiry-problem')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still thanks the buyer when Resend refuses, and writes the reason onto the row', async () => {
    fetchMock.mockResolvedValue(new Response('domain not verified', { status: 403 }))
    const res = await post()
    expect(where(res)).toContain('sent=1')
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'inquiries',
      id: 7,
      data: { notified: false, notifyError: 'Resend answered 403: domain not verified' },
      overrideAccess: true,
    })
  })

  it('still thanks the buyer when Resend cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = await post()
    expect(where(res)).toContain('sent=1')
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notified: false, notifyError: 'Error: network down' },
      }),
    )
  })

  it('still thanks the buyer, and says why, when the Worker holds no Resend key', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const res = await post()
    expect(where(res)).toContain('sent=1')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notified: false, notifyError: 'RESEND_API_KEY is not set on this Worker' },
      }),
    )
  })

  it('records a file that will not save, names it in the email, and still thanks the buyer', async () => {
    payload.create.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'inquiry-files') throw new Error('R2 refused')
      return { id: 7 }
    })
    const res = await post(GOOD, { files: [new File([PDF], 'tech.pdf')] })
    expect(where(res)).toContain('sent=1')
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'inquiries',
      id: 7,
      data: { filesError: 'Not saved: tech.pdf (Error: R2 refused)' },
      overrideAccess: true,
    })
    expect(emailBody().text).toContain('Files NOT saved: Not saved: tech.pdf (Error: R2 refused)')
  })

  it('still thanks the buyer when the row cannot be annotated or the count cannot be written', async () => {
    payload.update.mockRejectedValue(new Error('locked'))
    payload.create.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'events') throw new Error('events down')
      return { id: 7 }
    })
    const res = await post()
    expect(where(res)).toContain('sent=1')
  })
})
