import { normalizeWhatsAppNumber, type ViewerSiteSettings } from '@run-apparel/shared'
import Link from 'next/link'

/** Public site footer. Every value comes from the `site-settings` global. */
export function SiteFooter({ settings }: { settings: ViewerSiteSettings }) {
  return (
    <footer className="site-footer">
      <div className="site-container">
        <div className="site-footer__row">
          <p className="site-footer__line">{settings.footerLine}</p>
          <ul className="site-footer__links">
            <li>
              <Link className="nav-link" href="/products">
                Products
              </Link>
            </li>
            <li>
              <Link className="nav-link" href="/contact">
                Contact
              </Link>
            </li>
            <li>
              <a className="nav-link" href={`mailto:${settings.email}`}>
                Email
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`}
                rel="noopener"
              >
                WhatsApp
              </a>
            </li>
          </ul>
        </div>
        {/*
          `legalLine` ALREADY CONTAINS the company name — its default is
          "© RUN APPAREL (PVT) LTD" and `companyName` is "RUN APPAREL (PVT) LTD".
          Appending one to the other rendered "© RUN APPAREL (PVT) LTD · RUN APPAREL
          (PVT) LTD" on every page. Caught by looking at the screenshot, not by any
          test — the two fields are separate strings in the CMS and nothing says they
          overlap.
        */}
        <p className="site-footer__legal">{settings.legalLine}</p>
      </div>
    </footer>
  )
}
