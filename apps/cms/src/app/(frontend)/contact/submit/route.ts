import config from '@payload-config'
import { type NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import {
  type EnquiryInput,
  enquirySubject,
  formatEnquiryEmail,
  isHoneypotTripped,
  validateEnquiry,
} from '../../../../lib/enquiry'
import { checkEnquiryRate } from '../../../../lib/enquiryRate'

export const dynamic = 'force-dynamic'

/**
 * `POST /contact/submit` — the contact form's only entry point.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06). The audit's case against a form was that one
 * which silently drops a buyer's message is worse than a mailto link that works. The
 * answer is the ORDER of the two writes below: the enquiry is stored, and only then is
 * mail attempted. A mail outage costs a notification; it can never cost the enquiry.
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
 * The cost is that a rejected enquiry is retyped. It is kept small by native HTML
 * validation — `required`, `type="email"`, `maxlength` — which the browser enforces with
 * scripting off, so the ordinary mistakes never reach here at all.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * ⚠️ THE ADDRESS MAIL IS SENT FROM MUST BE A DOMAIN VERIFIED IN RESEND, AND THAT IS NOT
 * PROVEN HERE. `RESEND_API_KEY` was found already set on this Worker on 2026-09-07, but
 * `wear-run.help`'s SPF record names Hostinger, Google and SendGrid — not Resend — so the
 * domain may not be verified for it. If it is not, every send fails with a 4xx.
 *
 * That is survivable BY DESIGN rather than by luck: the enquiry is already stored, and
 * the failure is written onto the row as `notified: false` with the reason beside it, so
 * it is visible in the admin rather than silent. See docs/OWNER-CHECKLIST.md.
 */
const FROM = process.env.ENQUIRY_FROM?.trim() || 'enquiries@wear-run.help'

const back = (request: NextRequest, params: string) =>
  NextResponse.redirect(new URL(`/contact${params}`, request.url), {
    // 303: the browser must follow with GET, or a refresh re-posts the form.
    status: 303,
  })

/** Never throws. A notification is a nice-to-have; the enquiry is the thing. */
async function notify(
  value: EnquiryInput,
  receivedAt: Date,
  to: string,
): Promise<{ notified: boolean; notifyError?: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return { notified: false, notifyError: 'RESEND_API_KEY is not set on this Worker' }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `RUN APPAREL enquiries <${FROM}>`,
        to: [to],
        // Hitting Reply in any mail client answers the customer, not the robot.
        reply_to: value.email,
        subject: enquirySubject(value),
        text: formatEnquiryEmail(value, receivedAt),
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: Record<string, unknown> = {}
  try {
    const form = await request.formData()
    raw = Object.fromEntries(form.entries())
  } catch {
    return back(request, '?error=unreadable')
  }

  /*
   * ⚠️ A TRIPPED HONEYPOT IS ANSWERED WITH SUCCESS, ON PURPOSE. Telling a bot it was
   * detected is how the next version of it learns to skip the field. Nothing is stored
   * and nothing is sent; it simply sees the same thank-you a person does.
   */
  if (isHoneypotTripped(raw)) return back(request, '?sent=1')

  const ip =
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkEnquiryRate(ip, Date.now())) return back(request, '?error=too-many')

  const result = validateEnquiry(raw)
  if (!result.ok)
    return back(request, `?error=invalid&fields=${Object.keys(result.errors).join(',')}`)

  const receivedAt = new Date()
  let created: { id: string | number } | null = null
  try {
    const payload = await getPayload({ config })
    /*
     * ⚠️ `overrideAccess: true` IS WHAT LETS THIS WRITE AT ALL, and it is why
     * `Enquiries.access.create` is closed to everyone. The only path into that collection
     * is this function, which has already checked the honeypot, the rate limit and the
     * shape of the input. Opening `create` instead would put the collection's REST
     * endpoint on the internet with none of those.
     */
    created = await payload.create({
      collection: 'enquiries',
      data: { ...result.value, status: 'new', notified: false },
      overrideAccess: true,
    })
  } catch (err) {
    // The one genuinely bad outcome: nothing stored. Say so rather than thanking them.
    console.error('[enquiry] could not be stored:', err)
    return back(request, '?error=storage')
  }

  // Only now, and never in a way that can fail the request.
  const settings = await getPayload({ config })
    .then((p) => p.findGlobal({ slug: 'site-settings', depth: 0 }))
    .catch(() => null)
  const to = (settings as { email?: string } | null)?.email || 'partner@wear-run.com'
  const outcome = await notify(result.value, receivedAt, to)

  if (!outcome.notified) {
    console.error('[enquiry] stored but not notified:', outcome.notifyError)
    try {
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'enquiries',
        id: created.id,
        data: { notified: false, notifyError: outcome.notifyError },
        overrideAccess: true,
      })
    } catch {
      // The row exists and that is what matters. A failed annotation is not worth a 500.
    }
  } else {
    try {
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'enquiries',
        id: created.id,
        data: { notified: true },
        overrideAccess: true,
      })
    } catch {
      /* as above */
    }
  }

  // The visitor's experience does not depend on the email. Their message is safe either way.
  return back(request, '?sent=1')
}
