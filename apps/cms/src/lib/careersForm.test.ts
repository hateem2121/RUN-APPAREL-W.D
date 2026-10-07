import { describe, expect, it } from 'vitest'
import {
  CV_HELP,
  careersFieldError,
  careersNotice,
  PHONE_HELP,
  pickedCvProblem,
  PRIVACY_LINE,
  RECEIVED_TEXT,
  SEND_ANOTHER_APPLICATION,
  SEND_APPLICATION,
} from './careersForm'

/**
 * The careers form's words (owner-approved 2026-10-07, drafts/careers-form-words.md and
 * drafts/privacy-job-applications.md). Every sentence the form can show is pinned here, so a
 * word changed without the owner's yes fails a test.
 */

const ok = { valid: true, valueMissing: false, typeMismatch: false, patternMismatch: false }
const missing = { ...ok, valid: false, valueMissing: true }

describe('the approved fixed words', () => {
  it('button, help lines, received text and privacy line', () => {
    expect(SEND_APPLICATION).toBe('Send application')
    expect(PHONE_HELP).toBe('We will call you on this number.')
    expect(CV_HELP).toBe('Needed for office roles. PDF, Word, JPG or PNG, up to 10 MB.')
    expect(RECEIVED_TEXT).toBe(
      'Thank you — your application is with our HR team. We keep good candidates on file for future openings.',
    )
    expect(SEND_ANOTHER_APPLICATION).toBe('Send another application')
    expect(PRIVACY_LINE).toBe(
      'We keep your application for up to 12 months, then delete it. See our privacy notice.',
    )
  })
})

describe('a box left wrong', () => {
  it('says what to do, in the box’s own words', () => {
    expect(careersFieldError('name', missing)).toBe('Enter your name.')
    expect(careersFieldError('phone', missing)).toBe('Enter a phone number we can call.')
    expect(careersFieldError('role', missing)).toBe('Choose what you do.')
    expect(careersFieldError('roleOther', missing)).toBe('Tell us what you do.')
    expect(careersFieldError('phone', { ...ok, valid: false, patternMismatch: true })).toBe(
      'Enter a phone number with its country code, like +92 300 1234567.',
    )
    expect(careersFieldError('email', { ...ok, valid: false, typeMismatch: true })).toBe(
      'Enter an email address like name@company.com.',
    )
  })

  it('says nothing about a box that is fine, and passes the CV’s own words through', () => {
    expect(careersFieldError('name', ok)).toBeNull()
    expect(careersFieldError('cv', { ...ok, valid: false }, 'Choose one file only.')).toBe(
      'Choose one file only.',
    )
  })
})

describe('the CV, checked before it is sent', () => {
  const pdf = new File(
    [
      new TextEncoder().encode(
        '%PDF-1.7\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n9\n%%EOF\n',
      ),
    ],
    'cv.pdf',
  )

  it('accepts one good file, and no file', async () => {
    expect(await pickedCvProblem([pdf])).toBeNull()
    expect(await pickedCvProblem([])).toBeNull()
  })

  it('refuses two files, a big file, a wrong kind and an empty file in the approved words', async () => {
    expect(await pickedCvProblem([pdf, pdf])).toBe('Choose one file only.')
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'cv.pdf')
    expect(await pickedCvProblem([big])).toBe(
      'Your CV is 11.0 MB. Up to 10 MB can be attached — please send a smaller file.',
    )
    expect(await pickedCvProblem([new File([new Uint8Array([0x4d, 0x5a])], 'cv.pdf')])).toBe(
      '“cv.pdf” is not a kind we accept, or its contents do not match its name. We accept PDF, Word, JPG or PNG.',
    )
    expect(await pickedCvProblem([new File([], 'cv.pdf')])).toBe(
      '“cv.pdf” is empty — please choose it again.',
    )
  })
})

describe('what the page says after "Send application"', () => {
  const NOT_SENT = 'Your application has not been sent.'

  it('thanks the applicant when it was received', () => {
    expect(careersNotice({ sent: '1' })).toEqual({ kind: 'ok', text: RECEIVED_TEXT })
  })

  it('names each refusal by its code, never by a value from the address', () => {
    expect(careersNotice({ error: 'invalid' })?.text).toBe(
      `${NOT_SENT} Something in the form was not filled in. Please check and send again.`,
    )
    expect(careersNotice({ error: 'files', reason: 'too-many' })?.text).toBe(
      `${NOT_SENT} Choose one file only.`,
    )
    // After sending, only a CODE comes back (no file name, no size), so the approved lines'
    // placeholders are filled with "Your CV" and the sentence that needs the size is left out.
    expect(careersNotice({ error: 'files', reason: 'type' })?.text).toBe(
      `${NOT_SENT} Your CV is not a kind we accept, or its contents do not match its name. We accept PDF, Word, JPG or PNG.`,
    )
    expect(careersNotice({ error: 'files', reason: 'too-big' })?.text).toBe(
      `${NOT_SENT} Up to 10 MB can be attached — please send a smaller file.`,
    )
    expect(careersNotice({ error: 'files', reason: 'empty' })?.text).toBe(
      `${NOT_SENT} Your CV is empty — please choose it again.`,
    )
    expect(careersNotice({ error: 'too-many' })?.text).toBe(
      'That is several applications in a short time. Please wait a few minutes and try again.',
    )
    expect(careersNotice({ error: 'storage' })?.text).toBe(
      'We could not save your application — please try again later, or write to us at the address below.',
    )
    // An address anyone can type: an unknown code gets the general line, never itself.
    expect(careersNotice({ error: '<script>' })?.text).toContain(NOT_SENT)
    expect(careersNotice({ error: '<script>' })?.text).not.toContain('<script>')
    expect(careersNotice({})).toBeNull()
  })
})
