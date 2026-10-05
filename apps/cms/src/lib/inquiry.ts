/**
 * The contact form's validation and shaping — pure, so it can be tested without a
 * database, a network or a browser.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06). The audit scored "no contact form" an 8 and
 * called it defensible, on the grounds that a form with nowhere to send its contents is
 * worse than no form at all. That reasoning stands, and it is why the delivery order is
 * part of the decision rather than an implementation detail: **the inquiry is written to
 * the database before any mail is attempted**, so a mail outage costs a notification and
 * never the inquiry itself.
 *
 * ⚠️ THE HONEYPOT IS NOT A CAPTCHA AND MUST NOT BE READ AS ONE. It stops the bots that
 * fill every field they can see, which is most of them, and it costs a visitor nothing —
 * no puzzle, no third-party script, no cookie, and nothing for a screen reader to
 * announce. A determined script reads the CSS and skips it. The real backstop is the rate
 * limiter in the route handler, and the honest position is that neither is protection
 * against a targeted attack.
 *
 * ⚠️ AND WHY NOT A CAPTCHA: Turnstile would be free and effective, and it is a
 * third-party script on a site whose privacy notice currently gets to say it contacts
 * nobody and stores nothing on a plain visit (FA-O-74) — one key, `run-theme`, only
 * after the light/dark switch is pressed. That claim is measured and worth more than
 * the marginal spam it would stop on a B2B inquiry form. Revisit if the spam is ever
 * real rather than anticipated.
 */

export const MAX_LENGTHS = {
  name: 120,
  company: 160,
  email: 254, // RFC 5321's maximum path length; longer is not a real address
  message: 5000,
  // The optional details added on 2026-09-29 (owner). Generous: they are clipped, not refused.
  jobTitle: 120,
  country: 60,
  phone: 40,
  subject: 160,
} as const

/**
 * The value of the subject answer "Something else…" (polish D7): its words come from the box it
 * opens, `subjectOther`, and nothing typed there means no subject at all.
 */
export const SUBJECT_OTHER = 'other'

/** The hidden field a bot fills and a person never sees. */
export const HONEYPOT_FIELD = 'website'

export type InquiryInput = {
  name: string
  company: string
  email: string
  message: string
  jobTitle: string
  country: string
  /** "+92 300 1234567": the country code the form filled (or the buyer edited), then the number. */
  phone: string
  subject: string
}

/** Only the four original fields can be wrong; everything added since is optional. */
type RequiredField = 'name' | 'email' | 'message'

export type InquiryResult =
  | { ok: true; value: InquiryInput }
  | { ok: false; errors: Partial<Record<RequiredField, string>> }

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/**
 * ⚠️ DELIBERATELY PERMISSIVE, AND THAT IS THE CORRECT TRADE FOR THIS FORM.
 *
 * A strict address regex rejects valid addresses — plus-tags, new TLDs, quoted local
 * parts, IDN domains — and the cost of a false rejection here is a buyer who cannot make
 * an inquiry, which is the exact outcome the whole site exists to avoid. The only thing
 * worth refusing is input that is plainly not an address at all. Whether the address
 * receives mail is answered by replying to it, not by a pattern.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

/**
 * The phone as one readable string. The form sends the code and the number as two fields
 * (`phoneCode` is filled from the country and stays editable — owner, 2026-09-29). A code
 * alone is not a phone number, so it is dropped; a number alone is kept as typed, because a
 * buyer may have typed the "+44" into it themselves.
 */
function joinPhone(rawCode: unknown, rawNumber: unknown): string {
  const number = clean(rawNumber, MAX_LENGTHS.phone)
  if (!number) return ''
  const code = clean(rawCode, 8).replace(/\D/g, '').slice(0, 4)
  return (code && !number.startsWith('+') ? `+${code} ${number}` : number).slice(
    0,
    MAX_LENGTHS.phone,
  )
}

