import config from '@payload-config'
import type { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import {
  APPLICATIONS_TO,
  applicationAdminUrl,
  applicationSubject,
  formatApplicationEmail,
  isHoneypotTripped,
  validateApplication,
} from '../../../../lib/application'
import { checkApplicationFiles } from '../../../../lib/applicationFileTypes'
import { checkApplicationRate } from '../../../../lib/applicationRate'
import { formResult } from '../../../../lib/formResult'
import { clientAddress, completeSubmission } from '../../../../lib/formSubmission'

export const dynamic = 'force-dynamic'

/**
 * `POST /careers/submit` — the careers form's only entry point (owner, F23, 2026-10-07).
 *
 * The contact route's twin (`contact/submit/route.ts`, whose comments carry the reasons), with the
 * careers rules: the application is STORED FIRST and only then emailed, so a mail outage costs a
 * notification and never an application; errors come back as a CODE in the query string, never as
 * the typed values (a name and a phone number in a URL end up in history and logs); a tripped
 * honeypot is answered with success; the allowance is spent only by an application that passed
 * every check, on counters of its own (`applicationRate.ts`); one CV, checked byte by byte before
 * anything is written (`applicationFileTypes.ts`), and refused whole rather than dropped.
 *
 * Since 2026-10-25 the two routes share what happens AFTER the row is stored (the files, the email,
 * the note on the row, the count) in `lib/formSubmission.ts`; they used to be copies.
 *
 * The notification goes to `APPLICATIONS_TO` (hr@wear-run.com, fixed by the owner's choice), not
 * to the site settings' email that the contact form uses.
 */

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
  // A 303 for a plain post; the address as data for the page's own upload (`lib/formResult.ts`).
  formResult(request, new URL(`/careers${params}#${anchor}`, request.url))
const sent = (request: NextRequest) => back(request, '?sent=1', 'application-done')
const refused = (request: NextRequest, params: string) =>
  back(request, params, 'application-problem')

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

  if (!checkApplicationRate(clientAddress(request), Date.now()))
    return refused(request, '?error=too-many')

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

  await completeSubmission({
    storage: {
      collection: 'job-applications',
      filesCollection: 'application-files',
      ownerField: 'application',
    },
    id: created.id,
    files: files.files,
    logTag: 'application',
    fileNoun: 'the CV',
    recipient: () => APPLICATIONS_TO,
    compose: (extras) => ({
      fromName: 'RUN APPAREL careers',
      // Reply answers the applicant when they gave an email; many floor applicants will not.
      replyTo: result.value.email,
      subject: applicationSubject(result.value),
      text: formatApplicationEmail(result.value, receivedAt, extras),
    }),
    adminUrl: applicationAdminUrl(created.id),
    // A count where the inquiries are counted, with NO personal data (contact route, FA-I-16).
    count: { event: 'application_submitted', placement: 'site-careers-form' },
  })

  return sent(request)
}
