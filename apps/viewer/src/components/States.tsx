import type { ViewerSiteSettings } from '@run-apparel/shared'
import { DEFAULT_SITE_SETTINGS, buildMailtoUrl, buildWhatsAppUrl } from '@run-apparel/shared'
import { useEffect } from 'react'
import { track } from '../lib/analytics'
import type { ViewerFetchFailure } from '../lib/api'
import { SITE_PRODUCTS_URL } from '../lib/siteLinks'
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
    productName: 'a product reference from your catalogue',
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
        ⚠️ A <button>, NOT A RELOAD LINK. `location.reload()` would throw away the
        precached shell and, offline, would replace a working page with the
        browser's own error page. This re-runs the fetch and nothing else.
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
    productName: 'a product reference from your catalogue',
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
        <a className="btn btn--ghost" href={SITE_PRODUCTS_URL}>
          Browse References
        </a>
      </div>
    </main>
  )
}