export function validateInquiry(raw: Record<string, unknown>): InquiryResult {
  const value: InquiryInput = {
    name: clean(raw.name, MAX_LENGTHS.name),
    company: clean(raw.company, MAX_LENGTHS.company),
    email: clean(raw.email, MAX_LENGTHS.email),
    message: clean(raw.message, MAX_LENGTHS.message),
    jobTitle: clean(raw.jobTitle, MAX_LENGTHS.jobTitle),
    country: clean(raw.country, MAX_LENGTHS.country),
    phone: joinPhone(raw.phoneCode, raw.phone),
    subject: clean(
      raw.subject === SUBJECT_OTHER ? raw.subjectOther : raw.subject,
      MAX_LENGTHS.subject,
    ),
  }

  const errors: Partial<Record<RequiredField, string>> = {}
  if (!value.name) errors.name = 'Please tell us your name.'
  if (!value.email) errors.email = 'Please give us an email address to reply to.'
  else if (!LOOKS_LIKE_EMAIL.test(value.email))
    errors.email = 'That does not look like an email address.'
  if (!value.message) errors.message = 'Please tell us what you are making.'
  // `company` is optional: a designer or a club officer may not have one, and refusing
  // them an inquiry over it would be absurd.

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}

/** True when the hidden field was filled — i.e. this was almost certainly a bot. */
export function isHoneypotTripped(raw: Record<string, unknown>): boolean {
  return clean(raw[HONEYPOT_FIELD], 1) !== ''
}

/**
 * The notification email, as plain text.
 *
 * ⚠️ PLAIN TEXT, NOT HTML, AND NOT BECAUSE IT IS SIMPLER. Every value here is typed by a
 * stranger. HTML mail means escaping four fields correctly on every future edit, and
 * getting it wrong once puts attacker-controlled markup in the owner's mail client. Plain
 * text has no such failure mode at all. It also threads and quotes properly, which
 * matters more for a business reply than styling does.
 *
 * The reply-to is the inquirer, so hitting Reply in any mail client answers the customer
 * rather than the robot. That is set by the caller, not here.
 */
export type InquiryEmailExtras = {
  /** The files that were stored, named as stored. */
  files?: readonly { name: string; size: string }[]
  /** Why a file could not be stored, when one could not. */
  filesError?: string
  /** The inquiry's own screen in the admin: files are opened there, never attached to mail. */
  adminUrl?: string
}

export function formatInquiryEmail(
  value: InquiryInput,
  receivedAt: Date,
  extras: InquiryEmailExtras = {},
): string {
  // The optional details appear only when given: a column of "(not given)" buries the rest.
  const optional: [string, string][] = [
    ['Job:    ', value.jobTitle],
    ['Country:', value.country],
    ['Phone:  ', value.phone],
    ['Subject:', value.subject],
  ]
  const files = extras.files ?? []
  return [
    `Name:    ${value.name}`,
    `Company: ${value.company || '(not given)'}`,
    `Email:   ${value.email}`,
    ...optional.filter(([, text]) => text).map(([label, text]) => `${label} ${text}`),
    `Sent:    ${receivedAt.toISOString()}`,
    ...(files.length > 0
      ? [`Files:   ${files.map((file) => `${file.name} (${file.size})`).join(', ')}`]
      : []),
    ...(extras.filesError ? [`Files NOT saved: ${extras.filesError}`] : []),
    ...(extras.adminUrl ? [`Open:    ${extras.adminUrl}`] : []),
    '',
    value.message,
    '',
    // wear-run.com since the domain move of 2026-09-28; this still said .help until 2026-09-29.
    '— sent from the inquiry form on wear-run.com',
  ].join('\n')
}

/** A subject a mail client can scan in a list without opening. */
export function inquirySubject(value: InquiryInput): string {
  const who = value.company || value.name
  return `Inquiry — ${who}${value.subject ? ` — ${value.subject}` : ''}`.slice(0, 160)
}
