import type { ViewerSiteSettings } from '@run-apparel/shared'

export function Footer({ settings }: { settings: ViewerSiteSettings }) {
  return (
    <footer className="footer blueprint" data-reveal>
      <div className="footer__inner">
        <p className="footer__brand">{settings.temporaryWordmark}</p>
        <p className="footer__line">{settings.footerLine}</p>
        {/*
          The "Back to Catalogue" link was removed here on 2026-09-04, by owner
          decision: these pages are indexed, and the catalogue is a 54 MB B2B PDF
          that should not be handed to arbitrary search traffic.

          `.footer__meta` now holds one child. That matters: `page.css` sizes
          `.footer__meta a` to 105x32 and passes WCAG 2.5.8 only through the
          SPACING exception, with a comment saying the exemption evaporates the
          moment a second link joins the row. There is now no link at all, so the
          question is moot — but if one is ever added back, it needs a real 44px
          target rather than the exception.
        */}
        <div className="footer__meta">
          <span>{settings.legalLine}</span>
        </div>
      </div>
    </footer>
  )
}
