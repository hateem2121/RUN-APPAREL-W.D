import type { ViewerSiteSettings } from '@run-apparel/shared'
import { DEFAULT_SITE_SETTINGS, buildMailtoUrl, buildWhatsAppUrl } from '@run-apparel/shared'
import { useEffect } from 'react'
import { track } from '../lib/analytics'
import type { ViewerFetchFailure } from '../lib/api'
import { SITE_PRODUCTS_URL } from '../lib/siteLinks'
import { OfflineReloadNote, ReloadPageButton, useOnline } from './ReloadPageButton'
import { headingWithAccent } from './SerifAccent'

// `LoadingScreen` lived here until 2026-08-03 with zero references anywhere in
// src/ or e2e/ — superseded by Preloader.tsx, which handles the same moment with
// the branded wipe. Removed with its three .loading-screen rules in page.css.

/** Accessible inline notice for a retired/missing QR colourway. */
export function RetiredNotice({ message }: { message: string }) {
  return (
    <div className="notice" role="status">
      <span className="label">[ NOTE ]</span>
      <span>{message}</span>
    </div>
  )
}

/**
 * Branded state for a payload that could not be fetched — audit FA-P-05/FA-P-06.
 *
 * ⚠️ THE POINT OF THIS COMPONENT IS THE SENTENCE IT DOES NOT SAY. Until 2026-09-07
 * a 500 from the CMS and a phone with no signal both rendered `UnavailableState`:
 * "THIS REFERENCE IS NO LONGER LIVE — the QR code you scanned points to a garment
 * we no longer show here." Nothing had been retired in either case. Telling a buyer
 * who is holding the garment that it is discontinued, because a server had a bad
 * minute, is the most expensive wrong sentence this viewer can print.
 *
 * ⚠️ `noindex` FOR THE SAME REASON `UnavailableState` CARRIES IT, and a different
 * one: a crawler that catches a 5xx minute must not bank this page as the garment's
 * content. The effect is duplicated rather than shared because the two components
 * are separate exports and a shared hook would be a third thing to keep in step for
 * four lines; `States.test.tsx` asserts both halves for both.
 *
 * The offline copy is split from the server copy because only one of them is
 * something the visitor can do anything about.
 */
export function UnreachableState({
  reason,
  onRetry,
  retrying = false,
  settings,
}: {
  reason: ViewerFetchFailure
  onRetry: () => void
  retrying?: boolean
  settings?: ViewerSiteSettings
}) {
  const site = settings ?? DEFAULT_SITE_SETTINGS
  const offline = reason === 'offline'

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const enquiry = {
    productName: 'a product reference from your catalog',
    productCode: 'QR reference unavailable',
    colourName: 'N/A',
  }

  return (
    <main className="unavailable blueprint">
      <span className="label">{offline ? '[ NO CONNECTION ]' : '[ TEMPORARILY UNAVAILABLE ]'}</span>
      <h1 className="display display--hero">
        {headingWithAccent(offline ? 'This device is offline' : 'This reference did not load')}
      </h1>
      {/*
        Both sentences say the same three things, in the order a visitor needs
        them: the garment is fine, this is temporary, here is what to do. The
        offline one names the cause because the visitor can act on it; the other
        deliberately does not speculate about ours.
      */}
      <p style={{ color: 'var(--muted)' }}>
        {offline
          ? 'The garment is still here — your device just has no connection right now. This page will load itself as soon as the signal returns.'
          : 'Nothing has been discontinued: we could not reach the reference just now. Please try again in a moment.'}
      </p>
      {/*
        ⚠️ A <button>, NOT A RELOAD LINK. Offline, `location.reload()` can replace a
        working page with the browser's own error page: the service worker's offline
        copy (`scripts/sw.mjs`) catches it only once installed, which a first visit or
        a private window never reaches (corrected 2026-10-14; this said the reload
        always lost the shell). This re-runs the fetch and nothing else, which is all
        a failed fetch needs. A crash needs a real reload; `ReloadPageButton` does
        that, and waits while offline.
      */}
      <div className="unavailable__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onRetry}
          disabled={retrying}
          aria-live="polite"
        >
          {retrying ? 'Trying…' : 'Try Again'}
        </button>
        <a
          className="btn btn--ghost"
          href={buildMailtoUrl(site.email, enquiry)}
          onClick={() => track('email_clicked')}
        >
          Email Us
        </a>
        <a
          className="btn btn--ghost"
          href={buildWhatsAppUrl(site.whatsappNumber, enquiry)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('whatsapp_clicked')}
        >
          WhatsApp Us
        </a>
      </div>
    </main>
  )
}

/**
 * The screen for a crash: a part of the page threw while drawing, and `ErrorBoundary`
 * caught it (2026-10-14).
 *
 * ⚠️ THE CRASH USED TO PRINT "THIS REFERENCE IS NO LONGER LIVE". On 8 Oct 2026 a buyer in
 * Spain, on an iPhone with Safari translating the page, tapped HD IMAGE; React crashed on
 * the translated text (facebook/react#11538, PostHog replay) and `ErrorBoundary` drew
 * `UnavailableState`, the 404 screen, so a buyer holding the garment was told it was
 * discontinued. That crash was fixed in #181, but any other crash would have printed the
 * same false sentence, because the boundary had only the 404 screen to show. This is the
 * same mistake `UnreachableState` was written to stop for a failed download (2026-09-07).
 *
 * The words are the owner's choice (option A, 2026-10-14), written to GOV.UK's "There is a
 * problem with the service" pattern and NN/g's error-message guidelines: say plainly what
 * happened, no error codes, no "technical difficulties", do not blame the visitor, and give
 * one clear next step. The sentence says the garment is fine before it says anything else,
 * because that is the question a buyer holding it is asking.
 *
 * `noindex` for the same reason as the other two screens: a crawler that hits a crash must
 * not keep this page as the garment's content.
 *
 * ONE PRIMARY: Reload Page, the only thing that mends a crash (`ReloadPageButton` explains
 * why it is a real reload). Email and WhatsApp stay, so a visitor whose crash repeats on
 * every load still has a way to reach us. No "See products in 3D": nothing here was removed, so
 * sending the visitor to other garments answers a question they did not ask.
 */
