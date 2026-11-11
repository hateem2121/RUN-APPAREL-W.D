import config from '@payload-config'
import type { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { formResult } from '../../../../lib/formResult'
import { clientAddress, completeSubmission, sendNotification } from '../../../../lib/formSubmission'
import {
  formatInquiryEmail,
  inquiryRecipient,
  isHoneypotTripped,
  validateInquiry,
} from '../../../../lib/inquiry'
import { checkFiles } from '../../../../lib/inquiryFiles'
import { buyerReceipt, teamEmailHtml, teamSubject } from '../../../../lib/inquiryEmailHtml'
import { inquiryAdminUrl } from '../../../../lib/inquiryForm'
import { checkInquiryRate } from '../../../../lib/inquiryRate'
import { RECEIPT_WINDOW_MS, RECEIPTS_PER_DAY, receiptAllowed } from '../../../../lib/inquiryReceipt'
import { spamReasons } from '../../../../lib/inquirySpam'
import { checkTurnstile, TURNSTILE_FIELD, turnstileSpamReasons } from '../../../../lib/turnstile'

export const dynamic = 'force-dynamic'

/**
 * `POST /contact/submit` — the contact form's only entry point.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06). The audit's case against a form was that one
 * which silently drops a buyer's message is worse than a mailto link that works. The
 * answer is the ORDER of the two writes below: the inquiry is stored, and only then is
 * mail attempted. A mail outage costs a notification; it can never cost the inquiry.
 *
 * ⚠️ A ROUTE HANDLER, NOT A SERVER ACTION, AND NOT ON `/api`.
 *
 * `/api/*` belongs to Payload's own catch-all, and the launch host rules answer `/api` on
 * the public address with the 404 — so a form posting there would break the moment the
 * site moved to its real address. A Server Action would give inline errors without
 * JavaScript, and was not chosen: this stack has already been bitten once this week by
 * assuming a framework feature server-renders when it does not (vercel/next.js#62228, the
 * blank 404), and a plain `<form method="post">` to a plain handler has no such question
 * hanging over it.
 *
 * ⚠️ ERRORS COME BACK AS A CODE IN THE QUERY STRING AND NEVER AS THE TYPED VALUES.
 * Putting a name, an employer or a message in a URL writes them into browser history,
 * every proxy log and every `Referer` header on the way out. Preserving them across the
 * redirect instead would need a cookie — and this site's privacy notice gets to say it
 * stores NOTHING on the visitor's device, which is measured (FA-O-74) and is why it needs
 * no consent banner. One cookie would end that.
 *
 * The cost is that a rejected inquiry is retyped. It is kept small by native HTML
 * validation — `required`, `type="email"`, `maxlength` — which the browser enforces with
 * scripting off, so the ordinary mistakes never reach here at all.
 */

/*
 * ⚠️ EVERY RETURN NAMES THE RESULT ITSELF AS ITS ANCHOR (visual audit VA-01). Without an anchor
 * the page reloaded at the top and the result sat a screen or more below the hero: 37px of it
 * visible at 1440x900, none at all on a phone held sideways.
 *
 * ⚠️ THE RESULT, NOT THE SECTION. With `#inquiry` (the section) Chromium applied the anchor after
 * the page's script had focused the result and, the section not being focusable, dropped focus
 * to <body> — 10 of 10 runs under load, measured 2026-10-01, a race the script cannot win. The
 * result panels are focusable (`tabIndex={-1}`, `InquiryOutcome.tsx`), so with the anchor on them
 * the browser itself moves focus there, with scripting off as well.
 */
// A 303 for a plain post; the address as data for the page's own upload (`lib/formResult.ts`).
const back = (request: NextRequest, params: string, anchor: 'inquiry-done' | 'inquiry-problem') =>
  formResult(request, new URL(`/contact${params}#${anchor}`, request.url))
const sent = (request: NextRequest) => back(request, '?sent=1', 'inquiry-done')
const refused = (request: NextRequest, params: string) => back(request, params, 'inquiry-problem')

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: Record<string, unknown> = {}
  let attached: unknown[] = []
  try {
    const form = await request.formData()
    raw = Object.fromEntries(form.entries())
    attached = form.getAll('files')
  } catch {
    return refused(request, '?error=unreadable')
  }

  /*
   * ⚠️ A TRIPPED HONEYPOT IS ANSWERED WITH SUCCESS, ON PURPOSE. Telling a bot it was
   * detected is how the next version of it learns to skip the field. Nothing is stored
   * and nothing is sent; it simply sees the same thank-you a person does.
   */
  if (isHoneypotTripped(raw)) return sent(request)

  const result = validateInquiry(raw)
  if (!result.ok)
    return refused(request, `?error=invalid&fields=${Object.keys(result.errors).join(',')}`)

  /*
   * ⚠️ FILES ARE CHECKED BEFORE THE INQUIRY IS STORED, AND A REFUSAL STORES NOTHING. A program
   * renamed `.pdf`, a sixth file or 25 MB and a byte is refused whole, with the reason as a CODE
   * (`lib/inquiryForm.ts` turns it into words, and the page says the message was NOT sent). The
   * alternative — store the text and drop the file — would thank a buyer for a tech pack that
   * never arrived.
   */
  const files = await checkFiles(attached)
  if (!files.ok) return refused(request, `?error=files&reason=${files.reason}`)

  /*
   * ⚠️ THE ALLOWANCE IS SPENT ONLY BY AN INQUIRY THAT PASSED EVERY CHECK (final review,
   * 2026-09-29). It used to be checked first, so a buyer whose tries were refused — a missing
   * field, a mislabelled file — could be locked out of the one that was right. The form is
   * already read by this point either way, so checking later costs nothing, and a refused
   * attempt stores nothing and sends nothing to limit.
   */
  if (!checkInquiryRate(clientAddress(request), Date.now()))
    return refused(request, '?error=too-many')

  const receivedAt = new Date()

  /*
   * ⚠️ SPAM IS KEPT, NOT EMAILED, AND THANKED LIKE ANYONE ELSE (owner, 2026-11-10). 69 of the 75
   * inquiries in production were spam and every one reached the team's inbox. A caught one is
   * stored with status "spam" and the reasons, its files are not stored, no email goes out and it
   * is not counted — and it sees the same thank-you, for the honeypot's reason above.
   */
  /*
   * ⚠️ TURNSTILE JOINS THE SPAM CHECKS, NEVER THE REFUSALS (owner, 11 Nov 2026; `lib/turnstile.ts`).
   * A failed or missing token is held as spam like the rest, so a buyer with scripting off is still
   * stored; an unset secret or a Cloudflare outage judges nothing and the inquiry goes on as before.
   */
  const human = await checkTurnstile({
    token: raw[TURNSTILE_FIELD],
    secret: process.env.TURNSTILE_SECRET,
    remoteip: clientAddress(request),
  })
  const spam: string[] = [...spamReasons(result.value), ...turnstileSpamReasons(human)]
  if (spam.length > 0) {
    try {
      const payload = await getPayload({ config })
      await payload.create({
        collection: 'inquiries',
        data: {
          ...result.value,
          status: 'spam',
          notified: false,
          notifyError: `Not emailed: held as spam (${spam.join(', ')}).`,
        },
        overrideAccess: true,
      })
    } catch (err) {
      console.error('[inquiry] could not store a spam catch:', err)
    }
    return sent(request)
  }

  let created: { id: string | number } | null = null
  try {
    const payload = await getPayload({ config })
    /*
     * ⚠️ `overrideAccess: true` IS WHAT LETS THIS WRITE AT ALL, and it is why
     * `Inquiries.access.create` is closed to everyone. The only path into that collection
     * is this function, which has already checked the honeypot, the shape of the input,
     * the files and the rate limit. Opening `create` instead would put the collection's REST
     * endpoint on the internet with none of those.
     */
    created = await payload.create({
      collection: 'inquiries',
      data: { ...result.value, status: 'new', notified: false },
      overrideAccess: true,
    })
  } catch (err) {
    // The one genuinely bad outcome: nothing stored. Say so rather than thanking them.
    console.error('[inquiry] could not be stored:', err)
    return refused(request, '?error=storage')
  }

  const id = created.id
  // The address the site shows, read AFTER the inquiry is stored so a settings outage can never
  // cost the inquiry; when it cannot be read, `inquiryRecipient` answers with the default.
  const recipient = async () => {
    const settings = await getPayload({ config })
      .then((p) => p.findGlobal({ slug: 'site-settings', depth: 0 }))
      .catch(() => null)
    return inquiryRecipient(settings as Record<string, unknown> | null)
  }

  // The files, the email, what happened to it and the count: `lib/formSubmission.ts`, shared with
  // the careers form. Never throws past here, and never changes what the visitor is told.
  await completeSubmission({
    storage: { collection: 'inquiries', filesCollection: 'inquiry-files', ownerField: 'inquiry' },
    id,
    files: files.files,
    logTag: 'inquiry',
    fileNoun: 'a file',
    recipient,
    compose: (extras) => ({
      fromName: 'RUN APPAREL inquiries',
      // Hitting Reply in any mail client answers the customer, not the robot.
      replyTo: result.value.email,
      // The reference leads, so a thread and its admin row match at a glance (owner, 2026-11-10).
      subject: teamSubject(result.value, id),
      text: formatInquiryEmail(result.value, receivedAt, extras),
      html: teamEmailHtml({ value: result.value, id, receivedAt, extras }),
    }),
    adminUrl: inquiryAdminUrl(id),
    count: { event: 'inquiry_submitted', placement: 'site-contact-form' },
  })

  /*
   * ⚠️ THE BUYER'S RECEIPT GOES ONLY HERE: after every check, and never to spam (owner,
   * 2026-11-10). It repeats nothing they typed (`lib/inquiryEmailHtml.ts` says why), and a reply to
   * it reaches the team's inbox. Like the notice it never throws, and a failure is logged, not shown:
   * the inquiry is stored and the team has it either way.
   */
  /*
   * ⚠️ ONE RECEIPT PER MAILBOX PER DAY, AND A CEILING FOR THE SITE (security reviews, 2026-11-10).
   * The receipt goes to an address nobody has proven is theirs; `lib/inquiryReceipt.ts` has the
   * two bounds and why. The day's other inquiries are read from the database (every Worker sees the
   * same rows; the rate limit lives in one isolate's memory), spam rows included. When they cannot
   * be read, no receipt: the team still has the inquiry.
   */
  const earlier = await getPayload({ config })
    .then((p) =>
      p.find({
        collection: 'inquiries',
        where: {
          and: [
            {
              createdAt: {
                greater_than: new Date(receivedAt.getTime() - RECEIPT_WINDOW_MS).toISOString(),
              },
            },
            { id: { not_equals: id } },
          ],
        },
        select: { email: true },
        depth: 0,
        limit: RECEIPTS_PER_DAY,
        pagination: false,
        overrideAccess: true,
      }),
    )
    .then((found) => found.docs.map((doc) => String(doc.email ?? '')))
    .catch(() => null)
  if (receiptAllowed(result.value.email, earlier)) {
    const receipt = buyerReceipt({ id, subject: result.value.subject })
    const confirmed = await sendNotification({
      fromName: 'RUN APPAREL',
      to: result.value.email,
      replyTo: await recipient(),
      ...receipt,
    })
    if (!confirmed.notified) console.error('[inquiry] receipt not sent:', confirmed.notifyError)
  }

  // The visitor's experience does not depend on the email. Their message is safe either way.
  return sent(request)
}
