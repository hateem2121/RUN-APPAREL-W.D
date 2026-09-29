import { describe, expect, it } from 'vitest'
import { formProgress, inquiryAdminUrl, inquiryNotice, pickProblem } from './inquiryForm'
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