export function CrashedState({
  settings,
  reload,
}: {
  settings?: ViewerSiteSettings
  /** For the test, which cannot reload jsdom. */
  reload?: () => void
}) {
  const site = settings ?? DEFAULT_SITE_SETTINGS
  const online = useOnline()

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  // The pre-filled enquiry names a crash, so the team does not read it as a dead QR tag
  // (owner's choice, 2026-10-14).
  const enquiry = {
    productName: 'a product reference from your catalog',
    productCode: 'Page error — reference not shown',
    colourName: 'N/A',
  }

  return (
    <main className="unavailable blueprint">
      <span className="label">[ PAGE ERROR ]</span>
      <h1 className="display display--hero">{headingWithAccent('This page ran into a problem')}</h1>
      <p style={{ color: 'var(--muted)' }}>
        Nothing has been discontinued: the garment is still here, but this page stopped working.
        Reload the page to see it again, or tell our team and we will send you the reference.
      </p>
      <div className="unavailable__actions">
        <ReloadPageButton online={online} reload={reload} />
        <a
          className="btn btn--ghost"
          href={buildMailtoUrl(site.email, enquiry)}
          onClick={() => track('email_clicked')}
        >
          Email Us
        </a>
        <a
          className="btn btn--ghost"
          href={buildWhatsAppUrl(site.whatsappNumber, enquiry)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('whatsapp_clicked')}
        >
          WhatsApp Us
        </a>
      </div>
      <OfflineReloadNote online={online} className="reload-page__offline" />
    </main>
  )
}

/** Branded state for an unpublished/absent product — a 404 from the API. */
export function UnavailableState({ settings }: { settings?: ViewerSiteSettings }) {
  const site = settings ?? DEFAULT_SITE_SETTINGS

  // Retired references shouldn't be indexed.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const enquiry = {
    productName: 'a product reference from your catalog',
    productCode: 'QR reference unavailable',
    colourName: 'N/A',
  }

  return (
    <main className="unavailable blueprint">
      <span className="label">[ REFERENCE UNAVAILABLE ]</span>
      <h1 className="display display--hero">
        {headingWithAccent('This reference is no longer live')}
      </h1>
      {/*
        THE COPY AND THE BUTTONS CHANGED TOGETHER on 2026-09-04, and they had to.

        The catalogue button was removed by owner decision (search traffic must not
        be handed the catalogue). This sentence previously read "Our catalogue has
        every current reference" — which, with the button gone, would promise a
        thing the page no longer offers. A dead-end promise on the one screen a
        visitor reaches by scanning a QR tag that no longer resolves is worse than
        no promise at all, so the sentence names the route that does exist.

        `btn--primary` moved from the catalogue to Email, because this screen must
        still have exactly one obvious next step. Leaving three ghost buttons would
        make the recovery path from a dead QR tag ambiguous — and this is the only
        screen where the visitor arrived with intent and got nothing.
      */}
      {/*
        THE SENTENCE NAMES THE INDEX AGAIN FROM 2026-09-07 — audit FA-W-03.

        It read "Our catalogue has every current reference" until 2026-09-04, when
        the catalogue button was removed and the promise had to go with it. There
        is now a route it can honestly name: the marketing site's `/products` is an
        index of the published garments, an ordinary web page rather than the 54 MB
        PDF that decision was about (`lib/siteLinks.ts`).

        The audit's point was that the two 404s answered the same situation in
        opposite ways: a MISTYPED URL on the marketing site got "Browse the
        references" plus "Tell us what you were looking for", while a DEAD QR TAG —
        where the visitor arrived with intent, holding the garment — got the two
        enquiry buttons and nothing else. That is the wrong way round.
      */}
      <p style={{ color: 'var(--muted)' }}>
        The QR code you scanned points to a garment we no longer show here. Browse the current
        references, or tell our team what you were looking at and we will send you the current
        reference for it.
      </p>
      {/*
        ONE PRIMARY, STILL. `btn--primary` moved to Email on 2026-09-04 because this
        is the only screen where the visitor arrived with intent and got nothing, so
        it must have exactly one obvious next step. A second ghost does not change
        that — the warning recorded then was against THREE ghosts and no primary.
      */}
      <div className="unavailable__actions">
        <a
          className="btn btn--primary"
          href={buildMailtoUrl(site.email, enquiry)}
          onClick={() => track('email_clicked')}
        >
          Email Us
        </a>
        <a
          className="btn btn--ghost"
          href={buildWhatsAppUrl(site.whatsappNumber, enquiry)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('whatsapp_clicked')}
        >
          WhatsApp Us
        </a>
        {/* The site's one name for the way to the 3D garments (polish X20, the owner's answer Q40). */}
        <a className="btn btn--ghost" href={SITE_PRODUCTS_URL}>
          See products in 3D
        </a>
      </div>
    </main>
  )
}
