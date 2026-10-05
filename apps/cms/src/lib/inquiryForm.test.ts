import { describe, expect, it } from 'vitest'
import {
  fieldError,
  inquiryAdminUrl,
  inquiryNotice,
  NEED_US_SOONER,
  pickedFileProblem,
  pickProblem,
  RECEIVED_HEADING,
  SEND_ANOTHER,
  REQUIRED_KEY,
  SENDING_LABEL,
  SUBJECT_OTHER_LABEL,
  SUBJECTS,
  SUMMARY_HEADING,
} from './inquiryForm'
import { MAX_FILES, MAX_TOTAL_BYTES } from './inquiryFiles'

const MB = 1024 * 1024

const fine = { valid: true, valueMissing: false, typeMismatch: false }
const empty = { valid: false, valueMissing: true, typeMismatch: false }
const malformed = { valid: false, valueMissing: false, typeMismatch: true }

describe('the form says exactly the words the owner approved (W1–W10, D7)', () => {
  it('keeps each approved line word for word', () => {
    expect(SUMMARY_HEADING).toBe('Check these before sending:')
    expect(SENDING_LABEL).toBe('Sending…')
    // D7 v2, as the owner tried it in the report (3 Oct): "Got it." with a tick that draws itself.
    expect(RECEIVED_HEADING).toBe('Got it.')
    expect(SEND_ANOTHER).toBe('Send another inquiry')
    expect(NEED_US_SOONER).toBe('Need us sooner?')
  })

  it("marks the three needed boxes with a * and says so once, never writing 'optional' (Q17)", () => {
    expect(REQUIRED_KEY).toBe('Fields marked * are needed. Everything else helps us reply faster.')
    expect(REQUIRED_KEY).not.toMatch(/optional/i)
  })

  it('offers the six subjects the owner approved, the last opening a box of their own (Q15, Q43)', () => {
    expect([...SUBJECTS, SUBJECT_OTHER_LABEL]).toEqual([
      'Request a quote',
      'Develop a new product',
      'Samples',
      'Private label & branding',
      'Repeat or bulk order',
      'Something else…',
    ])
  })
})

describe('fieldError — the sentence under a wrongly filled field', () => {
  it('tells the buyer what to do for each required field left empty (W2, W3, W5)', () => {
    expect(fieldError('name', empty)).toBe('Enter your name.')
    expect(fieldError('email', empty)).toBe('Enter your email address.')
    expect(fieldError('message', empty)).toBe(
      'Tell us what you are making. One sentence is enough.',
    )
  })

  it('shows what a valid email looks like when one is mistyped (W4)', () => {
    expect(fieldError('email', malformed)).toBe('Enter an email address like name@company.com.')
  })

  it("passes the file picker's own explanation through unchanged", () => {
    const refused = { valid: false, valueMissing: false, typeMismatch: false }
    expect(fieldError('files', refused, 'You chose 6 files.')).toBe('You chose 6 files.')
  })

  // NEGATIVE CONTROLS: a valid field, an optional field and an unknown failure say nothing.
  it('says nothing about a field that is fine, or one it has no words for', () => {
    expect(fieldError('name', fine)).toBeNull()
    expect(fieldError('email', fine)).toBeNull()
    expect(fieldError('company', empty)).toBeNull()
    expect(fieldError('files', { ...fine, valid: false })).toBeNull()
  })
})

describe('pickProblem — the file picker stops a pick the server would refuse', () => {
  it('says nothing about an acceptable pick', () => {
    expect(pickProblem([])).toBeNull()
    expect(pickProblem(Array.from({ length: MAX_FILES }, () => ({ size: MB })))).toBeNull()
    expect(pickProblem([{ size: MAX_TOTAL_BYTES }])).toBeNull()
  })

  it('refuses a sixth file and says how many can go', () => {
    const problem = pickProblem(Array.from({ length: MAX_FILES + 1 }, () => ({ size: 1 })))
    expect(problem).toMatch(/6 files/)
    expect(problem).toMatch(/up to 5/i)
  })

  it('refuses 25 MB and one byte, and offers the link route instead', () => {
    const problem = pickProblem([{ size: MAX_TOTAL_BYTES }, { size: 1 }])
    expect(problem).toMatch(/25 MB/)
    expect(problem).toMatch(/WeTransfer or Drive link/)
  })
})

