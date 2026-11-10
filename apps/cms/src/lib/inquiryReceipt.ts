/**
 * Whether a buyer receipt may go out (security reviews of 2026-11-10).
 *
 * The receipt goes to an address nobody has proven is theirs, so a robot could post the form
 * again and again to have us mail a stranger. Two bounds, both read from the inquiries already
 * stored in the last day (spam rows included):
 *
 * 1. ONE PER MAILBOX, NOT PER SPELLING. `Victim@Example.com`, `victim+1@example.com` and, at Gmail,
 *    `v.ictim@gmail.com` all reach one inbox; comparing the addresses as typed let each spelling
 *    through. `mailboxKey` folds them together.
 * 2. A CEILING FOR THE WHOLE SITE. Real volume was 4 genuine inquiries in two months (production,
 *    2026-11-10); a day with more than `RECEIPTS_PER_DAY` inquiries is an attack, and the receipts
 *    stop for the day while every inquiry is still stored and the team still notified.
 */

export const RECEIPT_WINDOW_MS = 24 * 60 * 60 * 1000
export const RECEIPTS_PER_DAY = 20

const GMAIL = new Set(['gmail.com', 'googlemail.com'])

/** One key per inbox: lower case, no `+tag`, and Gmail's ignored dots and second domain folded. */
export function mailboxKey(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return email.trim().toLowerCase()
  let local = email.slice(0, at).trim().toLowerCase()
  let domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
  local = local.split('+')[0] ?? local
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, '')
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}

/**
 * `earlier` = the addresses on every OTHER inquiry stored in the window, or null when they could
 * not be read (then no receipt: the team still has the inquiry).
 */
export function receiptAllowed(email: string, earlier: readonly string[] | null): boolean {
  if (earlier === null) return false
  if (earlier.length >= RECEIPTS_PER_DAY) return false
  const key = mailboxKey(email)
  return !earlier.some((other) => mailboxKey(other) === key)
}
