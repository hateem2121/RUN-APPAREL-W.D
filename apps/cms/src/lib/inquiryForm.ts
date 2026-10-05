import { checkFiles, formatBytes, MAX_FILES, MAX_TOTAL_BYTES } from './inquiryFiles'

/**
 * The contact form's small decisions, pure so each is a unit test: the words the single-step
 * form shows, the message under a wrongly filled field, the file picker's early warning, the
 * message after a submission and the admin link in the email. Imported by the form's client
 * islands and by the page, so nothing here may touch Node.
 *
 * ⚠️ ONE STEP SINCE 2026-10-01 (owner, visual audit VA-02). The two-step form and its progress
 * bar (2026-09-29) were replaced by one column with every field showing; the bar's arithmetic
 * left with it. Every new line of wording below was approved by the owner as W1–W10.
 */

/** "25 MB", as the page and the note under the picker say it (formatBytes would give "25.0 MB"). */
const LIMIT = `${MAX_TOTAL_BYTES / (1024 * 1024)} MB`

/**
 * The line at the top of the form that says what the red * means (polish D7, the owner's answer
 * Q17, 2026-10-03): only Name, Email and Message must be filled, and the word "optional" appears
 * nowhere. This reverses the site's earlier rule of marking the optional boxes (W1, "Optional
 * details", 2026-10-01): the owner chose it, seeing three boxes to mark against six.
 */
export const REQUIRED_KEY = 'Fields marked * are needed. Everything else helps us reply faster.'
/**
 * The subjects a buyer taps (D7: the owner's answers Q15 and Q43), one at a time, then the one
 * that opens a box for their own words. The chosen answer's words are what the route stores.
 */
export const SUBJECTS = [
  'Request a quote',
  'Develop a new product',
  'Samples',
  'Private label & branding',
  'Repeat or bulk order',
] as const
export const SUBJECT_OTHER_LABEL = 'Something else…'
/** W6, the heading of the list of mistakes shown on Send. */
export const SUMMARY_HEADING = 'Check these before sending:'
/** W7, the Send button while the inquiry is on its way. */
export const SENDING_LABEL = 'Sending…'
/**
 * W8, the heading of the confirmation that replaces the form: "Got it." with a tick that draws
 * itself, as the owner tried it in the report's D7 v2 (3 Oct; it was "Inquiry received.").
 */
export const RECEIVED_HEADING = 'Got it.'
/** W9, the link under the confirmation that shows an empty form again. */
export const SEND_ANOTHER = 'Send another inquiry'
/** W10's opening words; the email address and WhatsApp number follow it. */
export const NEED_US_SOONER = 'Need us sooner?'

/** The parts of `ValidityState` the form's messages depend on. */
export type FieldValidity = Pick<ValidityState, 'valid' | 'valueMissing' | 'typeMismatch'>

/** W2, W3 and W5: a required field left empty. */
const MISSING: Record<string, string> = {
  name: 'Enter your name.',
  email: 'Enter your email address.',
  message: 'Tell us what you are making. One sentence is enough.',
}

/**
 * The sentence shown under a field and in the list at the top of the form, or null when the
 * field is fine. Written as instructions, in the field's own words (GOV.UK error message
 * guidance, updated Jan 2024).
 *
 * ⚠️ THE FILE FIELD SPEAKS FOR ITSELF. The picker already explains a refused pick in its own
 * words (`pickedFileProblem`) and puts the same text in the field's custom validity, so that text
 * is passed through here unchanged rather than replaced by a second, vaguer sentence.
 */
export function fieldError(
  name: string,
  validity: FieldValidity,
  customMessage = '',
): string | null {
  if (validity.valid) return null
  if (name === 'files') return customMessage || null
  if (validity.valueMissing) return MISSING[name] ?? null
  // W4.
  if (name === 'email' && validity.typeMismatch)
    return 'Enter an email address like name@company.com.'
  return null
}

/**
 * What the file picker says before a pick is sent, or null when the server would accept its
 * count and size. The server checks again (`checkFiles`): this only saves a buyer a wasted
 * upload and a retyped message.
 */
