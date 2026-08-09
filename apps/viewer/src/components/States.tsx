import type { ViewerSiteSettings } from '@run-apparel/shared'
import { DEFAULT_SITE_SETTINGS, buildMailtoUrl, buildWhatsAppUrl } from '@run-apparel/shared'
import { useEffect } from 'react'
import { track } from '../lib/analytics'
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

/** Branded state for an unpublished/absent product (or an unreachable API). */
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
        {headingWithAccent('This reference has moved forward')}
      </h1>
      <p style={{ color: 'var(--muted)' }}>
        The product linked by this QR code is not currently available as a live reference. Our range
        develops continuously — the current catalogue has the latest references, and our team can
        advise on this product directly.
      </p>
      <div className="unavailable__actions">
        <a
          className="btn btn--primary"
          href={site.catalogueUrl}
          onClick={() => track('catalogue_clicked', { placement: 'unavailable' })}
        >
          Back to Catalogue
        </a>
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
