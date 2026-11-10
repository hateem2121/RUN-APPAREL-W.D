import { COUNTRIES } from './dialCodes'
import type { InquiryInput } from './inquiry'

/**
 * Which contact-form inquiries are spam, decided from what was typed (owner, 2026-11-10).
 *
 * ⚠️ WHY THIS EXISTS: THE SPAM BECAME REAL. `inquiry.ts` chose a honeypot over a CAPTCHA "until the
 * spam is ever real rather than anticipated". On 2026-11-10 production held 75 inquiries and 69 were
 * spam: 61 from one robot that types "google" as its company, and 8 sales pitches. Every one was
 * emailed to the team, most days. The honeypot caught none of them. The owner chose checks of our
 * own over Turnstile, so the privacy notice can keep saying the site stores nothing on a visit.
 *
 * ⚠️ A CATCH IS QUARANTINED, NEVER DROPPED. The route stores it with status "spam" and sends no
 * email, so a buyer caught by mistake is still in the admin. That is also why every rule below is
 * NARROW: each one is shown in the test NOT to fire on the nearest real thing.
 *
 * ⚠️ NO SIGNED TIMER, THOUGH ONE WAS PLANNED. /contact is kept whole in the shared page store
 * (`apps/cms/CLAUDE.md`, "Public pages are cached twice"), so a time signed into the page would be
 * the same, hours-old value for every visitor. A time set by the page's script would be forged by
 * any robot that runs it, and missing for a buyer with scripting off. What was typed is the
 * evidence we actually have.
 *
 * Judged 2026-11-10 against all 75 production rows, locally (they hold real names, never
 * committed): 69 of 69 spam caught, 0 of 4 real buyers caught.
 */

export type SpamReason = 'robot-company' | 'job-is-subject' | 'unknown-dial-code' | 'sales-pitch'

/** Every calling code a country uses, from the same generated list the form's code box fills from. */
const DIAL_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((country) => country.dial))

/**
 * Phrases from the sales pitches that reached production, and nothing broader. "leads", "SEO" or a
 * link alone can appear in a real buyer's message; these exact phrases did not.
 */
const SALES_PITCH = /freeb2bdata|web visitors into leads|backlinks|tinyurl\.com|bit\.ly\//i

type Typed = Pick<InquiryInput, 'company' | 'jobTitle' | 'subject' | 'phone' | 'message'>

export function spamReasons(value: Typed): SpamReason[] {
  const reasons: SpamReason[] = []

  // The robot types it in lower case, every time (61 of 61). A person who works there writes
  // "Google", so this is an exact match on purpose.
  if (value.company === 'google') reasons.push('robot-company')

  // The robot puts one sentence in both boxes. A person's job title is never their subject: the
  // subject is one of the form's answers or their own words under "Something else…".
  if (value.jobTitle && value.jobTitle === value.subject) reasons.push('job-is-subject')

  // "+8316 89528415162": no country's calling code has four digits or starts "83". Judged only when
  // the number has a "+code " group to judge; a number typed with no space or no + has none.
  const code = /^\+(\d+)\s/.exec(value.phone)?.[1]
  if (code && !DIAL_CODES.has(code)) reasons.push('unknown-dial-code')

  if (SALES_PITCH.test(value.message)) reasons.push('sales-pitch')

  return reasons
}
