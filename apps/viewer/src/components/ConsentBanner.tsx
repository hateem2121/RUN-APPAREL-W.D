import {
  acceptTrackers,
  CONSENT_COPY,
  CONSENT_OPEN_EVENT,
  type CookieJar,
  declineTrackers,
  forgetTrackers,
  readConsent,
  restoreTrackers,
  safeStorage,
  startTrackers,
  type TrackerWindow,
} from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'
import { SITE_PRIVACY_URL } from '../lib/siteLinks'

const storage = () => safeStorage(() => window.localStorage)
const trackerWindow = () => window as unknown as TrackerWindow
const cookieJar = (): CookieJar => ({
  hostname: window.location.hostname,
  readCookies: () => document.cookie,
  writeCookie: (value) => {
    // biome-ignore lint/suspicious/noDocumentCookie: expiring Google's cookies; the Cookie Store API is not in Firefox or Safari
    document.cookie = value
  },
})

/**
 * The cookie choice on the garment pages: the same question, words and stored answer as the
 * website's (`apps/cms/src/components/site/ConsentBanner.tsx`), because both are one origin.
 * A visitor who chose on the website is not asked again here, and the other way round.
 *
 * ⚠️ THE GARMENT PAGES SET NOTHING BEFORE THIS (audit FA-O-13, 2026-09-06). Google
 * Analytics and Apollo's visitor tracker arrived on 2026-09-30 by owner decision; both keep
 * an identifier in the browser, so neither may start before Accept. The logic and the
 * reasons are in `packages/shared/src/consent.ts`; this file only draws the question.
 *
 * ⚠️ MOUNTED INSIDE THE READY PAGE ONLY. The "did not load" and "no longer live" states
 * never ask and never track: a visit that showed no garment is not a visit to count.
 *
 * ⚠️ ABSENT UNDER `navigator.webdriver`, as the cursor is: a fixed card over the foot of
 * the page would cover the action bar every layout test measures, and an automated browser
 * has no choice to give. `e2e/consent.spec.ts` lifts the flag to exercise it.
 *
 * It is a plain link to the site's privacy page, not a router link: that page is drawn by
 * the other program, and its button is how a visitor changes their mind later.
 *
 * The three guarantees added after the visual audit of 2026-10-01 are the website's, for the
 * same reasons (`apps/cms/src/components/site/ConsentBanner.tsx` has the measurements):
 * mounted straight after the skip link (`App.tsx`), it takes focus when asked for again and
 * gives it back when answered, and Decline removes Google's cookies on every load.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  // Where focus was when the visitor asked for the question; null on a first visit.
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (navigator.webdriver) return
    const choice = readConsent(storage())
    if (choice === 'accepted') startTrackers(trackerWindow())
    if (choice === null) setOpen(true)
    // ⚠️ Every load, not only at the click: Google's script was measured writing its cookie
    // again after Decline expired it (live site, 2026-10-01).
    if (choice === 'declined') forgetTrackers(storage(), cookieJar())

    // Cancelled so the footer's link knows a question opened and does not navigate away.
    const reopen = (event: Event) => {
      event.preventDefault()
      returnTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    document.addEventListener(CONSENT_OPEN_EVENT, reopen)

    // Back or Forward can bring this page back exactly as it was left (polish audit X13):
    // catch up with a choice made on another page since. `consent.ts` has the four cases.
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      const { answered, reload } = restoreTrackers(trackerWindow(), storage(), cookieJar())
      if (reload) window.location.reload()
      // Only the question put up unasked closes; one the visitor asked for stays open.
      else if (answered && returnTo.current === null) setOpen(false)
    }
    window.addEventListener('pageshow', restored)
    return () => {
      document.removeEventListener(CONSENT_OPEN_EVENT, reopen)
      window.removeEventListener('pageshow', restored)
    }
  }, [])

  // Asked for, it takes focus; on a first visit it does not, so the page keeps the reader.
  useEffect(() => {
    if (open && returnTo.current) card.current?.focus()
  }, [open])

  // WebKit does not scroll a focused field out from under the card (measured 2026-10-01;
  // the website's ConsentBanner.tsx has the account). A focus under it moves the page by
  // exactly the overlap; where the browser already scrolled, the overlap is zero.
  // ⚠️ Never by more than the element's own top: `App.tsx` hands focus to the 2,245px page
  // wrapper, and moving by its whole overlap opened every first visit at the footer
  // (1,574px at 390x844, 2026-10-01; e2e/consent.spec.ts pins it). And anything taller than
  // the room above the card is left alone: a click on text focuses <main>, which starts under
  // the 60px top bar, so even the capped lift slid the garment 60px under it.
  useEffect(() => {
    if (!open) return
    const keepClear = (event: FocusEvent) => {
      const box = card.current?.getBoundingClientRect()
      if (!box || !(event.target instanceof Element) || card.current?.contains(event.target)) return
      const target = event.target.getBoundingClientRect()
      if (target.height > box.top) return
      const lift = Math.min(target.bottom - box.top + 16, target.top)
      if (target.bottom > box.top && lift > 0 && target.top < window.innerHeight) {
        window.scrollBy({ top: lift, behavior: 'instant' })
      }
    }
    document.addEventListener('focusin', keepClear)
    return () => document.removeEventListener('focusin', keepClear)
  }, [open])

  if (!open) return null

  // Focus goes back BEFORE the card unmounts; removing a focused element drops focus to <body>.
  const close = () => {
    returnTo.current?.focus()
    returnTo.current = null
    setOpen(false)
  }

  const accept = () => {
    acceptTrackers(trackerWindow(), storage())
    close()
  }

  const decline = () => {
    const mustReload = declineTrackers(trackerWindow(), storage(), cookieJar())
    close()
    if (mustReload) window.location.reload()
  }

  return (
    <section className="consent" aria-label="Cookie choice">
      <div className="consent__card" ref={card} tabIndex={-1}>
        <p className="consent__text">
          {CONSENT_COPY.text} <a href={`${SITE_PRIVACY_URL}#cookies`}>{CONSENT_COPY.more}</a>
        </p>
        <div className="consent__actions">
          <button type="button" className="btn btn--ghost" onClick={decline}>
            {CONSENT_COPY.decline}
          </button>
          <button type="button" className="btn btn--ghost" onClick={accept}>
            {CONSENT_COPY.accept}
          </button>
        </div>
      </div>
    </section>
  )
}
