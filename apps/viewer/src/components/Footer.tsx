import {
  CLIMATE_COMMITMENT,
  CONSENT_OPEN_EVENT,
  capacityLines,
  EMPTY_FOOTER,
  formatAddress,
  formatPhoneForDisplay,
  markBox,
  marksFor,
  normalizeWhatsAppNumber,
  SITE_FOOTER_COMPANY,
  SITE_FOOTER_LEARN,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
  standardsLines,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { lazy, Suspense } from 'react'
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
 * ⚠️ THE TAB, THE QUESTION AND THE CLOCK TOO, SINCE 2026-10-17 (the owner, home page audit Q11:
 * the footer the same on every page). From polish Q42 (2026-10-04) until then a garment page's
 * footer left them out, because the page ends on its own "Ask about this garment"; the owner now
 * keeps both. They load lazily with their own stylesheet (`FooterPrompt.tsx` says why), and both
 * suites hold the footer to the website's full template.
 */
const FooterTab = lazy(() => import('./FooterPrompt').then((m) => ({ default: m.FooterTab })))
const FooterQuestion = lazy(() =>
  import('./FooterPrompt').then((m) => ({ default: m.FooterQuestion })),
)
export function Footer({ settings }: { settings: ViewerSiteSettings }) {
  // An API answer cached before the footer joined it (2026-10) has none: the copy's defaults,
  // and no claim — a claim never has a default.
  const f = settings.footer ?? EMPTY_FOOTER
  const capacity = capacityLines(f.capacity)
  const marks = marksFor(f.certifications)
  const words = SITE_FOOTER_WORDS

  return (
    <footer className="site-footer">
      <Suspense fallback={null}>
        <FooterTab label={f.ctaLabel} />
      </Suspense>
      <div className="site-footer__slab">
        <FooterGlow />

        <div className="site-footer__inner">
          <Suspense fallback={null}>
            <FooterQuestion footer={f} />
          </Suspense>
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

            {/* The reading pages (2026-10-07): the guides, the FAQ and the glossary, LIVE links
                only, drawn here and in the other footer in the same change. It wears the Company
                group's class as well, for that group's print rule (off paper, footer.css): a selector
                of its own there would grow the garment pages' stylesheet, which sits at its budget
                (lighthouserc.json, raised 23 bytes for the Company group). */}
            {SITE_FOOTER_LEARN.length > 1 ? (
              <div className="footer-block footer-block--company footer-block--learn">
                <h3>{words.learn}</h3>
                <ul>
                  {SITE_FOOTER_LEARN.map((link) => (
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
                      <a href={link.url} target="_blank" rel="noopener">
                        {link.label}
                        {/* A new tab, seen and heard (owner, 2026-10-17; W3C G201). */}
                        <span aria-hidden="true"> ↗</span>
                        <span className="visually-hidden"> {words.newTab}</span>
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

            {/* Always drawn: the climate commitment's line is the company's own, not the CMS's. */}
            <div className="footer-block footer-block--standards">
              <h3>{words.standards}</h3>
              <ul>
                {standardsLines(f.certifications).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li>{CLIMATE_COMMITMENT.line}</li>
              </ul>
            </div>

            {/*
              The marks are the website's files: this page is on the same address
              (wear-run.com), so `/standards/…` is served by the site, which the image policy
              already allows as 'self'.
            */}
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
              {/* The company's own climate commitment, last, a link to where a buyer can check it
                  (`CLIMATE_COMMITMENT`, packages/shared/src/standardsLogos.ts). */}
              <a className="footer-commitment" href={CLIMATE_COMMITMENT.href} rel="noopener">
                <img
                  className="footer-logo"
                  src={CLIMATE_COMMITMENT.logo.src}
                  width={CLIMATE_COMMITMENT.logo.width}
                  height={CLIMATE_COMMITMENT.logo.height}
                  alt={CLIMATE_COMMITMENT.logo.alt}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            </div>
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
