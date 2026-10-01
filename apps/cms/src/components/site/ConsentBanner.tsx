'use client'

import {
  acceptTrackers,
  CONSENT_COPY,
  CONSENT_OPEN_EVENT,
  type CookieJar,
  declineTrackers,
  forgetTrackers,
  readConsent,
  safeStorage,
  startTrackers,
  type TrackerWindow,
} from '@run-apparel/shared'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

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
 * The cookie choice, on every page of the website.
 *
 * ⚠️ THIS IS WHAT REPLACED "NO COOKIES, SO NO BANNER". Until 2026-09-30 the site stored
 * nothing and asked nothing (`Analytics.tsx` has that account). The owner then asked for
 * Google Analytics and Apollo's visitor tracker, and both keep an identifier in the
 * browser, which is exactly what the law requires a choice for. The logic, the reasons
 * and the words all live in `packages/shared/src/consent.ts`, because the garment pages
 * (`apps/viewer`) are the same origin and must behave identically.
 *
 * What this component guarantees, and `e2e/consent.spec.ts` checks in a real browser:
 *   - a visitor who has not chosen is asked, and NOTHING loads or is stored meanwhile;
 *   - Accept starts both trackers; Decline starts neither;
 *   - the choice is remembered, so nobody is asked twice;
 *   - the privacy page's button brings the question back, and a Decline after an Accept
 *     removes what was stored and reloads the page without the trackers.
 *
 * ⚠️ ABSENT UNDER `navigator.webdriver`, like `Cursor.tsx`. A fixed card over the foot of
 * every page would sit on top of whatever the other browser suites click there, and an
 * automated browser has no choice to give. The consent suite lifts the flag to see it.
 * The safe direction: an automated visit is never tracked.
 *
 * Renders nothing on the server and on first paint, so the page's HTML is the same for
 * everyone and a crawler never reads the question as the page's content.
 *
 * Three more guarantees since the visual audit of 2026-10-01, each in `e2e/consent.spec.ts`:
 *   - it is mounted straight after the skip link (`layout.tsx`), so a keyboard user meets
 *     the question first instead of after the whole page and footer, and `base.css` keeps
 *     the strip it covers clear of focus while it is open (WCAG 2.2 SC 2.4.11);
 *   - asked for again from the footer, it takes focus, and gives it back when answered;
 *   - while the answer is Decline, every page load removes Google's cookies again, because
 *     one was measured outliving the click (see the effect below).
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
    /*
     * ⚠️ DECLINE IS ENFORCED ON EVERY LOAD, NOT ONLY AT THE CLICK. Measured on the live site
     * 2026-10-01: after Accept then Decline, `_ga_YBY5G3HQLD` was still stored on the next
     * page, timestamped at the moment of the click. `forgetTrackers` had expired it, and
     * Google's script, still running in the page until the reload, wrote it again. Nothing
     * loads Google once the answer is Decline, so clearing here catches that late write and
     * any other, and costs one read of `document.cookie` when there is nothing to clear.
     */
    if (choice === 'declined') forgetTrackers(storage(), cookieJar())

    // Cancelled so the footer's link knows a question opened and does not navigate away.
    const reopen = (event: Event) => {
      event.preventDefault()
      returnTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    document.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => document.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [])

  /*
   * Asked for, it takes focus, so a keyboard or screen-reader user is in the question they
   * opened rather than left on the footer link behind it. Not on a first visit: moving focus
   * on page load would pull a visitor out of the page they came to read.
   */
  useEffect(() => {
    if (open && returnTo.current) card.current?.focus()
  }, [open])

  /*
   * ⚠️ WEBKIT DOES NOT SCROLL A FOCUSED FIELD OUT FROM UNDER THE CARD; THE OTHER TWO DO.
   * Measured 2026-10-01 in e2e/consent.spec.ts at 390x844: with `scroll-padding-block-end`
   * (base.css), Chromium and Firefox scrolled the contact form's fields clear of the card,
   * and WebKit left four of them under it. WebKit treats an element that is already inside
   * the viewport as visible and does not scroll; the padding only shapes a scroll it was
   * going to make anyway, which is why the footer links, further down, passed. So while the
   * question is open, a focus that lands under it moves the page by exactly the overlap.
   * Where the browser already scrolled, the overlap is zero and this does nothing.
   *
   * ⚠️ NEVER BY MORE THAN THE ELEMENT'S OWN TOP. The first version moved by the whole
   * overlap, and `<main>` is focusable (`tabIndex={-1}`, for the skip link): the skip link,
   * or a click on any plain text, focused it, and the page went to its foot — 2,825px on
   * /privacy at 390x844, and every first visit to a garment page opened at the footer
   * (measured 2026-10-01; e2e/consent.spec.ts pins both). The cap alone was not enough: on
   * a garment page `<main>` starts under the 60px top bar, so a click on its text still
   * moved the page 60px and slid the garment under the bar. So anything taller than the
   * room above the card is left alone — no scroll could clear it, and WCAG 2.4.11 fails
   * only a component "entirely hidden", which one that tall never is.
   */
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
          {CONSENT_COPY.text} <Link href="/privacy#cookies">{CONSENT_COPY.more}</Link>
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
