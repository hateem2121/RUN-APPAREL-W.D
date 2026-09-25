/**
 * The exact message the contact page renders for each `?error=`/`?sent=` query value.
 *
 * WHY THIS IS ITS OWN MODULE, not typed twice. RO-09 needs the identical mapping in two
 * places: the LOCAL e2e suite (`apps/cms/e2e/inquirySecurity.spec.ts`) and a live,
 * production-safe GET check (RO-09 is fully safe against production — the page renders
 * these messages from the query string alone, with no form submission at all). Keeping
 * one pure function means a wording change is asserted once and read twice, rather than
 * two copies quietly drifting the way `docs/HARDENING-LOG.md`-style incidents in this
 * repo keep starting.
 *
 * Mirrors `apps/cms/src/app/(frontend)/contact/page.tsx`'s own ternary exactly: only
 * `too-many` and `storage` have their own sentence; every other error value (`invalid`,
 * `unreadable`, or anything unrecognised) falls through to the page's own `else` branch.
 */

/**
 * @param {{ sent?: string, error?: string }} params
 * @returns {string | null} the rendered notice text, or null if neither param is set.
 */
export function expectedContactNotice({ sent, error }) {
  if (sent) return 'Thank you — your inquiry is with us. We reply within 24 hours.'
  if (error === 'too-many') {
    return 'That is several inquiries in a short time. Please wait a few minutes, or email us directly.'
  }
  if (error === 'storage') {
    return 'We could not save your message — please email us directly so it is not lost.'
  }
  if (error) return 'Something in the form was not filled in. Please check and send again.'
  return null
}
