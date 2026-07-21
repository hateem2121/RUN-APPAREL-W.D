import type { ViewerSiteSettings } from '@run-apparel/shared'
import { track } from '../lib/analytics'

export function Footer({ settings }: { settings: ViewerSiteSettings }) {
  return (
    <footer className="footer blueprint">
      <div className="footer__inner">
        <p className="footer__brand">{settings.temporaryWordmark}</p>
        <p className="footer__line">{settings.footerLine}</p>
        <div className="footer__meta">
          <span>{settings.legalLine}</span>
          <a href={settings.catalogueUrl} onClick={() => track('catalogue_clicked', { placement: 'footer' })}>
            Back to Catalogue
          </a>
        </div>
      </div>
    </footer>
  )
}
