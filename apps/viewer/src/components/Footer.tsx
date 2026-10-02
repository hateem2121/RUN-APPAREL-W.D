import {
  CONSENT_OPEN_EVENT,
  capacityLines,
  EMPTY_FOOTER,
  formatAddress,
  formatPhoneForDisplay,
  marksFor,
  normalizeWhatsAppNumber,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_WORDS,
  splitLastWord,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { track } from '../lib/analytics'
import { SITE_ORIGIN } from '../lib/siteLinks'
import { FooterClock, FooterGlow, FooterWordmark } from './FooterLive'

/**
 * The website's footer, drawn on the garment pages too (visual audit VA-31, owner-approved
 * 2026-10-01). Until then these pages ended in a pale three-line footer of their own; no
 * decision chose that, it was simply never brought across when the bar was (2026-09-24).
 *
 * It mirrors apps/cms/src/components/site/SiteFooter.tsx, which carries the reasoning for each
 * block (why every claim is conditional, why "Standards" and not "Certified", why the tab sits
 * outside the clip). The two agree because they share the stylesheet
 * (packages/ui/src/footer.css), the words and links (@run-apparel/shared siteFooter.ts), and one
 * test template: both browser suites hold the rendered footer to `siteFooterAriaSnapshot`.
 *
 * The differences are the framework's, never the visitor's:
 * - every link is the site's full address, because another Worker draws this page;
 * - the tab always goes to the contact page, because a garment page is never /contact;
 * - email and WhatsApp clicks are counted, as they were in the footer this replaced.
 */
export function Footer({ settings }: { settings: ViewerSiteSettings }) {
  // An API answer cached before the footer joined it (2026-10) has none: the copy's defaults,
  // and no claim — a claim never has a default.
  const f = settings.footer ?? EMPTY_FOOTER
  const q = splitLastWord(f.ctaQuestion)
  const capacity = capacityLines(f.capacity)
  const marks = marksFor(f.certifications)
  const words = SITE_FOOTER_WORDS

  return (
    <footer className="site-footer">
      <a className="site-footer__tab" href={`${SITE_ORIGIN}/contact`}>
        <span className="site-footer__tab-label">{f.ctaLabel}</span>
        <span className="site-footer__tab-arrow" aria-hidden="true">
          →
        </span>
      </a>

      <div className="site-footer__slab">
        <FooterGlow />

        <div className="site-footer__inner">
          <div className="footer-cta">
            <div>
              <p className="footer-eyebrow">{words.eyebrow}</p>
              <h2 className="footer-q">
                {q.head}
                <em>{q.last}</em>
                {q.tail}
              </h2>
              <p className="footer-derisk">{f.ctaSubline}</p>
              <p className="footer-dim">{f.ctaPromise}</p>
            </div>
            <div className="footer-side">
              <FooterClock hours={f.capacity.hours} />
            </div>
          </div>

          <div className="footer-grow" />

          <div className="footer-facts">
            {/*
              THE CONTACT DETAILS (audit FA-Q-09, 2026-09-07): this is the page someone lands on
              holding the garment, wanting to know who made it. The address is the link text and
              the href carries no template: the enquiry buttons above pre-fill the garment's code
              (`viewer.spec.ts` pins that), and a buyer checking a supplier wants to read or copy
              the address, not send a prepared subject line.
            */}
            <div className="footer-block footer-block--contact">
              <h3>{words.contact}</h3>
              <ul>
                <li>
                  <a href={`mailto:${settings.email}`} onClick={() => track('email_clicked')}>
                    {settings.email}
                  </a>
                </li>
                <li>
                  <a
                    href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`}
                    rel="noopener"
                    onClick={() => track('whatsapp_clicked')}
                  >
                    WhatsApp {formatPhoneForDisplay(settings.whatsappNumber)}
                  </a>
                </li>
                <li>{formatAddress()}</li>
                {f.worksCoordinates ? (
                  <li className="footer-block__sub">{f.worksCoordinates}</li>
                ) : null}
              </ul>
            </div>

            {capacity.length > 0 ? (
              <div className="footer-block footer-block--capacity">
                <h3>{words.capacity}</h3>
                <ul>
                  {capacity.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {f.certifications.length > 0 ? (
              <div className="footer-block footer-block--standards">
                <h3>{words.standards}</h3>
                <ul>
                  {f.certifications.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {f.socialLinks.length > 0 ? (
              <div className="footer-block footer-block--elsewhere">
                <h3>{words.elsewhere}</h3>
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

            {/*
              The marks are the website's files: this page is on the same address
              (wear-run.com), so `/standards/…` is served by the site, which the image policy
              already allows as 'self'.
            */}
            {marks.length > 0 ? (
              <div className="footer-marks" role="group" aria-label={words.marks}>
                {marks.map((logo) => (
                  <img
                    key={logo.slug}
                    className="footer-logo"
                    src={logo.src}
                    width={logo.width}
                    height={logo.height}
                    alt={logo.alt}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="footer-legal">
            <span>{settings.legalLine}</span>
            <span>{settings.footerLine}</span>
            {SITE_FOOTER_LINKS.map((link) =>
              link.consent ? (
                <a
                  key={link.href}
                  className="nav-link"
                  href={`${SITE_ORIGIN}${link.href}`}
                  onClick={(event) => {
                    // Not cancelled means no question was listening: let the link navigate.
                    const answered = !document.dispatchEvent(
                      new Event(CONSENT_OPEN_EVENT, { cancelable: true }),
                    )
                    if (answered) event.preventDefault()
                  }}
                >
                  {link.label}
                </a>
              ) : (
                <a key={link.href} className="nav-link" href={`${SITE_ORIGIN}${link.href}`}>
                  {link.label}
                </a>
              ),
            )}
          </div>
        </div>

        <FooterWordmark text={settings.temporaryWordmark} />
      </div>
    </footer>
  )
}
