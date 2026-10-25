import config from '@payload-config'
import { getPayload } from 'payload'
import { type CheckedFile, formatBytes } from './inquiryFiles'

/**
 * What the contact form and the careers form do AFTER their row is stored (2026-10-25).
 *
 * The two routes were copies of each other: 84 of the careers route's 133 code lines matched the
 * contact route's. This is the shared half, so a fix to how a file is saved or how a failed email
 * is recorded lands in both. What stays in each route is what is genuinely theirs: the fields, the
 * file rules, the redirect addresses, the counters, the inbox and the wording of the email.
 *
 * ⚠️ THE ORDER IS THE POINT, and it is the contact form's owner decision of 2026-09-07 (D3, FA-I-06):
 * the row is stored first (the caller's job), then its files, then mail, then the count. A mail
 * outage costs a notification and can never cost the inquiry or the application. Every step here
 * therefore NEVER THROWS past this function, except the one read that has always been outside a
 * guard (`getPayload` while saving files), so a received message is never turned into an error page.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * ⚠️ THE ADDRESS MAIL IS SENT FROM MUST BE A DOMAIN VERIFIED IN RESEND, AND THAT IS NOT
 * PROVEN HERE. `RESEND_API_KEY` was found already set on this Worker on 2026-09-07, but
 * `wear-run.help`'s SPF record names Hostinger, Google and SendGrid — not Resend — so the
 * domain may not be verified for it. If it is not, every send fails with a 4xx.
 *
 * That is survivable BY DESIGN rather than by luck: the row is already stored, and the failure is
 * written onto it as `notified: false` with the reason beside it, so it is visible in the admin
 * rather than silent. See docs/OWNER-CHECKLIST.md. One sender for both forms (the careers route
 * kept its own copy of this line until 2026-10-25).
 */
const FROM = process.env.INQUIRY_FROM?.trim() || 'inquiries@wear-run.help'

/**
 * The address a request came from, for the rate limit. Cloudflare's header first, then the
 * proxy's, then one shared 'unknown' key: a caller that strips its own headers is counted
 * together rather than exempted (`inquiryRate.ts`).
 */
export function clientAddress(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  )
}

type MailMessage = {
  /** The sender's display name: "RUN APPAREL inquiries", "RUN APPAREL careers". */
  fromName: string
  to: string
  /** Hitting Reply in any mail client answers the person, not the robot. Left out when empty. */
  replyTo?: string
  subject: string
  text: string
}

