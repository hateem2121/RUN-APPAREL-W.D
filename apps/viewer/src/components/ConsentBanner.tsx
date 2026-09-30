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
import { useEffect, useState } from 'react'
import { SITE_PRIVACY_URL } from '../lib/siteLinks'

const storage = () => safeStorage(() => window.localStorage)
const trackerWindow = () => window as unknown as TrackerWindow

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