describe('inquiryNotice — what the page says after a submission', () => {
  it('thanks the buyer when the inquiry was stored', () => {
    expect(inquiryNotice({ sent: '1' })).toEqual({
      kind: 'ok',
      text: 'Thank you — your inquiry is with us. We reply within 24 hours.',
    })
  })

  it('shows nothing on a plain visit', () => {
    expect(inquiryNotice({})).toBeNull()
  })

  it('keeps the three messages the page already had', () => {
    expect(inquiryNotice({ error: 'too-many' })?.text).toMatch(/wait a few minutes/)
    expect(inquiryNotice({ error: 'storage' })?.text).toMatch(/could not save your message/)
    expect(inquiryNotice({ error: 'invalid' })?.text).toMatch(/was not filled in/)
  })

  it('says why the files were refused, and that the message was NOT sent', () => {
    for (const reason of ['too-many', 'too-big', 'type', 'empty', undefined]) {
      const notice = inquiryNotice({ error: 'files', reason })
      expect(notice?.kind).toBe('bad')
      expect(notice?.text, `reason ${reason}`).toMatch(/has not been sent/)
    }
    expect(inquiryNotice({ error: 'files', reason: 'too-big' })?.text).toMatch(/25 MB/)
    expect(inquiryNotice({ error: 'files', reason: 'type' })?.text).toMatch(/PDF/)
  })

  it('never echoes a query value back onto the page', () => {
    const hostile = '<script>alert(1)</script>'
    expect(inquiryNotice({ error: hostile })?.text).not.toContain('script')
    expect(inquiryNotice({ error: 'files', reason: hostile })?.text).not.toContain('script')
  })
})

describe('inquiryAdminUrl — the link in the notification email', () => {
  it('opens the inquiry on the admin host, never the public site', () => {
    expect(inquiryAdminUrl(42)).toBe('https://cms.wear-run.help/admin/collections/inquiries/42')
  })

  it('cannot be bent into another path by the id', () => {
    expect(inquiryAdminUrl('../users/1')).toBe(
      'https://cms.wear-run.help/admin/collections/inquiries/..%2Fusers%2F1',
    )
  })
})

/*
 * The picker reads each chosen file's first bytes with the SERVER's own check (final review,
 * 2026-09-29): a phone photo saved as ".jpg" or a renamed program used to upload in full, be
 * refused, and cost the buyer the message they had typed. Now the send is blocked before it goes.
 */
describe('pickedFileProblem — the picker checks what a file really is before it is sent', () => {
  const pdf = new File(
    [
      new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x78, 0x72, 0x65, 0x66, 0x0a, 0x25,
        0x25, 0x45, 0x4f, 0x46,
      ]),
    ],
    'pack.pdf',
    { type: 'application/pdf' },
  )
  const exeAsPdf = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'pack.pdf', {
    type: 'application/pdf',
  })
  const png = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    'swatch.jpg',
    { type: 'image/jpeg' },
  )

  it('names a file whose bytes are not what its name says, and keeps the message safe', async () => {
    const problem = await pickedFileProblem([exeAsPdf])
    expect(problem).toMatch(/“pack\.pdf”/)
    expect(problem).toMatch(/not a kind we accept/)
    expect(await pickedFileProblem([png])).toMatch(/“swatch\.jpg”/)
  })

  it('names an empty file', async () => {
    expect(await pickedFileProblem([new File([], 'blank.pdf')])).toMatch(/“blank\.pdf” is empty/)
  })

  it('still refuses a sixth file before reading any bytes', async () => {
    const six = Array.from({ length: MAX_FILES + 1 }, () => pdf)
    expect(await pickedFileProblem(six)).toMatch(/6 files/)
  })

  // NEGATIVE CONTROL: a real file passes, so the check is not simply refusing everything.
  it('says nothing about a real PDF, or about no files at all', async () => {
    expect(await pickedFileProblem([pdf])).toBeNull()
    expect(await pickedFileProblem([])).toBeNull()
  })
})
