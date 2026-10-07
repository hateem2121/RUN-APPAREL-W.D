import { beforeEach, describe, expect, it } from 'vitest'
import {
  APPLICATIONS_TO,
  applicationAdminUrl,
  applicationSubject,
  formatApplicationEmail,
  type ApplicationInput,
} from './application'
import { checkApplicationFiles } from './applicationFileTypes'
import {
  __resetApplicationRate,
  checkApplicationRate,
  MAX_PER_IP,
  MAX_PER_ISOLATE,
} from './applicationRate'
import { __resetInquiryRate, checkInquiryRate } from './inquiryRate'

/**
 * The careers route's three pure parts (Task 2.4): which CV it accepts, how often one address
 * may apply, and the email the HR inbox receives. The route itself is held by the browser suite.
 */

const bytes = (...parts: (string | number[])[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  )
const file = (name: string, content: Uint8Array<ArrayBuffer>) => new File([content], name)
// The same fixtures as inquiryFiles.test.ts: a PDF must END like one, as Payload checks.
const PDF = bytes('%PDF-1.7\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n9\n%%EOF\n')
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF')
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04], [0, 0, 0, 0])
const PSD = bytes('8BPS', [0, 1])
const EXE = bytes([0x4d, 0x5a, 0x90, 0x00])

describe('the CV the careers form accepts (F23: one file, PDF, Word, JPG or PNG, 10 MB)', () => {
  it('takes no file at all, the way floor roles apply', async () => {
    expect(await checkApplicationFiles([new File([], '')])).toEqual({ ok: true, files: [] })
  })

  it('takes one PDF, Word, JPG or PNG', async () => {
    for (const [name, content] of [
      ['cv.pdf', PDF],
      ['cv.docx', ZIP],
      ['photo.jpg', JPEG],
      ['scan.png', PNG],
    ] as const) {
      const result = await checkApplicationFiles([file(name, content)])
      expect(result.ok, name).toBe(true)
    }
  })

  it('refuses a second file', async () => {
    const result = await checkApplicationFiles([file('a.pdf', PDF), file('b.pdf', PDF)])
    expect(result).toEqual({ ok: false, reason: 'too-many' })
  })

  it('refuses a file over 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(PDF)
    const result = await checkApplicationFiles([file('cv.pdf', big)])
    expect(result).toEqual({ ok: false, reason: 'too-big' })
  })

  it('refuses a kind the contact form allows but a CV does not (design files)', async () => {
    const result = await checkApplicationFiles([file('portfolio.psd', PSD)])
    expect(result).toMatchObject({ ok: false, reason: 'type' })
  })

  it('refuses a program renamed .pdf', async () => {
    const result = await checkApplicationFiles([file('cv.pdf', EXE)])
    expect(result).toMatchObject({ ok: false, reason: 'type' })
  })
})

describe('how often one address may apply', () => {
  beforeEach(() => {
    __resetApplicationRate()
    __resetInquiryRate()
  })

  it('uses the contact form’s numbers', () => {
    expect(MAX_PER_IP).toBe(5)
    expect(MAX_PER_ISOLATE).toBe(60)
  })

  it('refuses the sixth application from one address in the window', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) expect(checkApplicationRate('1.2.3.4', 1000)).toBe(true)
    expect(checkApplicationRate('1.2.3.4', 1000)).toBe(false)
    expect(checkApplicationRate('5.6.7.8', 1000)).toBe(true)
  })

  it('counts separately from the contact form, so one cannot use up the other', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) checkInquiryRate('1.2.3.4', 1000)
    expect(checkInquiryRate('1.2.3.4', 1000)).toBe(false)
    expect(checkApplicationRate('1.2.3.4', 1000)).toBe(true)
  })

  it('opens again after the window', () => {
    for (let i = 0; i < MAX_PER_IP; i += 1) checkApplicationRate('1.2.3.4', 1000)
    expect(checkApplicationRate('1.2.3.4', 1000 + 10 * 60 * 1000)).toBe(true)
  })
})

describe('the email the HR inbox receives', () => {
  const value: ApplicationInput = {
    name: 'Imran Bashir',
    phone: '+92 300 1234567',
    email: '',
    role: 'Stitching and machining',
    years: 6,
    note: 'I can start next month.',
  }
  const at = new Date('2026-10-07T09:00:00.000Z')

  it('goes to hr@wear-run.com (owner, 2026-10-07: fixed, not a setting)', () => {
    expect(APPLICATIONS_TO).toBe('hr@wear-run.com')
  })

  it('has a subject an inbox can scan: role, then name', () => {
    expect(applicationSubject(value)).toBe(
      'Job application — Stitching and machining — Imran Bashir',
    )
  })

  it('lists what was sent, leaves out what was not, and links the admin', () => {
    const text = formatApplicationEmail(value, at, {
      files: [{ name: 'cv.pdf', size: '120 KB' }],
      adminUrl: applicationAdminUrl(42),
    })
    expect(text).toContain('Name:    Imran Bashir')
    expect(text).toContain('Phone:   +92 300 1234567')
    expect(text).toContain('Role:    Stitching and machining')
    expect(text).toContain('Years:   6')
    expect(text).toContain('CV:      cv.pdf (120 KB)')
    expect(text).toContain('I can start next month.')
    expect(text).toContain('https://cms.wear-run.help/admin/collections/job-applications/42')
    expect(text).not.toContain('Email:')
    expect(text).toContain('— sent from the careers form on wear-run.com')
  })

  it('names a CV that could not be saved', () => {
    const text = formatApplicationEmail({ ...value, email: 'imran@example.com' }, at, {
      filesError: 'Not saved: cv.pdf (storage)',
    })
    expect(text).toContain('Email:   imran@example.com')
    expect(text).toContain('CV NOT saved: Not saved: cv.pdf (storage)')
  })
})
