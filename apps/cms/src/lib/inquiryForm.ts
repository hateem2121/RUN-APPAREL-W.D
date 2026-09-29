import { checkFiles, formatBytes, MAX_FILES, MAX_TOTAL_BYTES } from './inquiryFiles'

/**
 * The contact form's small decisions, pure so each is a unit test: the progress bar, the file
 * picker's early warning, the message after a submission and the admin link in the email.
 * Imported by the form's client islands and by the page, so nothing here may touch Node.
 */

export type ProgressInput = {
  /** Any field has been focused. */
  started: boolean
  requiredDone: number
  requiredTotal: number
  onStepTwo: boolean
  optionalDone: number
  optionalTotal: number
}

/** "25 MB", as the page and the note under the picker say it (formatBytes would give "25.0 MB"). */
const LIMIT = `${MAX_TOTAL_BYTES / (1024 * 1024)} MB`

const share = (done: number, total: number) => (total > 0 ? Math.min(done, total) / total : 1)

/**
 * 0–100. Step 1's three required fields fill it to half; opening step 2 moves it on, and the
 * optional details fill the rest (owner, 2026-09-29: "two steps plus a live progress bar").
 *
 * ⚠️ IT STARTS AT 10, NOT 0, ONCE A FIELD IS FOCUSED. A bar that begins with a little already
 * done is finished more often than one that starts empty (Nunes & Drèze's endowed-progress
 * effect), and it is honest here: focusing the form IS the first step. It never shows before
 * that, so nobody is told they have progress they did not make.
 *
 * ⚠️ AND IT REACHES 100 ONLY WITH EVERY OPTIONAL DETAIL GIVEN. The bar measures the form, not
 * permission to send: "Send inquiry" is offered from step 1, and the page says the details are
 * optional, so a buyer who sends at 60% has done nothing wrong.
 */
export function formProgress(input: ProgressInput): number {
  if (!input.started && input.requiredDone === 0) return 0
  const stepOne = 10 + 40 * share(input.requiredDone, input.requiredTotal)
  const stepTwo = input.onStepTwo ? 10 + 40 * share(input.optionalDone, input.optionalTotal) : 0
  return Math.round(Math.min(100, stepOne + stepTwo))
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
