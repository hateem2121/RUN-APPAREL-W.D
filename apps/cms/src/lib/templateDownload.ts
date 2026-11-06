import { clean, LOOKS_LIKE_EMAIL, MAX_LENGTHS } from './inquiry'

/**
 * The tech-pack template's download form (C1, owner approved 6 Nov 2026).
 *
 * Four details are required, two are optional, and a separate box starts unticked (the owner's
 * answers of 5 Nov: "Name, Job title, Company Email, whatsapp number company, country"; the split
 * was left to the build, and the privacy page's "Template downloads" names the same four). The
 * honeypot, the cleaning and the email check are the contact form's (`inquiry.ts`), so the two forms
 * refuse and accept the same input.
 */

export const TEMPLATE_PAGE = '/guides/tech-pack-template'
export const TEMPLATE_DOWNLOAD_ACTION = `${TEMPLATE_PAGE}/download`
/** The form's anchor on the guide, and the two result panels' (the contact form's pattern). */
export const TEMPLATE_FORM_ID = 'template-download'
export const TEMPLATE_PROBLEM_ID = 'template-problem'
/** The value the updates box sends when ticked. Anything else is a no. */
export const UPDATES_VALUE = 'yes'

export type TemplateDownloadInput = {
  name: string
  email: string
  company: string
  country: string
  jobTitle: string
  /** As typed, with the country code first. */
  whatsapp: string
  /** True only when the person ticked "Send me occasional updates". */
  updates: boolean
}

export type RequiredField = 'name' | 'email' | 'company' | 'country'

export type TemplateDownloadResult =
  | { ok: true; value: TemplateDownloadInput }
  | { ok: false; errors: Partial<Record<RequiredField, string>> }

export function validateTemplateDownload(raw: Record<string, unknown>): TemplateDownloadResult {
  const value: TemplateDownloadInput = {
    name: clean(raw.name, MAX_LENGTHS.name),
    email: clean(raw.email, MAX_LENGTHS.email),
    company: clean(raw.company, MAX_LENGTHS.company),
    country: clean(raw.country, MAX_LENGTHS.country),
    jobTitle: clean(raw.jobTitle, MAX_LENGTHS.jobTitle),
    whatsapp: clean(raw.whatsapp, MAX_LENGTHS.phone),
    // ⚠️ A YES IS ONLY THE EXACT VALUE OF A TICKED BOX. "on", "true" or a crafted value is a no:
    // consent is recorded only when the person gave it (owner: "record each yes").
    updates: raw.updates === UPDATES_VALUE,
  }
  const errors: Partial<Record<RequiredField, string>> = {}
  if (!value.name) errors.name = 'missing'
  if (!value.email) errors.email = 'missing'
  else if (!LOOKS_LIKE_EMAIL.test(value.email)) errors.email = 'invalid'
  if (!value.company) errors.company = 'missing'
  if (!value.country) errors.country = 'missing'
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}

/** A subject a mail client can scan in a list without opening. */
export function templateDownloadSubject(value: TemplateDownloadInput): string {
  return `Template download — ${value.company} (${value.country})`.slice(0, 160)
}

/**
 * The notice, as plain text, for the reason `formatInquiryEmail` gives: every value is typed by a
 * stranger, and plain text cannot carry their markup into a mail client.
 */
export function formatTemplateDownloadEmail(
  value: TemplateDownloadInput,
  receivedAt: Date,
  adminUrl: string,
): string {
  const optional: [string, string][] = [
    ['Job:      ', value.jobTitle],
    ['WhatsApp: ', value.whatsapp],
  ]
  return [
    'The tech pack template was downloaded.',
    '',
    `Name:      ${value.name}`,
    `Company:   ${value.company}`,
    `Email:     ${value.email}`,
    `Country:   ${value.country}`,
    ...optional.filter(([, text]) => text).map(([label, text]) => `${label}${text}`),
    // The one line that decides whether we may write to them (the privacy page's promise).
    `Updates:   ${value.updates ? 'YES, they asked for occasional updates' : 'no — send them nothing unless they write to us first'}`,
    `When:      ${receivedAt.toISOString()}`,
    `Open:      ${adminUrl}`,
    '',
    '— sent from the tech pack guide on wear-run.com',
  ].join('\n')
}

/** The record's own screen in the admin (cms.wear-run.help only: the site answers `/admin` 404). */
export function templateDownloadAdminUrl(id: string | number): string {
  return `https://cms.wear-run.help/admin/collections/template-downloads/${encodeURIComponent(String(id))}`
}

/** What a field says when it is wrong, under the field and in the list at the top. */
const MISSING: Record<RequiredField, string> = {
  name: 'Enter your name.',
  email: 'Enter your company email address.',
  company: 'Enter your company’s name.',
  country: 'Enter your country.',
}

export function templateFieldError(
  name: string,
  validity: Pick<ValidityState, 'valid' | 'valueMissing' | 'typeMismatch'>,
): string | null {
  if (validity.valid) return null
  if (validity.valueMissing && name in MISSING) return MISSING[name as RequiredField]
  if (name === 'email' && validity.typeMismatch)
    return 'Enter an email address like name@company.com.'
  return null
}

/**
 * The form's fixed words, in one place so the guides' word checks read them (`guides.test.ts`).
 * The notice beside the button and the box's words are the owner's (approved 6 Nov 2026); the
 * rest is the form's working words, listed for him with the rest of PR 2.
 */
export const TEMPLATE_FORM_WORDS = {
  key: ['Fields marked', '*', 'are needed.'],
  labels: {
    name: 'Name',
    email: 'Company email',
    company: 'Company',
    country: 'Country',
    jobTitle: 'Job title',
    whatsapp: 'WhatsApp number',
  },
  updates: 'Send me occasional updates',
  button: 'Download the template',
  notice:
    'We use these details to give you the template and to let us know who downloaded it. We keep them for 2 years from our last contact with you, and we do not email, message or call you unless you tick the box or write to us first.',
  privacyLink: 'Privacy notice.',
  downloading: 'Your template is downloading.',
  again: 'Download it again',
  failed: 'The download did not start. Please check your connection and try again.',
} as const

/** Every one of them, for the word checks. */
export const templateFormWords = (): string[] => [
  TEMPLATE_FORM_WORDS.key.join(' '),
  ...Object.values(TEMPLATE_FORM_WORDS.labels),
  TEMPLATE_FORM_WORDS.updates,
  TEMPLATE_FORM_WORDS.button,
  TEMPLATE_FORM_WORDS.notice,
  TEMPLATE_FORM_WORDS.privacyLink,
  TEMPLATE_FORM_WORDS.downloading,
  TEMPLATE_FORM_WORDS.again,
  TEMPLATE_FORM_WORDS.failed,
  ...Object.values(MISSING),
  'Enter an email address like name@company.com.',
]

export type TemplateNotice = { kind: 'bad'; text: string }

/**
 * The page's message after a refused download, chosen from this table by CODE. No query value is ever
 * shown: a URL can be written by anyone (the contact form's rule, `inquiryForm.ts`).
 */
export function templateNotice(query: { error?: string }): TemplateNotice | null {
  if (!query.error) return null
  if (query.error === 'too-many') {
    return {
      kind: 'bad',
      text: 'That is several downloads in a short time. Please wait a few minutes and try again.',
    }
  }
  if (query.error === 'storage') {
    return {
      kind: 'bad',
      text: 'We could not save your details, so the template did not download. Please try again in a few minutes.',
    }
  }
  return {
    kind: 'bad',
    text: 'Something in the form was not filled in. Please check it and try again.',
  }
}
