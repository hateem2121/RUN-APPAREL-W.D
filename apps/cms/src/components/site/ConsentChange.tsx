'use client'

import { CONSENT_OPEN_EVENT } from '@run-apparel/shared'

/**
 * The privacy page's "change your cookie choice" button.
 *
 * Withdrawing a choice has to be as easy as making it. Both footers carry a "Cookies" link
 * that does the same from any page (`ConsentLink.tsx`); this one is for the visitor already
 * reading the notice. It only asks `ConsentBanner` (mounted in the layout) to show itself.
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
