import { describe, expect, it } from 'vitest'
import {
  formProgress,
  inquiryAdminUrl,
  inquiryNotice,
  pickedFileProblem,
  pickProblem,
} from './inquiryForm'
import { MAX_FILES, MAX_TOTAL_BYTES } from './inquiryFiles'

const MB = 1024 * 1024

describe('formProgress — the bar above the two-step form', () => {
  const start = {
    started: false,
    requiredDone: 0,
    requiredTotal: 3,
    onStepTwo: false,
    optionalDone: 0,
    optionalTotal: 7,
  }

  it('is empty until the buyer touches the form', () => {
    expect(formProgress(start)).toBe(0)
  })

  it('gives a small head start the moment any field is focused (endowed progress)', () => {
    expect(formProgress({ ...start, started: true })).toBe(10)
  })

  it('fills to half as the three required fields are done, never past it on step 1', () => {
    expect(formProgress({ ...start, started: true, requiredDone: 1 })).toBe(23)
    expect(formProgress({ ...start, started: true, requiredDone: 3 })).toBe(50)
  })

  it('moves when step 2 opens, and reaches 100 only when every optional detail is given', () => {
    const ready = { ...start, started: true, requiredDone: 3, onStepTwo: true }
    expect(formProgress(ready)).toBe(60)
    expect(formProgress({ ...ready, optionalDone: 7 })).toBe(100)
  })

  it('stays within 0–100 whatever it is given', () => {
    expect(formProgress({ ...start, started: true, requiredDone: 9, requiredTotal: 0 })).toBe(50)
    expect(
      formProgress({ ...start, started: true, requiredDone: 3, onStepTwo: true, optionalDone: 99 }),
    ).toBe(100)
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
