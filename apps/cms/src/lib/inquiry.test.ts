import { describe, expect, it } from 'vitest'
import {
  inquirySubject,
  formatInquiryEmail,
  HONEYPOT_FIELD,
  isHoneypotTripped,
  MAX_LENGTHS,
  validateInquiry,
} from './inquiry'

const good = {
  name: 'Dana Okafor',
  company: 'Northfield Athletic',
  email: 'dana@northfield.example',
  message: 'We need 400 training tops in two colourways for a March delivery.',
  // The optional details (2026-09-29), empty as most inquiries leave them.
  jobTitle: '',
  country: '',
  phone: '',
  subject: '',
}

describe('validateInquiry', () => {
  it('accepts a complete inquiry unchanged', () => {
    const result = validateInquiry({ ...good })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual(good)
  })

  describe('the optional details (2026-09-29)', () => {
    it('are all optional: none of them can make an inquiry fail', () => {
      const result = validateInquiry({
        ...good,
        jobTitle: ' ',
        country: '',
        phone: '',
        subject: '',
      })
      expect(result.ok).toBe(true)
    })

    it('are trimmed and clipped, never refused', () => {
      const result = validateInquiry({
        ...good,
        jobTitle: '  Head\nof   Merchandise ',
        country: 'Pakistan',
        subject: 's'.repeat(500),
      })
      if (!result.ok) throw new Error('refused')
      expect(result.value.jobTitle).toBe('Head of Merchandise')
      expect(result.value.country).toBe('Pakistan')
      expect(result.value.subject).toHaveLength(MAX_LENGTHS.subject)
    })

    it.each([
      ['+92', '300 1234567', '+92 300 1234567'],
      ['92', '300 1234567', '+92 300 1234567'],
      ['+1 ', '(555) 010-0000', '+1 (555) 010-0000'],
      // A code alone is not a number; a number alone is kept as typed.
      ['+44', '', ''],
      ['', '07700 900123', '07700 900123'],
      // The buyer typed the code into the number: do not print it twice.
      ['+44', '+44 7700 900123', '+44 7700 900123'],
      // Letters in the code field are dropped, not trusted.
      ['+9x2', '300', '+92 300'],
    ])('phone: code %j + number %j → %j', (phoneCode, phone, expected) => {
      const result = validateInquiry({ ...good, phoneCode, phone })
      if (!result.ok) throw new Error('refused')
      expect(result.value.phone).toBe(expected)
    })

    it('keeps the phone within its column even with a long code', () => {
      const result = validateInquiry({ ...good, phoneCode: '99999999', phone: '1'.repeat(80) })
      if (!result.ok) throw new Error('refused')
      expect(result.value.phone.length).toBeLessThanOrEqual(MAX_LENGTHS.phone)
    })
  })

  /**
   * ⚠️ COMPANY IS OPTIONAL ON PURPOSE. A club officer, a designer or a school buyer may
   * genuinely not have one, and refusing them an inquiry over it would turn the form into
   * a filter against exactly the small first orders the 50-piece minimum exists to invite.
   */
  it('accepts an inquiry with no company', () => {
    const result = validateInquiry({ ...good, company: '' })
    expect(result.ok).toBe(true)
  })

  it.each([
    ['name', 'Please tell us your name.'],
    ['email', 'Please give us an email address to reply to.'],
    ['message', 'Please tell us what you are making.'],
  ])('requires %s', (field, message) => {
    const result = validateInquiry({ ...good, [field]: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[field as 'name']).toBe(message)
  })

  it('collects every error at once rather than one at a time', () => {
    const result = validateInquiry({})
    expect(result.ok).toBe(false)
    // A form that reveals its problems one refresh at a time is how people give up.
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['email', 'message', 'name'])
  })

  /**
   * ⚠️ THE PERMISSIVE CASES ARE THE POINT OF THIS BLOCK, NOT THE REJECTIONS.
   *
   * A strict address pattern rejects valid addresses — plus-tags, long new TLDs, IDN
   * domains — and the cost of a false rejection is a buyer who cannot make an inquiry,
   * which is the outcome the whole site exists to avoid. Whether an address receives mail
   * is settled by replying to it.
   */
  it.each([
    'a+tag@example.co.uk',
    'first.last@sub.domain.example',
    'someone@example.technology',
    'δοκιμή@παράδειγμα.δοκιμή',
  ])('accepts the valid address %s', (email) => {
    expect(validateInquiry({ ...good, email }).ok).toBe(true)
  })

  it.each(['not-an-address', 'missing@domain', '@example.com', 'two @spaces.com'])(
    'rejects %s, which is not an address at all',
    (email) => {
      const result = validateInquiry({ ...good, email })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.email).toContain('does not look like')
    },
  )

  it('truncates rather than rejecting an over-long field', () => {
    // Refusing a long message loses the inquiry; trimming it keeps the contact details,
    // and the owner can ask for the rest. The cap exists to bound a D1 row, not to police.
    const result = validateInquiry({ ...good, message: 'x'.repeat(9000) })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.message).toHaveLength(MAX_LENGTHS.message)
  })

  it('collapses whitespace so a pasted address does not arrive with a newline in it', () => {
    const result = validateInquiry({ ...good, email: '  dana@northfield.example \n' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.email).toBe('dana@northfield.example')
  })

  it('ignores non-string input rather than throwing on it', () => {
    // The route handler parses a form body, but a hand-crafted POST can send anything.
    const result = validateInquiry({ name: 42, email: null, message: ['a'], company: {} })
    expect(result.ok).toBe(false)
  })
})