export function pickProblem(files: readonly { size: number }[]): string | null {
  if (files.length > MAX_FILES)
    return `You chose ${files.length} files. Up to ${MAX_FILES} can be attached — email the rest, or paste a WeTransfer or Drive link in your message.`
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > MAX_TOTAL_BYTES)
    return `These files come to ${formatBytes(total)}. Up to ${LIMIT} in total can be attached — for larger files, paste a WeTransfer or Drive link in your message.`
  return null
}

/**
 * The picker's full check: the count and size above, then every file's first bytes through the
 * SERVER's own `checkFiles`, so the browser refuses exactly what the route would.
 *
 * ⚠️ WHY IN THE BROWSER TOO (final review, 2026-09-29). The route refuses the whole inquiry on a
 * bad file, after up to 25 MB has uploaded, and the page it returns to cannot refill what was
 * typed (the values never travel in the URL). A phone photo saved as ".jpg" or a PDF without its
 * ending cost the buyer their message. Checked here, the send is blocked before it goes and the
 * message is still on the screen. The server still decides.
 */
export async function pickedFileProblem(files: readonly File[]): Promise<string | null> {
  const counted = pickProblem(files)
  if (counted) return counted
  const check = await checkFiles(files)
  if (check.ok) return null
  if (check.reason === 'empty') return `“${check.name}” is empty — please choose it again.`
  if (check.reason === 'type')
    return `“${check.name}” is not a kind we accept, or its contents do not match its name. We accept photos (JPG, PNG, WebP, HEIC), PDF, Word, Excel, PowerPoint, Keynote, Illustrator and Photoshop files.`
  return pickProblem(files)
}

export type Notice = { kind: 'ok' | 'bad'; text: string }

const NOT_SENT = 'Your message has not been sent.'

/**
 * ⚠️ EVERY MESSAGE IS CHOSEN FROM THIS TABLE BY CODE; NO QUERY VALUE IS EVER SHOWN. The codes
 * come back in the URL (`contact/submit/route.ts` explains why never the typed values), and a
 * URL can be written by anyone, so an unknown code gets the generic line rather than itself.
 */
const WRONG_KIND = `${NOT_SENT} One of the files is not a kind we accept, or could not be read. We accept photos (JPG, PNG, WebP, HEIC), PDF, Word, Excel, PowerPoint, Keynote, Illustrator and Photoshop files.`

const FILE_REASONS: Record<string, string> = {
  'too-many': `${NOT_SENT} Up to ${MAX_FILES} files can be attached — please send it again with fewer, or email the rest.`,
  'too-big': `${NOT_SENT} The files came to more than ${LIMIT} in total — please send it again with smaller files, or paste a WeTransfer or Drive link in your message.`,
  empty: `${NOT_SENT} One of the files was empty — please choose it again and send.`,
  type: WRONG_KIND,
}

export function inquiryNotice(query: {
  sent?: string
  error?: string
  reason?: string
}): Notice | null {
  if (query.sent) {
    return { kind: 'ok', text: 'Thank you — your inquiry is with us. We reply within 24 hours.' }
  }
  if (!query.error) return null
  if (query.error === 'files') {
    return { kind: 'bad', text: FILE_REASONS[query.reason ?? ''] ?? WRONG_KIND }
  }
  if (query.error === 'too-many') {
    return {
      kind: 'bad',
      text: 'That is several inquiries in a short time. Please wait a few minutes, or email us directly.',
    }
  }
  if (query.error === 'storage') {
    return {
      kind: 'bad',
      text: 'We could not save your message — please email us directly so it is not lost.',
    }
  }
  return {
    kind: 'bad',
    text: 'Something in the form was not filled in. Please check and send again.',
  }
}

/**
 * The inquiry's own screen in the admin. Files are opened there (they download, behind the
 * sign-in) and are never attached to the email, so this link is how the owner reaches them.
 * The admin lives on cms.wear-run.help only: the public site answers `/admin` with the 404.
 */
export function inquiryAdminUrl(id: string | number): string {
  return `https://cms.wear-run.help/admin/collections/inquiries/${encodeURIComponent(String(id))}`
}
