import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/instrument-serif/400-italic.css'
// ORDER IS LOAD-BEARING — the same three-import cascade (frontend)/layout.tsx uses.
import '@run-apparel/ui/tokens.css'
import '@run-apparel/ui/base.css'
import '@run-apparel/ui/notch.css'
import './(frontend)/site.css'

import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '../components/site/SiteFooter'
import { SiteHeader } from '../components/site/SiteHeader'
import { FALLBACK_SITE_SETTINGS } from '../lib/projectPublic'
import { THEME_COLOR } from '../lib/themeColor'

/**
 * The page a mistyped or retired URL lands on.
 *
 * ⚠️ THIS IS AT THE APP ROOT, AND MOVING IT BACK INTO A ROUTE GROUP RE-BREAKS IT FOR
 * EVERY VISITOR WITHOUT JAVASCRIPT. That is the whole reason this file exists here.
 *
 * The previous arrangement was a `[...unmatched]/page.tsx` catch-all inside `(frontend)`
 * that called `notFound()`, so the branded page rendered inside the site's own layout.
 * It looked right and it was measured, three ways, to be a blank white screen with
 * scripting off — 0 characters of body text, no heading, no links, on every wrong URL
 * (audit FA-I-01, FA-P-01, reported independently by two lenses and confirmed by a third
 * instrument that was not a browser).
 *
 * ⚠️ THE CAUSE IS AN OPEN UPSTREAM BUG, NOT THIS CODEBASE. `notFound()` does not
 * server-render its page: the markup is delivered only inside the Flight payload, so it
 * exists in the response and never in the HTML. vercel/next.js#62228 and #57583, open
 * since 14.1 and still present on 16.3. There is no documented workaround that keeps the
 * 404 status.
 *
 * MEASURED HERE, 2026-09-07, raw HTTP with no browser involved:
 *
 *   catch-all + notFound()          404, 13,451 bytes, 0 <h1>, 0 links,  28 chars
 *   rendering the same UI directly  200, 17,365 bytes, 1 <h1>, 13 links, 793 chars
 *   NO catch-all (Next's own)       404,  7,087 bytes, 1 <h1>, 0 links, 290 chars
 *
 * The third line is the finding: an unmatched URL that reaches Next's own not-found
 * handling IS server-rendered, with the right status. Only `notFound()` is broken. So the
 * catch-all was deleted and this took its place — Next renders it for any URL that
 * matches no route, in HTML, at 404, with no JavaScript involved.
 *
 * `force-dynamic` and `export const dynamic` were both tried and changed nothing;
 * middleware and a proxy cannot be deployed on this stack at all (apps/cms/CLAUDE.md).
 *
 * ⚠️ IT RENDERS ITS OWN `<html>` AND `<body>`, AND IT MUST. There is no root layout here
 * — `(frontend)` and `(payload)` each carry their own — so a root not-found is outside
 * every layout and has to bring the document with it. That is also why the font and token
 * imports are repeated above rather than inherited.
 *
 * ⚠️ AND IT READS NO DATABASE, DELIBERATELY. The header used to take the wordmark from
 * D1. A 404 is disproportionately likely to be reached during exactly the failure that
 * would make that read fail, and this page's whole job is to work when something else has
 * not. The shared defaults are the same values the CMS ships as its field defaults, so
 * the wordmark is identical in practice; if the owner ever renames the company it changes
 * here too, which `publicSite.test.ts` pins.
 * The bar is the site's own SiteHeader (a server component taking this one string), so the
 * 404 has the phone menu too — it was a hand-copied bar until Phase 1b-B.
 *
 * ⚠️ IT MUST NOT BE INDEXABLE. Next adds its own `noindex` to a not-found route, and the
 * `robots` below makes the second tag restrictive too — without it the page inherited
 * `index, follow` from a layout and told crawlers both things at once. Google resolves a
 * conflict by taking the most restrictive directive, so it would probably have been fine,
 * "probably" being the whole problem. `e2e/notfound.spec.ts` asserts EVERY robots tag is
 * restrictive rather than asserting a count, because the count is not what matters.
 *
 * WHAT IT OFFERS. A dead end with no way out is the real failure, not the 404: someone who
 * mistypes a garment slug from a printed QR tag has a real intention, and the routes below
 * are the whole site. No search box — there is nothing to search across five pages, and it
 * would be a control that always disappoints.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

/** The phone's browser bar follows the page here too, as on every other page (audit CO-05). */
export const viewport: Viewport = { themeColor: THEME_COLOR }

export default function NotFound() {
  const wordmark = DEFAULT_SITE_SETTINGS.temporaryWordmark

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <SiteHeader wordmark={wordmark} />

        <main id="main" className="site-main" tabIndex={-1}>
          <section className="site-hero">
            <div className="blueprint site-hero__grid" aria-hidden="true" />
            <div className="site-container">
              <p className="label">[ 404 · PAGE NOT FOUND ]</p>
              <h1 className="display display--hero">
                That page isn&rsquo;t here. <span className="serif-accent">The rest&nbsp;is.</span>
              </h1>
              <p className="site-lede">
                The address may have changed, or a character may have been mistyped. If you scanned
                a tag on a garment and reached this, the reference has moved — tell us and we will
                send the current link.
              </p>
              <div className="site-actions">
                <Link className="btn btn--primary" href="/products">
                  Browse the references
                </Link>
                <Link className="btn btn--ghost" href="/contact">
                  Tell us what you were looking for
                </Link>
              </div>
              {/*
                The address in full, not only behind a button. Someone who reached this by
                scanning a tag on a garment has a specific question, and one more click to
                find out where to send it is one click too many. `DEFAULT_SITE_SETTINGS`
                again — this line must survive the outage that produced the 404.
              */}
              <p className="site-lede">
                Or write to us directly:{' '}
                <a className="prose__link" href={`mailto:${DEFAULT_SITE_SETTINGS.email}`}>
                  {DEFAULT_SITE_SETTINGS.email}
                </a>
              </p>
            </div>
          </section>
        </main>
        {/*
          The site's own footer, from the built-in fallback settings rather than D1 — the same
          object `getSiteSettings()` returns during an outage — so a broken link still offers
          the address, the contact routes and the privacy and terms pages (audit LA-05) while
          this page keeps its rule of reading no database.
        */}
        <SiteFooter settings={FALLBACK_SITE_SETTINGS} />
      </body>
    </html>
  )
}
