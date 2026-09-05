import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import Link from 'next/link'
import { splitLastWord } from '../../lib/footerCopy'
import { formatHours } from '../../lib/footerHours'
import type { PublicSiteSettings } from '../../lib/projectPublic'
import { formatAddress } from '../../lib/structuredData'
import { FooterClock } from './FooterClock'
import { FooterGlow } from './FooterGlow'
import { FooterTab } from './FooterTab'
import { FooterWordmark } from './FooterWordmark'

/**
 * The public site footer — "The Quiet Room". Design record:
 * docs/superpowers/specs/2026-09-05-site-footer-quiet-room-design.md
 *
 * ⚠️ <footer> IS UNCLIPPED AND THE SLAB INSIDE IT CARRIES `overflow: hidden`. The tab is
 * seated ON the slab's top edge — the header notch mirrored — and a tab inside a clipped
 * box is simply invisible. The wordmark needs the clip (it is cropped by the bottom
 * edge), so the clip lives one level down. Measured 2026-09-05 on the design artifact,
 * where the first version put the tab INSIDE the slab and it never rose out of anything.
 *
 * Server-rendered. The four things that need a browser — the clock, the wordmark fit and
 * spotlight, the glow, the cursor — are islands that hydrate over markup that already
 * reads correctly without them.
 *
 * ⚠️ EVERY CLAIM BLOCK IS CONDITIONAL. Capacity, Certified and Elsewhere render only
 * from real values; a blank claim renders no block and never an example. See the
 * comment above the footer fields in SiteSettings.ts.
 */
export function SiteFooter({ settings }: { settings: PublicSiteSettings }) {
  const f = settings.footer
  const q = splitLastWord(f.ctaQuestion)
  const hours = f.capacity.hours
  const showCapacity = Boolean(f.capacity.moq || f.capacity.leadTime || hours)

  return (
    <footer className="site-footer">
      <FooterTab label={f.ctaLabel} email={settings.email} />

      <div className="site-footer__slab">
        <FooterGlow />

        <div className="footer-cta">
          <div>
            <p className="footer-eyebrow">Start here</p>
            <h2 className="footer-q">
              {q.head}
              <em>{q.last}</em>
              {q.tail}
            </h2>
            <p className="footer-derisk">{f.ctaSubline}</p>
            <p className="footer-dim">{f.ctaPromise}</p>
          </div>
          <div className="footer-side">
            <FooterClock hours={hours} />
          </div>
        </div>

        <div className="footer-grow" />

        <div className="footer-facts">
          <div className="footer-block footer-block--contact">
            <h3>Contact</h3>
            <ul>
              <li>
                <a href={`mailto:${settings.email}`}>{settings.email}</a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`}
                  rel="noopener"
                >
                  WhatsApp {settings.whatsappNumber}
                </a>
              </li>
              <li>{formatAddress()}</li>
              {f.worksCoordinates ? (
                <li className="footer-block__sub">{f.worksCoordinates}</li>
              ) : null}
            </ul>
          </div>

          {showCapacity ? (
            <div className="footer-block footer-block--capacity">
              <h3>Capacity</h3>
              <ul>
                {f.capacity.moq ? <li>MOQ {f.capacity.moq}</li> : null}
                {f.capacity.leadTime ? <li>Lead time {f.capacity.leadTime}</li> : null}
                {hours ? <li>{formatHours(hours)}</li> : null}
              </ul>
            </div>
          ) : null}

          {f.certifications.length > 0 ? (
            <div className="footer-block footer-block--certified">
              <h3>Certified</h3>
              <ul>
                {f.certifications.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {f.socialLinks.length > 0 ? (
            <div className="footer-block footer-block--elsewhere">
              <h3>Elsewhere</h3>
              <ul>
                {f.socialLinks.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} rel="noopener">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/*
          `legalLine` ALREADY CONTAINS the company name — its default is
          "© RUN APPAREL (PVT) LTD" and `companyName` is "RUN APPAREL (PVT) LTD".
          Appending one to the other once rendered the name twice on every page.
        */}
        <div className="footer-legal">
          <span>{settings.legalLine}</span>
          <span>{settings.footerLine}</span>
          <Link className="nav-link" href="/products">
            Products
          </Link>
          <Link className="nav-link" href="/contact">
            Contact
          </Link>
        </div>

        <FooterWordmark text={settings.temporaryWordmark} />
      </div>
    </footer>
  )
}
