import config from '@payload-config'
import { type NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import {
  APPLICATIONS_TO,
  type ApplicationEmailExtras,
  type ApplicationInput,
  applicationAdminUrl,
  applicationSubject,
  formatApplicationEmail,
  isHoneypotTripped,
  validateApplication,
} from '../../../../lib/application'
import { checkApplicationFiles } from '../../../../lib/applicationFileTypes'
import { checkApplicationRate } from '../../../../lib/applicationRate'
import { type CheckedFile, formatBytes } from '../../../../lib/inquiryFiles'

export const dynamic = 'force-dynamic'

/**
 * `POST /careers/submit` — the careers form's only entry point (owner, F23, 2026-10-07).
 *
 * A copy of `contact/submit/route.ts`, whose comments carry the reasons, with the careers rules:
 * the application is STORED FIRST and only then emailed, so a mail outage costs a notification
 * and never an application; errors come back as a CODE in the query string, never as the typed
 * values (a name and a phone number in a URL end up in history and logs); a tripped honeypot is
 * answered with success; the allowance is spent only by an application that passed every check,
 * on counters of its own (`applicationRate.ts`); one CV, checked byte by byte before anything is
 * written (`applicationFileTypes.ts`), and refused whole rather than dropped.
 *
 * The notification goes to `APPLICATIONS_TO` (hr@wear-run.com, fixed by the owner's choice), not
 * to the site settings' email that the contact form uses.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** The same verified sender as the contact form (`contact/submit/route.ts` explains the risk). */
const FROM = process.env.INQUIRY_FROM?.trim() || 'inquiries@wear-run.help'

/*
 * ⚠️ EVERY RETURN NAMES THE RESULT ITSELF AS ITS ANCHOR, not the form's section — the contact
 * form's lesson (visual audit VA-01, measured 2026-10-01): with the section as the anchor,
 * Chromium dropped focus to <body>; with the focusable result panel, the browser moves focus
 * there itself, with scripting off as well. The careers page's panels carry these ids.
 */
const back = (
  request: NextRequest,
  params: string,
  anchor: 'application-done' | 'application-problem',
) =>
  NextResponse.redirect(new URL(`/careers${params}#${anchor}`, request.url), {
    // 303: the browser must follow with GET, or a refresh re-posts the form.
    status: 303,
  })
const sent = (request: NextRequest) => back(request, '?sent=1', 'application-done')
const refused = (request: NextRequest, params: string) =>
  back(request, params, 'application-problem')

/** Never throws. A notification is a nice-to-have; the application is the thing. */
async function notify(
  value: ApplicationInput,
  receivedAt: Date,
  extras: ApplicationEmailExtras,
): Promise<{ notified: boolean; notifyError?: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return { notified: false, notifyError: 'RESEND_API_KEY is not set on this Worker' }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `RUN APPAREL careers <${FROM}>`,
        to: [APPLICATIONS_TO],
        // Reply answers the applicant when they gave an email; many floor applicants will not.
        ...(value.email ? { reply_to: value.email } : {}),
        subject: applicationSubject(value),
        text: formatApplicationEmail(value, receivedAt, extras),
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

/** Store the checked CV against its application. Never throws — as `saveFiles` in the contact route. */
async function saveFiles(
  application: number,
  files: readonly CheckedFile[],
): Promise<{ saved: CheckedFile[]; filesError?: string }> {
  const saved: CheckedFile[] = []
  const failed: string[] = []
  const payload = await getPayload({ config })
  for (const file of files) {
    try {
      await payload.create({
        collection: 'application-files',
        data: { application },
        file: {
          data: Buffer.from(await file.file.arrayBuffer()),
          mimetype: file.type,
          name: file.name,
          size: file.size,
        },
        overrideAccess: true,
      })
      saved.push(file)
    } catch (err) {
      console.error('[application] stored, but the CV was not:', file.name, err)
      failed.push(`${file.name} (${String(err).slice(0, 80)})`)
    }
  }
  return failed.length > 0
    ? { saved, filesError: `Not saved: ${failed.join('; ')}`.slice(0, 500) }
    : { saved }
}

/** Write the outcome onto the row. Never fails the request: the application exists. */
async function annotate(id: string | number, data: Record<string, unknown>): Promise<void> {
  try {
    const payload = await getPayload({ config })
    await payload.update({ collection: 'job-applications', id, data, overrideAccess: true })
  } catch {
    // The row exists and that is what matters; the email names any CV problem.
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: Record<string, unknown> = {}
  let attached: unknown[] = []
  try {
    const form = await request.formData()
    raw = Object.fromEntries(form.entries())
    attached = form.getAll('cv')
  } catch {
    return refused(request, '?error=unreadable')
  }

  // Answered with success, on purpose: telling a bot it was caught teaches the next one.
  if (isHoneypotTripped(raw)) return sent(request)

  const result = validateApplication(raw)
  if (!result.ok)
    return refused(request, `?error=invalid&fields=${Object.keys(result.errors).join(',')}`)

  // The CV is checked before the application is stored; a refusal stores nothing.
  const files = await checkApplicationFiles(attached)
  if (!files.ok) return refused(request, `?error=files&reason=${files.reason}`)

  const ip =
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkApplicationRate(ip, Date.now())) return refused(request, '?error=too-many')

  const receivedAt = new Date()
  let created: { id: string | number } | null = null
  try {
    const payload = await getPayload({ config })
    // `overrideAccess: true` is the ONLY way in: `JobApplications.access.create` is closed.
    created = await payload.create({
      collection: 'job-applications',
      data: { ...result.value, status: 'new', notified: false },
      overrideAccess: true,
    })
  } catch (err) {
    console.error('[application] could not be stored:', err)
    return refused(request, '?error=storage')
  }

  const stored =
    files.files.length > 0 ? await saveFiles(Number(created.id), files.files) : { saved: [] }
  if (stored.filesError) await annotate(created.id, { filesError: stored.filesError })

  const outcome = await notify(result.value, receivedAt, {
    files: stored.saved.map((file) => ({ name: file.name, size: formatBytes(file.size) })),
    filesError: stored.filesError,
    adminUrl: applicationAdminUrl(created.id),
  })
  if (!outcome.notified)
    console.error('[application] stored but not notified:', outcome.notifyError)
  await annotate(
    created.id,
    outcome.notified ? { notified: true } : { notified: false, notifyError: outcome.notifyError },
  )

  // A count where the inquiries are counted, with NO personal data (contact route, FA-I-16).
  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'events',
      data: { type: 'analytics', event: 'application_submitted', placement: 'site-careers-form' },
      overrideAccess: true,
    })
  } catch (err) {
    console.error('[application] stored but not counted:', err)
  }

  return sent(request)
}
