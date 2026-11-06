import config from '@payload-config'
import { type NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { formResult } from '../../../../../lib/formResult'
import { annotate, clientAddress, sendNotification } from '../../../../../lib/formSubmission'
import { inquiryRecipient, isHoneypotTripped, LOOKS_LIKE_EMAIL } from '../../../../../lib/inquiry'
import {
  TEMPLATE_FILE_NAME,
  TEMPLATE_MIME,
  techPackTemplate,
} from '../../../../../lib/techPackTemplate'
import {
  formatTemplateDownloadEmail,
  TEMPLATE_PAGE,
  TEMPLATE_PROBLEM_ID,
  templateDownloadAdminUrl,
  templateDownloadSubject,
  validateTemplateDownload,
} from '../../../../../lib/templateDownload'
import { checkTemplateDownloadRate } from '../../../../../lib/templateDownloadRate'

export const dynamic = 'force-dynamic'

/**
 * `POST /guides/tech-pack-template/download` — the free tech-pack template's only way out (C1, owner
 * approved 6 Nov 2026: "an email address is required to download; each email is saved in the CMS and
 * also emailed to the owner").
 *
 * The contact form's posture, for its reasons (`contact/submit/route.ts`): a route handler, not on
 * `/api`; errors come back as a CODE in the query string, never the typed values; nothing is kept on
 * the visitor's device. Stored first, emailed second: a mail outage costs a notice, never the record.
 *
 * ⚠️ SUCCESS IS THE FILE ITSELF, NOT A REDIRECT. A plain post (no script) gets the workbook as an
 * attachment and the browser saves it while the page stays put; the page's own script asks with
 * `PROGRESS_HEADER` and saves the same bytes. There is no public address for the file: it is built
 * here, in the Worker, after the details are stored (`techPackTemplate.ts`).
 *
 * ⚠️ A FAILED SAVE GIVES NO FILE. The owner's condition was that every download is recorded; a
 * template handed out while the database was down would be a download nobody can see.
 */
const refused = (request: NextRequest, params: string) =>
  formResult(request, new URL(`${TEMPLATE_PAGE}${params}#${TEMPLATE_PROBLEM_ID}`, request.url))

function theFile(): NextResponse {
  return new NextResponse(Buffer.from(techPackTemplate()), {
    headers: {
      'content-type': TEMPLATE_MIME,
      'content-disposition': `attachment; filename="${TEMPLATE_FILE_NAME}"`,
      // Each download is a person's details; no cache in between may answer the next one.
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** The owner's own copy, when the Worker has his address (`TEMPLATE_NOTICE_OWNER`). */
function ownerCopy(): string[] {
  const address = process.env.TEMPLATE_NOTICE_OWNER?.trim()
  return address && LOOKS_LIKE_EMAIL.test(address) ? [address] : []
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: Record<string, unknown> = {}
  try {
    raw = Object.fromEntries((await request.formData()).entries())
  } catch {
    return refused(request, '?error=unreadable')
  }

  // A tripped honeypot gets what a person gets, so the bot learns nothing; nothing is stored or sent.
  if (isHoneypotTripped(raw)) return theFile()

  const result = validateTemplateDownload(raw)
  if (!result.ok) {
    return refused(request, `?error=invalid&fields=${Object.keys(result.errors).join(',')}`)
  }

  // Spent only by a download that passed every check (the contact form's rule, final review 2026-09-29).
  if (!checkTemplateDownloadRate(clientAddress(request), Date.now())) {
    return refused(request, '?error=too-many')
  }

  const receivedAt = new Date()
  const { value } = result
  let id: string | number
  try {
    const payload = await getPayload({ config })
    // `overrideAccess: true` is the only way in: `TemplateDownloads.access.create` is closed to all.
    const created = await payload.create({
      collection: 'template-downloads',
      data: {
        template: 'tech-pack',
        name: value.name,
        email: value.email,
        company: value.company,
        country: value.country,
        jobTitle: value.jobTitle,
        whatsapp: value.whatsapp,
        updates: value.updates,
        // The record of a yes, and only of a yes (owner: "record each yes").
        ...(value.updates ? { updatesAt: receivedAt.toISOString() } : {}),
        notified: false,
      },
      overrideAccess: true,
    })
    id = created.id
  } catch (err) {
    console.error('[template-download] could not be stored:', err)
    return refused(request, '?error=storage')
  }

  // The notice: inquiry@ (the address the site shows) and the owner. Never fails the download.
  const settings = await getPayload({ config })
    .then((p) => p.findGlobal({ slug: 'site-settings', depth: 0 }))
    .catch(() => null)
  const adminUrl = templateDownloadAdminUrl(id)
  const outcome = await sendNotification({
    fromName: 'RUN APPAREL website',
    to: [inquiryRecipient(settings as Record<string, unknown> | null), ...ownerCopy()],
    // Reply answers the person who downloaded it, as the contact form's notice does.
    replyTo: value.email,
    subject: templateDownloadSubject(value),
    text: formatTemplateDownloadEmail(value, receivedAt, adminUrl),
  })
  if (!outcome.notified)
    console.error('[template-download] stored but not notified:', outcome.notifyError)
  await annotate(
    'template-downloads',
    id,
    outcome.notified ? { notified: true } : { notified: false, notifyError: outcome.notifyError },
  )

  // Counted where every form is counted, with no personal data (audit FA-I-16).
  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'events',
      data: { type: 'analytics', event: 'template_download', placement: 'tech-pack-guide' },
      overrideAccess: true,
    })
  } catch (err) {
    console.error('[template-download] stored but not counted:', err)
  }

  return theFile()
}
