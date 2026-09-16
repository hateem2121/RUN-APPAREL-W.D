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
 * ⚠️ EVERY CLAIM BLOCK IS CONDITIONAL. Capacity, Standards and Elsewhere render only
 * from real values; a blank claim renders no block and never an example. See the
 * comment above the footer fields in SiteSettings.ts.
 */
export function SiteFooter({ settings }: { settings: PublicSiteSettings }) {
  const f = settings.footer
  const q = splitLastWord(f.ctaQuestion)
  const hours = f.capacity.hours
  /*
   * ⚠️ THE FACTS AREA RENDERS ONE BLOCK OF FOUR TODAY, AND THAT IS THE CODE BEING RIGHT.
   *
   * Audit FA-T-13 reads "a cursor-following footer light beside an empty fact block" — a
   * fair thing to notice, and the wrong thing to fix here. Capacity, Standards and
   * Elsewhere are all CLAIMS ABOUT THE BUSINESS, and every one of them is blank in the
   * CMS, so `projectFooter()` supplies nothing and these guards hide the headings. The
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
  const showCapacity = Boolean(f.capacity.moq || f.capacity.leadTime || hours)

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
                <h3>Standards</h3>
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
            {/*
              The privacy notice is a legal requirement, not a nicety — the trigger is
              processing personal data, not setting cookies, and both surfaces process at
              least an IP address while the viewer sends errors to Sentry in the US
              (audit FA-O-75, FA-O-76). The footer is where a visitor looks for it.
            */}
            <Link className="nav-link" href="/privacy">
              Privacy
            </Link>
            <Link className="nav-link" href="/terms">
              Terms
            </Link>
          </div>
        </div>

        <FooterWordmark text={settings.temporaryWordmark} />
      </div>
    </footer>
  )
}