describe('the honeypot', () => {
  it('is untripped when the hidden field is absent or empty', () => {
    expect(isHoneypotTripped({})).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '' })).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '   ' })).toBe(false)
  })

  it('is tripped by anything at all in it', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 'https://spam.example' })).toBe(true)
  })
})

describe('the notification email', () => {
  const at = new Date('2026-09-07T10:30:00.000Z')

  it('carries every field, with the message last so a reply quotes it cleanly', () => {
    const body = formatInquiryEmail(good, at)
    expect(body).toContain('dana@northfield.example')
    expect(body).toContain('Northfield Athletic')
    expect(body).toContain('2026-09-07T10:30:00.000Z')
    expect(body.indexOf(good.message)).toBeGreaterThan(body.indexOf('Sent:'))
  })

  it('says so when no company was given, rather than printing an empty label', () => {
    expect(formatInquiryEmail({ ...good, company: '' }, at)).toContain('(not given)')
  })

  /**
   * ⚠️ PLAIN TEXT, ASSERTED. Every value here is typed by a stranger. HTML mail would
   * mean escaping four fields correctly on every future edit, and getting it wrong once
   * puts attacker-controlled markup in the owner's mail client. This has no such failure
   * mode — the angle brackets below arrive as characters, not as a tag.
   */
  it('does not build HTML out of what a stranger typed', () => {
    const body = formatInquiryEmail({ ...good, name: '<img src=x onerror=alert(1)>' }, at)
    expect(body).toContain('<img src=x onerror=alert(1)>')
    expect(body).not.toContain('<html')
    expect(body).not.toContain('<body')
  })

  const full = {
    ...good,
    jobTitle: 'Head of Merchandise',
    country: 'United Kingdom',
    phone: '+44 7700 900123',
    subject: 'Spring training tops',
  }

  it('lists each optional detail only when given', () => {
    const body = formatInquiryEmail(full, at)
    for (const text of ['Head of Merchandise', 'United Kingdom', '+44 7700 900123', 'Spring'])
      expect(body).toContain(text)
    const bare = formatInquiryEmail(
      { ...full, jobTitle: '', country: '', phone: '', subject: '' },
      at,
    )
    expect(bare).not.toMatch(/Job:|Country:|Phone:|Subject:/)
  })

  it('names the files and links the admin screen, never attaching the files themselves', () => {
    const body = formatInquiryEmail(full, at, {
      files: [
        { name: 'pack.pdf', size: '2.4 MB' },
        { name: 'logo.ai', size: '830 KB' },
      ],
      adminUrl: 'https://cms.wear-run.help/admin/collections/inquiries/7',
    })
    expect(body).toContain('pack.pdf (2.4 MB), logo.ai (830 KB)')
    expect(body).toContain('https://cms.wear-run.help/admin/collections/inquiries/7')
    expect(body.indexOf(good.message)).toBeGreaterThan(body.indexOf('Open:'))
  })

  it('says plainly when a file could not be saved', () => {
    expect(formatInquiryEmail(full, at, { filesError: 'storage refused it' })).toContain(
      'Files NOT saved: storage refused it',
    )
  })

  it('signs off from the site as it is now called', () => {
    // Stale until 2026-09-29: the domain moved to wear-run.com on 2026-09-28.
    const body = formatInquiryEmail(good, at)
    expect(body).toContain('wear-run.com')
    expect(body).not.toContain('wear-run.help')
  })

  it("adds the buyer's own subject to the mail subject, still bounded", () => {
    expect(inquirySubject(full)).toBe('Inquiry — Northfield Athletic — Spring training tops')
    expect(inquirySubject({ ...full, subject: 'y'.repeat(400) }).length).toBe(160)
  })

  it('subjects are scannable in a list and bounded', () => {
    expect(inquirySubject(good)).toBe('Inquiry — Northfield Athletic')
    expect(inquirySubject({ ...good, company: '' })).toBe('Inquiry — Dana Okafor')
    expect(inquirySubject({ ...good, company: 'z'.repeat(400) }).length).toBeLessThanOrEqual(160)
  })
})
