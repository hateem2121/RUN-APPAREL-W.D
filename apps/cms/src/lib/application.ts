import { clean, joinPhone, LOOKS_LIKE_EMAIL } from './inquiry'

/**
 * The careers form's validation and shaping — pure, like `inquiry.ts`, whose helpers it shares
 * so the two forms cannot disagree about a phone number or an email address.
 *
 * ⚠️ THE APPLICANT IS NOT A BUYER. The owner's floor roles (F23, 2026-10-07) apply with a name,
 * a phone and what they do — no email, no CV. So only those three are required; everything else
 * is optional and is clipped or dropped rather than refusing the application. A wrong "years of
 * experience" costs a blank field, never an applicant.
 *
 * ⚠️ THE ROLE IS CHECKED AGAINST THE LIST THE FORM OFFERS (docs/DECISIONS-BETA-WEBSITE.md D30;
 * the owner approved the roles on 2026-10-07). A value the form never offered is refused, so the
 * HR inbox never receives an invented job title; "Something else" carries the applicant's words.
 */

export const MAX_LENGTHS = {
  name: 120,
  email: 254,
  roleOther: 80,
  note: 2000,
} as const

/** The value of "Something else": its words come from the box it opens, `roleOther`. */
export const ROLE_OTHER = 'other'

/** What the form offers under "What you do", in the owner's order. */
export const ROLE_OPTIONS: readonly { value: string; label: string }[] = [
  ...[
    'Stitching and machining',
    'Cutting',
    'Printing',
    'Quality checking',
    'Merchandising and coordination',
    'Pattern making and design',
    'Administration',
  ].map((label) => ({ value: label, label })),
  { value: ROLE_OTHER, label: 'Something else' },
]

/** The contact form's hidden field: a bot fills it, a person never sees it. */
export const HONEYPOT_FIELD = 'website'

export type ApplicationInput = {
  name: string
  /** "+92 300 1234567", joined the way the contact form joins it. */
  phone: string
  email: string
  /** One of the offered roles, or the applicant's own words for "Something else". */
  role: string
  /** Whole years, 0–60, or null when not given (or not a number we can trust). */
  years: number | null
  note: string
}

type RequiredField = 'name' | 'phone' | 'role' | 'email'

export type ApplicationResult =
  | { ok: true; value: ApplicationInput }
  | { ok: false; errors: Partial<Record<RequiredField, string>> }

/** Seven digits is the shortest number anyone can call back; 15 is E.164's longest. */
const looksLikePhone = (phone: string): boolean => {
  if (/[a-z]/i.test(phone)) return false
  const digits = phone.replace(/\D/g, '').length
  return digits >= 7 && digits <= 15
}

const wholeYears = (raw: unknown): number | null => {
  const text = clean(raw, 3)
  if (!/^\d{1,2}$/.test(text)) return null
  const years = Number(text)
  return years <= 60 ? years : null
}

export function validateApplication(raw: Record<string, unknown>): ApplicationResult {
  const offered = ROLE_OPTIONS.some((option) => option.value === raw.role)
  const value: ApplicationInput = {
    name: clean(raw.name, MAX_LENGTHS.name),
    phone: joinPhone(raw.phoneCode, raw.phone),
    email: clean(raw.email, MAX_LENGTHS.email),
    role: !offered
      ? ''
      : raw.role === ROLE_OTHER
        ? clean(raw.roleOther, MAX_LENGTHS.roleOther)
        : clean(raw.role, MAX_LENGTHS.roleOther),
    years: wholeYears(raw.years),
    note: clean(raw.note, MAX_LENGTHS.note),
  }

  const errors: Partial<Record<RequiredField, string>> = {}
  if (!value.name) errors.name = 'Please tell us your name.'
  if (!value.phone) errors.phone = 'Please give us a phone number to call you back.'
  else if (!looksLikePhone(value.phone)) errors.phone = 'That does not look like a phone number.'
  if (!value.role) {
    errors.role =
      raw.role === ROLE_OTHER ? 'Please tell us what you do.' : 'Please choose what you do.'
  }
  if (value.email && !LOOKS_LIKE_EMAIL.test(value.email)) {
    errors.email = 'That does not look like an email address.'
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}

/** True when the hidden field was filled — i.e. this was almost certainly a bot. */
export function isHoneypotTripped(raw: Record<string, unknown>): boolean {
  return clean(raw[HONEYPOT_FIELD], 1) !== ''
}
