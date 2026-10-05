import {
  capacityLines,
  formatPhoneForDisplay,
  markBox,
  marksFor,
  normalizeWhatsAppNumber,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
  splitLastWord,
  standardsLines,
} from '@run-apparel/shared'
import Link from 'next/link'
import type { PublicSiteSettings } from '../../lib/projectPublic'
import { formatAddress } from '../../lib/structuredData'
import { ConsentLink } from './ConsentLink'
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
 * ⚠️ EVERY CLAIM BLOCK IS CONDITIONAL. Capacity, Standards and Elsewhere render only
 * from real values; a blank claim renders no block and never an example. See the
 * comment above the footer fields in SiteSettings.ts.
 *
 * ⚠️ THE GARMENT PAGES DRAW THIS FOOTER TOO (visual audit VA-31, 2026-10-02):
 * apps/viewer/src/components/Footer.tsx. The words, links and rules are shared
 * (@run-apparel/shared siteFooter.ts), the stylesheet is packages/ui/src/footer.css, and both
 * browser suites hold the rendered footer to `siteFooterAriaSnapshot` — so a block added or
 * moved here must be added or moved there in the same change, or both suites fail.
 */
export function SiteFooter({ settings }: { settings: PublicSiteSettings }) {
  const f = settings.footer
  const q = splitLastWord(f.ctaQuestion)
  const hours = f.capacity.hours
  const capacity = capacityLines(f.capacity)
  const marks = marksFor(f.certifications)
  const words = SITE_FOOTER_WORDS
  /*
   * ⚠️ WITH BLANK CLAIMS THE FACTS AREA RENDERS ONLY CONTACT AND "WHAT WE MAKE", AND THAT IS THE
   * CODE BEING RIGHT. (The live footer has all five, from the facts the owner supplied on
   * 2026-09-16, scripts/apply-footer-facts.mjs; a fresh database, CI's included, has none.)
   *
   * Audit FA-T-13 reads "a cursor-following footer light beside an empty fact block" — a
   * fair thing to notice, and the wrong thing to fix here. Capacity, Standards and
   * Elsewhere are all CLAIMS ABOUT THE BUSINESS, and when one is blank in the
   * CMS, `projectFooter()` supplies nothing and these guards hide the heading. The
   * alternative is a footer that invents a certification, which is the failure this
   * shape exists to prevent; `e2e/footer.spec.ts` -> "no block is ever empty, and no
   * placeholder ever appears" is the guard.
   *
   * ⚠️ AND A CODE-SIDE DEFAULT IS NOT THE ANSWER EITHER, though the numbers now exist.
   * The owner confirmed minimum order and lead time on 2026-09-07 and both are in
   * `lib/companyFacts.ts`, which the home page renders — so it is tempting to fall back
   * to them here. That would falsify the sentence the admin panel shows above these very
   * fields: "Every box is optional and the footer hides what is blank." A box that keeps
   * showing a number after you empty it is a worse surprise than an empty band.
   *
   * It is an owner task, not an engineering one, and it is ten minutes:
   * `docs/OWNER-CHECKLIST.md` §5 now carries the exact strings to paste.
   */

  return (
    <footer className="site-footer">
      <FooterTab label={f.ctaLabel} email={settings.email} />

      <div className="site-footer__slab">
        <FooterGlow />

        {/*
          ⚠️ THE CONTENT COLUMN. The slab stays full-bleed — background, blueprint grid,
          glow and the cropped wordmark all run to the edge on purpose — but its TEXT ran
          to the edge too, so the footer’s left edge left the page’s by up to 370px at
          1920 and by 4.6–6.2px at tablet widths (audit FA-D-01). That middle band is the
          tell it was a bug and not a device: the two paddings share a floor and a ceiling,
          so they were plainly meant to agree.

          `FooterGlow` and `FooterWordmark` stay OUTSIDE this wrapper, which is the whole
          point of introducing it rather than padding the slab.
        */}
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
              <FooterClock hours={hours} />
            </div>
          </div>

          <div className="footer-grow" />

          <div className="footer-facts">
            <div className="footer-block footer-block--contact">
              <h3>{words.contact}</h3>
              <ul>
                <li>
                  <a href={`mailto:${settings.email}`}>{settings.email}</a>
                </li>
                <li>
                  <a
                    href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`}
                    rel="noopener"
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

            {/*
              The four category pages, on every page (polish F9, the owner's Q22): the audit found
              them reached only from the home page's cards, the guides and each other. Before the
              claims, with Elsewhere, so the two short link lists share a row on a phone (X23).
            */}
            <div className="footer-block footer-block--made">
              <h3>{words.made}</h3>
              <ul>
                {SITE_FOOTER_MADE.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

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

            {/*
             * ⚠️ "Standards", NOT "Certified", AND THE HEADING IS THE WHOLE POINT.
             * RUN APPAREL holds no certification in its own name — `lib/companyFacts.ts`
             * CERTIFICATION says so and has been live since 2026-09-07. The parent,
             * DURUS INDUSTRIES, is SEDEX-registered and SMETA-audited; the fabric and
             * trim suppliers hold OEKO-TEX, GOTS and GRS. A heading reading "Certified"
             * over supplier-held standards is a false claim aimed at the buyers most
             * likely to verify it, and OEKO-TEX, GOTS and Textile Exchange each reserve
             * the right to act on misuse. Owner's ruling 2026-09-16.
             *
             * The entries carry the qualifier ("Parent: …", "Suppliers: …") rather than
             * the heading, because this row is four columns of single-word headings:
             * measured on the live footer in its 10px spaced-caps mono, "Standards" is
             * 69px and "Certified" was 69px, so the row is unchanged, while the owner's
             * first choice, "Our supply chain standards", measured 199px — 2.9x the
             * widest heading there, and wrapping at 200% text.
             */}
            {f.certifications.length > 0 ? (
              <div className="footer-block footer-block--standards">
                <h3>{words.standards}</h3>
                <ul>
                  {/*
                   * ⚠️ THE TEXT LINE STAYS WITH THE MARKS (owner's ruling 2026-09-16, kept when
                   * the owner chose real logos on 2026-09-29, D25). A logo alone says "certified";
                   * the qualifier says who holds it — the parent, or the suppliers — and SMETA is
                   * an audit, not a certificate. The marks themselves sit in one row under the
                   * facts (`footer-marks` below).
                   */}
                  {/* Entries with the same holder share a line (X23: two began "Suppliers:"). */}
                  {standardsLines(f.certifications).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {marks.length > 0 ? (
              <div className="footer-marks" role="group" aria-label={words.marks}>
                {marks.map((logo) => (
                  // biome-ignore lint/performance/noImgElement: no `sharp` on Workers, and these are already-optimised SVGs of a few KB, which next/image would pass through unchanged (ProductPoster.tsx measures why).
                  <img
                    key={logo.slug}
                    className="footer-logo"
                    src={logo.src}
                    // Drawn at one area, not one height (polish X23, `markBox`).
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

          {/*
            `legalLine` ALREADY CONTAINS the company name — its default is
            "© RUN APPAREL (PVT) LTD" and `companyName` is "RUN APPAREL (PVT) LTD".
            Appending one to the other once rendered the name twice on every page.
          */}
          <div className="footer-legal">
            <span translate="no">{settings.legalLine}</span>
            <span>{settings.footerLine}</span>
            {/*
              The bottom row, in SITE_FOOTER_LINKS's order (each entry says why it is here): the
              privacy notice is a legal requirement — both surfaces process at least an IP address
              (audit FA-O-75, FA-O-76) — and the cookie link is the way back to the cookie
              question, one click from every page, drawn by ConsentLink because it reopens the
              question in place.
            */}
            {SITE_FOOTER_LINKS.map((link) =>
              link.consent ? (
                <ConsentLink key={link.href} />
              ) : (
                <Link key={link.href} className="nav-link" href={link.href}>
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>

        <FooterWordmark text={settings.temporaryWordmark} />
      </div>
    </footer>
  )
}
