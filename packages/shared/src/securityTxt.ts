/**
 * The security.txt (RFC 9116) every host serves — decided 2026-09-18, live from the merge
 * that deploys it. ONE text, served by the documents Worker (catalogue./profile. on both
 * zones), the CMS (wear-run.help and cms.; www. redirects to the apex copy) and the viewer.
 *
 * WHY ONE SOURCE. internet.nl recommended a security.txt on all six audited hosts. Three
 * separate copies would drift the day one is renewed and the others are not — and a stale
 * Expires is exactly what RFC 9116 §2.5.5 exists to catch.
 *
 * ⚠️ RENEWING IT (once a year). Change SECURITY_TXT_EXPIRES (at most a year ahead) and
 * SECURITY_TXT_REVIEWED, then deploy. `scripts/public-security-probe.mjs` reads every host's
 * live copy daily and fails 30 days before the expiry, so nobody has to remember. The date
 * matches wear-run.com's own security.txt (run by the email-signature project), so both
 * domains renew together.
 *
 * ⚠️ CANONICAL LISTS EVERY ADDRESS THAT SERVES IT DIRECTLY. www. is absent on purpose: it
 * answers a 308 to the apex copy, and internet.nl follows that redirect
 * (`checks/tasks/securitytxt.py`, read 2026-09-18).
 */

export const SECURITY_TXT_CONTACT = 'mailto:team@wear-run.com'

/** At most a year after SECURITY_TXT_REVIEWED. The test pins that relationship. */
export const SECURITY_TXT_EXPIRES = '2027-09-01T00:00:00.000Z'

/** The day a person last confirmed the contact still reaches someone. */
export const SECURITY_TXT_REVIEWED = '2026-09-18'

export const SECURITY_TXT_POLICY = 'https://github.com/hateem2121/RUN-APPAREL-W.D/security/policy'

export const SECURITY_TXT_CANONICAL = [
  'wear-run.help',
  'cms.wear-run.help',
  'viewer.wear-run.help',
  'catalogue.wear-run.help',
  'profile.wear-run.help',
  'catalogue.wear-run.com',
  'profile.wear-run.com',
].map((host) => `https://${host}/.well-known/security.txt`)

export const SECURITY_TXT = `${[
  `Contact: ${SECURITY_TXT_CONTACT}`,
  `Expires: ${SECURITY_TXT_EXPIRES}`,
  'Preferred-Languages: en',
  `Policy: ${SECURITY_TXT_POLICY}`,
  ...SECURITY_TXT_CANONICAL.map((url) => `Canonical: ${url}`),
].join('\n')}\n`

const DAY_MS = 86_400_000

/** Warn this long before Expires, so renewal is a calm task, not an outage. */
export const SECURITY_TXT_RENEW_DAYS = 30

/**
 * What is wrong with a security.txt, judged at `now` — an empty list means nothing.
 *
 * Shared by the unit test (against the text above, at its review date) and the daily live
 * probe (against what each host actually serves, at the real date).
 */
export function securityTxtProblems(text: string, now: Date): string[] {
  const problems: string[] = []
  if (!/^Contact: \S/im.test(text)) problems.push('no Contact line')
  const expiresValue = /^Expires: (.+)$/im.exec(text)?.[1]?.trim()
  if (expiresValue === undefined) {
    problems.push('no Expires line')
    return problems
  }
  const expires = Date.parse(expiresValue)
  if (Number.isNaN(expires)) {
    problems.push(`Expires "${expiresValue}" is not a date`)
    return problems
  }
  const left = expires - now.getTime()
  if (left <= 0) problems.push(`expired on ${expiresValue}`)
  else if (left > 365 * DAY_MS) problems.push('Expires is more than a year away (RFC 9116 §2.5.5)')
  else if (left < SECURITY_TXT_RENEW_DAYS * DAY_MS) {
    problems.push(`renew it: Expires ${expiresValue} is under ${SECURITY_TXT_RENEW_DAYS} days away`)
  }
  return problems
}
