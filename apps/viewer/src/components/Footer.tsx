import { formatAddress, type ViewerSiteSettings } from '@run-apparel/shared'
import { track } from '../lib/analytics'
import { SITE_ORIGIN, SITE_PRIVACY_URL, SITE_TERMS_URL } from '../lib/siteLinks'

/** `https://wa.me/…` wants the digits only. `+92 336 …` is what a human reads. */
function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}`
}

export function Footer({ settings }: { settings: ViewerSiteSettings }) {
  return (
    <footer className="footer blueprint" data-reveal>
      <div className="footer__inner">
        <p className="footer__brand">{settings.temporaryWordmark}</p>
        <p className="footer__line">{settings.footerLine}</p>
        {/*
          THE CONTACT DETAILS ARE HERE FROM 2026-09-07 — audit FA-Q-09.

          The footer held three lines of text and nothing else: the surface a buyer
          reaches by scanning a physical tag was the one that did not print the
          company's address, while the marketing site's footer prints email,
          WhatsApp and a postal address. That is the wrong way round — this is the
          page someone lands on when they are holding the garment and want to know
          who made it.

          ⚠️ THE ADDRESS IS THE LINK TEXT, NOT "EMAIL US", AND THE href CARRIES NO
          TEMPLATE. The three enquiry pairs above (StageContact, ContactSection,
          MobileActionBar) are conversion controls and pre-fill the garment's code
          and colourway; `viewer.spec.ts` pins that template. This is a *detail* — a
          buyer verifying a supplier wants to read the address, copy it, or send
          from their own account, so a prefilled subject line would be in the way.
          Keep the two kinds separate: if this ever grows a template, the test that
          asserts the locked one is scoped to `.contact a` and will not notice.

          `.footer__meta a` was already given `min-height: 32px` in anticipation of
          exactly this: the comment there records that its WCAG 2.5.8 spacing
          exception "evaporates the moment a second link is added to this row", and
          three now are. 32px clears the 24px floor outright, no exception needed.
        */}
        <div className="footer__meta">
          <a href={`mailto:${settings.email}`} onClick={() => track('email_clicked')}>
            {settings.email}
          </a>
          <a
            href={whatsappHref(settings.whatsappNumber)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('whatsapp_clicked')}
          >
            {settings.whatsappNumber}
          </a>
          {/*
            THE POSTAL ADDRESS, from the same constant the site footer prints
            (`@run-apparel/shared` → company.ts), so the two hosts cannot disagree about
            where the company is.
          */}
          <span>{formatAddress()}</span>
          {/*
            The one route off this page that is not an enquiry (audit FA-W-01). The
            wordmark in the header is the same destination; this is the version a
            visitor who has read to the bottom of the page can see, and it is
            spelled out as a host rather than dressed as a button — see
            `lib/siteLinks.ts` for why this is not the catalogue.
          */}
          <a href={SITE_ORIGIN}>{SITE_ORIGIN.replace(/^https:\/\//, '')}</a>
          {/*
            THE PRIVACY NOTICE AND THE TERMS. Both surfaces process visitor data — an IP
            address at the edge, error reports to Sentry — and the notice says it covers
            these pages, so it is linked here as it is on the site. These are links to the
            site's pages, not copies: `siteLinks.test.ts` fails if either route moves.
            They inherit `.footer__meta a`'s 32px height, so no CSS is added.
          */}
          <a href={SITE_PRIVACY_URL}>Privacy</a>
          <a href={SITE_TERMS_URL}>Terms</a>
          <span>{settings.legalLine}</span>
        </div>
      </div>
    </footer>
  )
}
