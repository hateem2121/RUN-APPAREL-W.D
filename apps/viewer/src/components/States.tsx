import type { ViewerSiteSettings } from '@run-apparel/shared'
import { buildMailtoUrl, buildWhatsAppUrl } from '@run-apparel/shared'
import { useEffect } from 'react'
import { track } from '../lib/analytics'
import { headingWithAccent } from './SerifAccent'

export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-label="Loading product reference">
      <span className="label">[ 3D PRODUCT REFERENCE ]</span>
      <div className="loading-screen__pulse" aria-hidden="true" />
      <p className="mono" style={{ color: 'var(--muted)' }}>
        PREPARING REFERENCE…
      </p>
    </div>
  )
}

/** Accessible inline notice for a retired/missing QR colourway. */
export function RetiredNotice({ message }: { message: string }) {
  return (
    <div className="notice" role="status">
      <span className="label">[ NOTE ]</span>
      <span>{message}</span>
    </div>
  )
}

const FALLBACK_SETTINGS: ViewerSiteSettings = {
  companyName: 'RUN APPAREL (PVT) LTD',
  email: 'partner@wear-run.com',
  whatsappNumber: '+923361777313',
  catalogueUrl: 'https://wear-run.help/catalogue',
  temporaryWordmark: 'RUN APPAREL',
  footerLine: 'RUN THE EXTRA MILE.',
  legalLine: '© RUN APPAREL (PVT) LTD',
}

/** Branded state for an unpublished/absent product (or an unreachable API). */
export function UnavailableState({ settings }: { settings?: ViewerSiteSettings }) {
  const site = settings ?? FALLBACK_SETTINGS

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
      <h1 className="display display--hero">{headingWithAccent('This reference has moved forward')}</h1>
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
