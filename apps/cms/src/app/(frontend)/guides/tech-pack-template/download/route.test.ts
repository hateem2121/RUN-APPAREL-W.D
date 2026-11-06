import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEMPLATE_MIME, techPackTemplate } from '../../../../../lib/techPackTemplate'
import { __resetTemplateDownloadRate, MAX_PER_IP } from '../../../../../lib/templateDownloadRate'

/**
 * `POST /guides/tech-pack-template/download`, held end to end with Payload and Resend replaced by
 * recorders (the contact route's test pattern). What it pins: a good download is stored, then
 * noticed to inquiry@ and the owner, then counted, and answered with the workbook; a refused one
 * stores nothing and is sent back by code; and a yes to updates is recorded only when given.
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

const GOOD = {
  name: 'Amy Buyer',
  email: 'amy@clubco.example',
  company: 'Club Co',
  country: 'Canada',
}

function post(
  fields: Record<string, string> = GOOD,
  options: { ip?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  const headers: Record<string, string> = { ...options.headers }
  if (options.ip) headers['cf-connecting-ip'] = options.ip
  return POST(
    new Request('https://wear-run.com/guides/tech-pack-template/download', {
      method: 'POST',
      body: form,
      headers,
    }) as NextRequest,
  )
}

const where = (res: Response) => res.headers.get('location')
const rowsOf = (collection: string) =>
  payload.create.mock.calls.filter(([args]) => args.collection === collection)
const emailBody = () => JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)
const isTheFile = async (res: Response) =>
  res.headers.get('content-type') === TEMPLATE_MIME &&
  Buffer.from(await res.arrayBuffer()).equals(Buffer.from(techPackTemplate()))

beforeEach(() => {
  __resetTemplateDownloadRate()
  payload.create.mockReset().mockResolvedValue({ id: 12 })
  payload.update.mockReset().mockResolvedValue({})
  payload.findGlobal.mockReset().mockResolvedValue({ email: ' inquiry@example.com ' })
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('TEMPLATE_NOTICE_OWNER', 'owner@example.com')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a good download', () => {
  it('is stored, then noticed to inquiry@ and the owner, then counted, and answered with the workbook', async () => {
    const res = await post({ ...GOOD, jobTitle: 'Buyer', whatsapp: '+1 416 555 0100' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="RUN-APPAREL-tech-pack-template.xlsx"',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await isTheFile(res)).toBe(true)

    expect(rowsOf('template-downloads')).toHaveLength(1)
    expect(rowsOf('template-downloads')[0]?.[0]).toMatchObject({
      data: {
        template: 'tech-pack',
        name: 'Amy Buyer',
        email: 'amy@clubco.example',
        company: 'Club Co',
        country: 'Canada',
        jobTitle: 'Buyer',
        whatsapp: '+1 416 555 0100',
        updates: false,
        notified: false,
      },
      overrideAccess: true,
    })
    // An unticked box leaves no consent time behind.
    expect(rowsOf('template-downloads')[0]?.[0].data).not.toHaveProperty('updatesAt')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const mail = emailBody()
    expect(mail.to).toEqual(['inquiry@example.com', 'owner@example.com'])
    expect(mail.reply_to).toBe('amy@clubco.example')
    expect(mail.subject).toBe('Template download — Club Co (Canada)')
    expect(mail.text).toContain('Updates:   no — send them nothing unless they write to us first')
    expect(mail.text).toContain('https://cms.wear-run.help/admin/collections/template-downloads/12')

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'template-downloads',
        id: 12,
        data: { notified: true },
      }),
    )
    expect(rowsOf('events')[0]?.[0].data).toEqual({
      type: 'analytics',
      event: 'template_download',
      placement: 'tech-pack-guide',
    })
  })

  it('records a yes to updates, with its time, only when the box sent exactly its value', async () => {
    await post({ ...GOOD, updates: 'yes' })
    const yes = rowsOf('template-downloads')[0]?.[0].data
    expect(yes.updates).toBe(true)
    expect(typeof yes.updatesAt).toBe('string')
    expect(emailBody().text).toContain('YES, they asked for occasional updates')

    // NEGATIVE CONTROL: anything but the box's own value is a no ("on", "true" are not consent).
    for (const crafted of ['on', 'true', 'YES', '1']) {
      payload.create.mockClear()
      await post({ ...GOOD, updates: crafted })
      expect(rowsOf('template-downloads')[0]?.[0].data.updates, crafted).toBe(false)
    }
  })

  it('still gives the file, and records why, when the notice cannot be sent', async () => {
    fetchMock.mockResolvedValue(new Response('domain not verified', { status: 403 }))
    const res = await post()
    expect(await isTheFile(res)).toBe(true)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notified: false, notifyError: expect.stringContaining('Resend answered 403') },
      }),
    )
  })

  it('sends the notice to inquiry@ alone when the Worker has no owner address', async () => {
    vi.stubEnv('TEMPLATE_NOTICE_OWNER', '')
    await post()
    expect(emailBody().to).toEqual(['inquiry@example.com'])
  })
})

describe('a refused download', () => {
  it('names the empty and malformed fields by code, never by value, and stores nothing', async () => {
    const res = await post({ name: '', email: 'not-an-email', company: 'Club Co', country: '' })
    expect(res.status).toBe(303)
    expect(where(res)).toBe(
      'https://wear-run.com/guides/tech-pack-template?error=invalid&fields=name,email,country#template-problem',
    )
    expect(where(res)).not.toContain('not-an-email')
    expect(payload.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives no file when the record cannot be saved', async () => {
    payload.create.mockRejectedValueOnce(new Error('D1 is down'))
    const res = await post()
    expect(where(res)).toBe(
      'https://wear-run.com/guides/tech-pack-template?error=storage#template-problem',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a tripped honeypot looks like success, and nothing is stored or sent', async () => {
    const res = await post({ ...GOOD, website: 'http://spam.example' })
    expect(await isTheFile(res)).toBe(true)
    expect(payload.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it(`the ${MAX_PER_IP + 1}th download from one address in the window is refused; another address is not`, async () => {
    for (let i = 0; i < MAX_PER_IP; i++) {
      expect((await post(GOOD, { ip: '203.0.113.9' })).status).toBe(200)
    }
    expect(where(await post(GOOD, { ip: '203.0.113.9' }))).toContain('?error=too-many')
    expect((await post(GOOD, { ip: '198.51.100.4' })).status).toBe(200)
  })

  it("the page's own script gets the refusal as data, not a redirect", async () => {
    const res = await post({ ...GOOD, email: '' }, { headers: { 'x-form-progress': '1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      to: '/guides/tech-pack-template?error=invalid&fields=email#template-problem',
    })
  })
})
