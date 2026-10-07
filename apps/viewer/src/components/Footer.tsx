import {
  CONSENT_OPEN_EVENT,
  capacityLines,
  EMPTY_FOOTER,
  formatAddress,
  formatPhoneForDisplay,
  markBox,
  marksFor,
  normalizeWhatsAppNumber,
  SITE_FOOTER_COMPANY,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
  standardsLines,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { track } from '../lib/analytics'
import { SITE_ORIGIN } from '../lib/siteLinks'
import { FooterGlow, FooterWordmark } from './FooterLive'

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
 * - email and WhatsApp clicks are counted, as they were in the footer this replaced.
 *
 * And one that is the visitor's, by the owner's choice (polish Q42, 2026-10-04): NO TAB, NO
 * QUESTION. A garment page ends on its own one prompt, "Ask about this garment", in its contact
 * section; the audit counted three prompts in a row there ("Develop this with us", the "Start an
 * inquiry" tab, "Have a garment…?", X23). So the footer opens on the facts, without the tab, the
 * question, its clock or the full screen of slab the question stood in (`.site-footer--no-prompt`,
 * packages/ui/src/footer.css). Both suites still hold it to the website's template, without those
 * lines (`siteFooterAriaSnapshot(…, { prompt: false })`).
 */
export function Footer({ settings }: { settings: ViewerSiteSettings }) {
  // An API answer cached before the footer joined it (2026-10) has none: the copy's defaults,
  // and no claim — a claim never has a default.
  const f = settings.footer ?? EMPTY_FOOTER
  const capacity = capacityLines(f.capacity)
  const marks = marksFor(f.certifications)
  const words = SITE_FOOTER_WORDS

  return (
    <footer className="site-footer site-footer--no-prompt">
      <div className="site-footer__slab">
        <FooterGlow />

        <div className="site-footer__inner">
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
                <li className="footer-block__address">{formatAddress()}</li>
                {f.worksCoordinates ? (
                  <li className="footer-block__sub">{f.worksCoordinates}</li>
                ) : null}
              </ul>
            </div>

            {/* The four category pages (polish F9), then Company, then Elsewhere: SiteFooter.tsx says why. */}
            <div className="footer-block footer-block--made">
              <h3>{words.made}</h3>
              <ul>
                {SITE_FOOTER_MADE.map((link) => (
                  <li key={link.href}>
                    <a href={`${SITE_ORIGIN}${link.href}`}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* The company pages (2026-10-07): drawn here and in SiteFooter.tsx in the same
                change, or both aria-snapshot suites fail. */}
            {SITE_FOOTER_COMPANY.length > 1 ? (
              <div className="footer-block footer-block--company">
                <h3>{words.company}</h3>
                <ul>
                  {SITE_FOOTER_COMPANY.map((link) => (
                    <li key={link.href}>
                      <a href={`${SITE_ORIGIN}${link.href}`}>{link.label}</a>
                    </li>
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
                  {standardsLines(f.certifications).map((line) => (
                    <li key={line}>{line}</li>
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
                    width={markBox(logo).width}
                    height={markBox(logo).height}
                    alt={logo.alt}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="footer-legal">
            <span translate="no">{settings.legalLine}</span>
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
