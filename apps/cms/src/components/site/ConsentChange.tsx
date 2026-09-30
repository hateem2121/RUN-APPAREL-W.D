'use client'

import { CONSENT_OPEN_EVENT } from '@run-apparel/shared'

/**
 * The privacy page's "change your cookie choice" button.
 *
 * Withdrawing a choice has to be as easy as making it. Both footers already link to the
 * privacy page, so the way back to the question lives there rather than as a new control in
 * two footers. It only asks `ConsentBanner` (mounted in the layout) to show itself again.
 */
export function ConsentChange() {
  return (
    <button
      type="button"
      className="btn btn--ghost"
      onClick={() => document.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
    >
      Change your cookie choice
    </button>
  )
}
