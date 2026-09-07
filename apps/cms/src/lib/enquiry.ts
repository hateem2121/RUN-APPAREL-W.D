/**
 * The contact form's validation and shaping — pure, so it can be tested without a
 * database, a network or a browser.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06). The audit scored "no contact form" an 8 and
 * called it defensible, on the grounds that a form with nowhere to send its contents is
 * worse than no form at all. That reasoning stands, and it is why the delivery order is
 * part of the decision rather than an implementation detail: **the enquiry is written to
 * the database before any mail is attempted**, so a mail outage costs a notification and
 * never the enquiry itself.
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
 * nobody and stores nothing on the visitor's device. That claim is measured (FA-O-74) and
 * worth more than the marginal spam it would stop on a B2B enquiry form. Revisit if the
 * spam is ever real rather than anticipated.
 */

export const MAX_LENGTHS = {
  name: 120,
  company: 160,
  email: 254, // RFC 5321's maximum path length; longer is not a real address
  message: 5000,
} as const

/** The hidden field a bot fills and a person never sees. */
export const HONEYPOT_FIELD = 'website'

export type EnquiryInput = {
  name: string
  company: string
  email: string
  message: string
}

export type EnquiryResult =
  | { ok: true; value: EnquiryInput }
  | { ok: false; errors: Partial<Record<keyof EnquiryInput, string>> }

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/**
 * ⚠️ DELIBERATELY PERMISSIVE, AND THAT IS THE CORRECT TRADE FOR THIS FORM.
 *
 * A strict address regex rejects valid addresses — plus-tags, new TLDs, quoted local
 * parts, IDN domains — and the cost of a false rejection here is a buyer who cannot make
 * an enquiry, which is the exact outcome the whole site exists to avoid. The only thing
 * worth refusing is input that is plainly not an address at all. Whether the address
 * receives mail is answered by replying to it, not by a pattern.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

export function validateEnquiry(raw: Record<string, unknown>): EnquiryResult {
  const value: EnquiryInput = {
    name: clean(raw.name, MAX_LENGTHS.name),
    company: clean(raw.company, MAX_LENGTHS.company),
    email: clean(raw.email, MAX_LENGTHS.email),
    message: clean(raw.message, MAX_LENGTHS.message),
  }

  const errors: Partial<Record<keyof EnquiryInput, string>> = {}
  if (!value.name) errors.name = 'Please tell us your name.'
  if (!value.email) errors.email = 'Please give us an email address to reply to.'
  else if (!LOOKS_LIKE_EMAIL.test(value.email))
    errors.email = 'That does not look like an email address.'
  if (!value.message) errors.message = 'Please tell us what you are making.'
  // `company` is optional: a designer or a club officer may not have one, and refusing
  // them an enquiry over it would be absurd.

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
 * The reply-to is the enquirer, so hitting Reply in any mail client answers the customer
 * rather than the robot. That is set by the caller, not here.
 */
export function formatEnquiryEmail(value: EnquiryInput, receivedAt: Date): string {
  return [
    `Name:    ${value.name}`,
    `Company: ${value.company || '(not given)'}`,
    `Email:   ${value.email}`,
    `Sent:    ${receivedAt.toISOString()}`,
    '',
    value.message,
    '',
    '— sent from the enquiry form on wear-run.help',
  ].join('\n')
}

/** A subject a mail client can scan in a list without opening. */
export function enquirySubject(value: EnquiryInput): string {
  const who = value.company || value.name
  return `Enquiry — ${who}`.slice(0, 160)
}