/** Never throws. A notification is a nice-to-have; the stored row is the thing. */
export async function sendNotification(
  mail: MailMessage,
): Promise<{ notified: boolean; notifyError?: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return { notified: false, notifyError: 'RESEND_API_KEY is not set on this Worker' }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${mail.fromName} <${FROM}>`,
        to: [mail.to],
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return { notified: true }
    return {
      notified: false,
      notifyError: `Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`,
    }
  } catch (err) {
    return { notified: false, notifyError: String(err).slice(0, 200) }
  }
}

/** The two forms' storage, named once so the pairs below cannot be mixed up. */
export type SubmissionStorage =
  | { collection: 'inquiries'; filesCollection: 'inquiry-files'; ownerField: 'inquiry' }
  | {
      collection: 'job-applications'
      filesCollection: 'application-files'
      ownerField: 'application'
    }

/**
 * Store each checked file against its row. Never throws: the row is already stored, so a file that
 * will not save is written onto it (`filesError`) and named in the email, rather than turning a
 * received message into an error page.
 *
 * ⚠️ ONE WRITE PER FILE, AND IT NAMES ITS OWNER. `Inquiries.files` is a join over
 * `inquiry-files.inquiry`, so there is no second update of the inquiry that could fail after the
 * file is already in R2 and leave it unlisted. The files go through `inquiry-files` /
 * `application-files`, the PRIVATE bucket: never give that storage a `generateFileURL` or
 * `disablePayloadAccessControl` (`.claude/rules/cms-site.md`).
 *
 * ⚠️ EACH FILE IS READ HERE, ONE AT A TIME, AND NOWHERE ELSE. At the 25 MB limit the request
 * already holds the upload; `checkFiles` reads only each file's ends, so the one full copy is the
 * one being stored, and it can be freed before the next file is read. Measured 2026-09-29: with
 * every file copied up front, one 24 MB PDF raised a local Workers runtime's memory by 124 MB.
 */
export async function saveFiles(
  storage: SubmissionStorage,
  // D1 ids are integers; `payload.create` types its result's id loosely.
  owner: number,
  files: readonly CheckedFile[],
  /** Names the file in the log: "a file" for the contact form, "the CV" for careers. */
  logTag: string,
  fileNoun: string,
): Promise<{ saved: CheckedFile[]; filesError?: string }> {
  const saved: CheckedFile[] = []
  const failed: string[] = []
  const payload = await getPayload({ config })
  for (const file of files) {
    try {
      await payload.create({
        collection: storage.filesCollection,
        data: { [storage.ownerField]: owner },
        file: {
          data: Buffer.from(await file.file.arrayBuffer()),
          mimetype: file.type,
          name: file.name,
          size: file.size,
        },
        overrideAccess: true,
      } as Parameters<typeof payload.create>[0])
      saved.push(file)
    } catch (err) {
      console.error(`[${logTag}] stored, but ${fileNoun} was not:`, file.name, err)
      failed.push(`${file.name} (${String(err).slice(0, 80)})`)
    }
  }
  return failed.length > 0
    ? { saved, filesError: `Not saved: ${failed.join('; ')}`.slice(0, 500) }
    : { saved }
}

/** Write the outcome onto the row. Never fails the request: the row exists, and that is what matters. */
export async function annotate(
  collection: SubmissionStorage['collection'],
  id: string | number,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const payload = await getPayload({ config })
    await payload.update({ collection, id, data, overrideAccess: true } as Parameters<
      typeof payload.update
    >[0])
  } catch {
    // A failed annotation is not worth a 500. The email still names any file problem.
  }
}

/** What the notification email says about the files, as the two formatters take it. */
type EmailExtras = {
  files: { name: string; size: string }[]
  filesError: string | undefined
  adminUrl: string
}

export type CompletedSubmission = {
  storage: SubmissionStorage
  /** The id Payload returned for the stored row. */
  id: string | number
  files: readonly CheckedFile[]
  /** "inquiry" or "application": the prefix on every log line. */
  logTag: string
  /** How a file reads in the log: "a file", "the CV". */
  fileNoun: string
  /** Read AFTER the files are saved, because the contact form's reads the site settings. */
  recipient: () => Promise<string> | string
  /** The email, from the form's own formatter. The recipient is added here. */
  compose: (extras: EmailExtras) => Omit<MailMessage, 'to'>
  /** The admin screen of the row, linked from the email. */
  adminUrl: string
  /** The count, with NO personal data (audit FA-I-16). */
  count: { event: string; placement: string }
}

/**
 * Everything after the row is stored: its files, the email, the outcome written back onto the row,
 * and the count. Never throws past the one unguarded `getPayload` in `saveFiles` (see the file's
 * header), and never changes what the visitor is told: the caller answers "sent" afterwards.
 */
export async function completeSubmission(submission: CompletedSubmission): Promise<void> {
  const { storage, id, logTag } = submission

  // The files, after the row they belong to. A failure here is recorded, never fatal.
  const stored =
    submission.files.length > 0
      ? await saveFiles(storage, Number(id), submission.files, logTag, submission.fileNoun)
      : { saved: [] as CheckedFile[], filesError: undefined }
  if (stored.filesError) await annotate(storage.collection, id, { filesError: stored.filesError })

  // Only now, and never in a way that can fail the request.
  const to = await submission.recipient()
  const outcome = await sendNotification({
    ...submission.compose({
      files: stored.saved.map((file) => ({ name: file.name, size: formatBytes(file.size) })),
      filesError: stored.filesError,
      adminUrl: submission.adminUrl,
    }),
    to,
  })

  if (!outcome.notified) console.error(`[${logTag}] stored but not notified:`, outcome.notifyError)
  await annotate(
    storage.collection,
    id,
    outcome.notified ? { notified: true } : { notified: false, notifyError: outcome.notifyError },
  )

  /*
   * ⚠️ COUNT IT WHERE THE VIEWER'S ARE COUNTED — audit FA-I-16. A row in `events`, not a beacon
   * from the page: a client counter would cost `connect-src` widened to reach cms.wear-run.help
   * (the site is served from the apex, where `/api` is deliberately the 404), a CORS surface, and
   * JavaScript on a page whose own client bundle is 6.0 KB gzip. The reasons are written out in
   * full at `contact/submit/route.ts`.
   *
   * ⚠️ AND IT CARRIES NO PERSONAL DATA, deliberately: `Events` is read by anyone who can read
   * events. Never awaited in a way that can fail the request: the row is stored and the visitor
   * served, and a missing count is not worth a 500.
   */
  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'events',
      data: { type: 'analytics', ...submission.count },
      overrideAccess: true,
    })
  } catch (err) {
    console.error(`[${logTag}] stored but not counted:`, err)
  }
}
