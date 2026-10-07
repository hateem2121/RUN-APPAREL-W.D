import { APPLICATION_FILE_MAX_BYTES, checkApplicationFiles } from './applicationFileTypes'
import { formatBytes } from './inquiryFiles'
import type { Notice } from './inquiryForm'

/**
 * The careers form's words and its in-browser checks (owner, 2026-10-07: every sentence here was
 * approved as drafted — the private drafts careers-form-words.md and privacy-job-applications.md;
 * the button label with F23). `careersForm.test.ts` pins each one, so a word changed without the
 * owner's yes fails a test. Shapes copied from `inquiryForm.ts`, whose comments carry the reasons
 * (instructions in the field's own words; the server decides; codes, never values, in the URL).
 */

export const SEND_APPLICATION = 'Send application'
export const PHONE_HELP = 'We will call you on this number.'
export const CV_HELP = 'Needed for office roles. PDF, Word, JPG or PNG, up to 10 MB.'
export const RECEIVED_TEXT =
  'Thank you — your application is with our HR team. We keep good candidates on file for future openings.'
export const SEND_ANOTHER_APPLICATION = 'Send another application'
export const PRIVACY_LINE =
  'We keep your application for up to 12 months, then delete it. See our privacy notice.'

/** The parts of `ValidityState` the messages depend on. */
export type CareersValidity = Pick<
  ValidityState,
  'valid' | 'valueMissing' | 'typeMismatch' | 'patternMismatch'
>

const MISSING: Record<string, string> = {
  name: 'Enter your name.',
  phone: 'Enter a phone number we can call.',
  role: 'Choose what you do.',
  roleOther: 'Tell us what you do.',
}

/** The sentence under a box and in the list at the top, or null when the box is fine. */
export function careersFieldError(
  name: string,
  validity: CareersValidity,
  customMessage = '',
): string | null {
  if (validity.valid) return null
  // The CV picker explains a refused pick in its own words (`pickedCvProblem`).
  if (name === 'cv') return customMessage || null
  if (validity.valueMissing) return MISSING[name] ?? null
  if (name === 'phone' && validity.patternMismatch)
    return 'Enter a phone number with its country code, like +92 300 1234567.'
  if (name === 'email' && validity.typeMismatch)
    return 'Enter an email address like name@company.com.'
  return null
}

const WRONG_KIND = 'We accept PDF, Word, JPG or PNG.'

/**
 * The CV picker's check, before anything is sent: one file, 10 MB, and its first bytes through
 * the SERVER's own check (`checkApplicationFiles`), so the browser refuses exactly what the route
 * would — and the applicant's typing is still on the screen.
 */
export async function pickedCvProblem(files: readonly File[]): Promise<string | null> {
  if (files.length > 1) return 'Choose one file only.'
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > APPLICATION_FILE_MAX_BYTES)
    return `Your CV is ${formatBytes(total)}. Up to 10 MB can be attached — please send a smaller file.`
  const check = await checkApplicationFiles(files)
  if (check.ok) return null
  if (check.reason === 'empty') return `“${check.name}” is empty — please choose it again.`
  if (check.reason === 'type')
    return `“${check.name}” is not a kind we accept, or its contents do not match its name. ${WRONG_KIND}`
  return 'Choose one file only.'
}

const NOT_SENT = 'Your application has not been sent.'

/*
 * ⚠️ CHOSEN FROM THIS TABLE BY CODE; NO QUERY VALUE IS EVER SHOWN. After sending only a code
 * comes back — no file name, no size (`careers/submit/route.ts`) — so the approved CV lines'
 * placeholders read "Your CV", and the sentence that needs the size is left out.
 */
const CV_WRONG_KIND = `${NOT_SENT} Your CV is not a kind we accept, or its contents do not match its name. ${WRONG_KIND}`

const FILE_REASONS: Record<string, string> = {
  'too-many': `${NOT_SENT} Choose one file only.`,
  'too-big': `${NOT_SENT} Up to 10 MB can be attached — please send a smaller file.`,
  empty: `${NOT_SENT} Your CV is empty — please choose it again.`,
  type: CV_WRONG_KIND,
}

export function careersNotice(query: {
  sent?: string
  error?: string
  reason?: string
}): Notice | null {
  if (query.sent) return { kind: 'ok', text: RECEIVED_TEXT }
  if (!query.error) return null
  if (query.error === 'files') {
    return { kind: 'bad', text: FILE_REASONS[query.reason ?? ''] ?? CV_WRONG_KIND }
  }
  if (query.error === 'too-many') {
    return {
      kind: 'bad',
      text: 'That is several applications in a short time. Please wait a few minutes and try again.',
    }
  }
  if (query.error === 'storage') {
    return {
      kind: 'bad',
      text: 'We could not save your application — please try again later, or write to us at the address below.',
    }
  }
  return {
    kind: 'bad',
    text: `${NOT_SENT} Something in the form was not filled in. Please check and send again.`,
  }
}
