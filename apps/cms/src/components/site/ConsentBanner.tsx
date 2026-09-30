'use client'

import {
  acceptTrackers,
  CONSENT_COPY,
  CONSENT_OPEN_EVENT,
  declineTrackers,
  readConsent,
  safeStorage,
  startTrackers,
  type TrackerWindow,
} from '@run-apparel/shared'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const storage = () => safeStorage(() => window.localStorage)
const trackerWindow = () => window as unknown as TrackerWindow

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
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (navigator.webdriver) return
    const choice = readConsent(storage())
    if (choice === 'accepted') startTrackers(trackerWindow())
    if (choice === null) setOpen(true)

    const reopen = () => setOpen(true)
    document.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => document.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [])

  if (!open) return null

  const accept = () => {
    acceptTrackers(trackerWindow(), storage())
    setOpen(false)
  }

  const decline = () => {
    const mustReload = declineTrackers(trackerWindow(), storage(), {
      hostname: window.location.hostname,
      readCookies: () => document.cookie,
      writeCookie: (value) => {
        // biome-ignore lint/suspicious/noDocumentCookie: expiring Google's cookies; the Cookie Store API is not in Firefox or Safari
        document.cookie = value
      },
    })
    setOpen(false)
    if (mustReload) window.location.reload()
  }

  return (
    <section className="consent" aria-label="Cookie choice">
      <div className="consent__card">
        <span className="label">{CONSENT_COPY.label}</span>
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
