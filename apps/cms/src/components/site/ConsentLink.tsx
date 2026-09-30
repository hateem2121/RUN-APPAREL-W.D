'use client'

import { CONSENT_COPY, CONSENT_OPEN_EVENT } from '@run-apparel/shared'
import Link from 'next/link'

/**
 * The footer's "Cookies" link, on every page of the website (2026-09-30).
 *
 * Withdrawing a choice has to be as easy as making it, and regulators read that as a way
 * back that is visible on every page. The first version kept the way back on the privacy
 * page alone, two clicks from anywhere; the owner asked for current best practice, which is
 * this. `ConsentChange.tsx` stays: a visitor reading the notice should not have to scroll
 * to the footer.
 *
 * ⚠️ A LINK THAT ALSO WORKS AS A LINK. It asks the question to reopen in place; when no
 * question is on the page to answer (an automated browser, or before hydration), the click
 * is left alone and goes to `/privacy#cookies`, where the same choice is explained. It is an
 * `<a>` so the footer's own link styles and its 44px row apply with no new CSS.
 */
export function ConsentLink() {
  return (
    <Link
      className="nav-link"
      href="/privacy#cookies"
      onClick={(event) => {
        // Not cancelled means no question was listening: let the link navigate.
        const answered = !document.dispatchEvent(
          new Event(CONSENT_OPEN_EVENT, { cancelable: true }),
        )
        if (answered) event.preventDefault()
      }}
    >
      {CONSENT_COPY.change}
    </Link>
  )
}
