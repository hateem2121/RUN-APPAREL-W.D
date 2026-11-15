'use client'

import { CONSENT_OPEN_EVENT } from '@run-apparel/shared'
import { useLocale } from '../../lib/i18n/uiClient'

/**
 * The privacy page's "change your cookie choice" button.
 *
 * Withdrawing a choice has to be as easy as making it. Both footers carry a "Cookies" link
 * that does the same from any page (`ConsentLink.tsx`); this one is for the visitor already
 * reading the notice. It only asks `ConsentBanner` (mounted in the layout) to show itself.
 */
export function ConsentChange() {
  // Russian section (2026-11-15): the page's language from its address, no props.
  const ru = useLocale() === 'ru'
  return (
    <button
      type="button"
      className="btn btn--ghost"
      onClick={() => document.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
    >
      {ru ? 'Изменить выбор файлов cookie' : 'Change your cookie choice'}
    </button>
  )
}
