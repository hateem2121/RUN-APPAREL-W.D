/*
 * ⚠️ DO NOT "OPTIMISE" THESE INTO next/font TO GET A PRELOAD. IT WAS TRIED AND MEASURED
 * WORSE, on 2026-09-05, and the instinct to try it is entirely reasonable.
 *
 * A font declared inside a stylesheet cannot be fetched until that stylesheet has
 * arrived, so these start late — 639 ms against an HTML response finished at 350 ms.
 * Moving them to `next/font/local` fixes exactly that: the fetch starts at 318 ms.
 *
 * It also makes the page slower. Five runs each, throttled to 1.6 Mbps / 150 ms latency
 * (nothing is visible on localhost, where everything finishes inside 90 ms):
 *
 *                     fontsource      next/font + preload
 *   first paint         664 ms          732 ms      <- 68 ms WORSE
 *   font fetch starts   639 ms          318 ms
 *   Archivo delivered  1788 ms         1767 ms      <- unchanged
 *
 * The connection is the constraint, not the discovery order. Preloading 110 KB of fonts
 * ahead of a 4.4 KB stylesheet takes bandwidth from the one file that unblocks painting,
 * so text appears later — and the fonts still arrive at the same moment, because the
 * pipe was always the limit. `font-display: swap` already means nobody waits on them.
 *
 * The lesson generalises: preload is a priority hint, and raising the priority of
 * something large is the same as lowering the priority of everything else.
 * `products/page.tsx` preconnects to the media host, which costs no bandwidth at all —
 * that is the shape of hint worth adding.
 */
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/instrument-serif/400-italic.css'
// ORDER IS LOAD-BEARING — tokens define the custom properties the two files below
// read. The same three-import cascade apps/viewer uses, from the same package, so the
// public site and the 3D reference cannot drift apart visually.
import '@run-apparel/ui/tokens.css'
import '@run-apparel/ui/base.css'
import './site.css'

import type { Metadata } from 'next'
import type React from 'react'
import { Analytics } from '../../components/site/Analytics'
import { Cursor } from '../../components/site/Cursor'
import { JsonLd } from '../../components/site/JsonLd'
import { SiteFooter } from '../../components/site/SiteFooter'
import { SiteHeader } from '../../components/site/SiteHeader'
import { getSiteSettings } from '../../lib/content'
import { robotsFor, searchVisibility } from '../../lib/searchVisibility'
import { SITE_ORIGIN } from '../../lib/seo'
import { organizationJsonLd } from '../../lib/structuredData'

/**
 * The PUBLIC marketing site.
 *
 * ⚠️ This route group used to be a stub carrying `robots: { index: false }`, because the
 * only thing on this Worker was the admin. It is now indexable on purpose. The admin and
 * the REST API live in the sibling `(payload)` group and are unaffected — they are
 * protected by authentication, never by this metadata, and `publicSite.test.ts` pins
 * that distinction.
 *
 * ⚠️ IT DECLARES `noindex` WHILE THE BETA IS HIDDEN, AND NOTHING WHEN VISIBLE — the
 * switch is `SITE_INDEXING` (src/lib/searchVisibility.ts). Declaring `index` here was
 * tried and is what the rest of this paragraph is about:
 * `index, follow` is what every crawler does without being told, so stating it bought
 * nothing — and it actively broke the 404. Measured 2026-09-05 on `/definitely-not-a-page`:
 *
 *   initial HTML      noindex  +  noindex, follow      <- correct
 *   AFTER HYDRATION   index, follow  +  noindex        <- contradictory
 *
 * React's client-side metadata reconciliation replaced the not-found page's own
 * `noindex, follow` with this layout's `index, follow`, so a crawler that executes
 * JavaScript — Googlebot does — ended up reading both instructions at once. Google
 * resolves that by taking the most restrictive, so it would probably have been fine;
 * "probably" is not a basis for whether the company's 404 is indexable.
 *
 * Removing the declaration fixes it at the source and changes nothing for the three real
 * pages, which are indexable by default. `publicSite.test.ts` therefore asserts the
 * ABSENCE of a noindex rather than the presence of an index — the leftover `noindex` is
 * the failure that was ever worth guarding against.
 */
/** Shipped fallback mark, served from public/. See the comment in that file. */
const DEFAULT_ICON = '/icon.svg'

/**
 * `generateMetadata`, not a static `metadata` export, because the tab icon is now the
 * owner's to set: Settings → "Company logo (browser tab icon)" in the admin.
 *
 * ⚠️ THE FALLBACK MARK HAD TO LEAVE app/ FOR THIS TO WORK. As `app/icon.svg` it was
 * Next's file-based metadata convention, and file-based metadata BEATS whatever
 * generateMetadata returns — so uploading a logo would have changed nothing, silently,
 * with the CMS field looking like it worked. It lives in public/ instead, referenced
 * here by URL, so there is exactly one place that decides.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, visibility] = await Promise.all([getSiteSettings(), searchVisibility()])
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      template: '%s — RUN APPAREL',
      default: 'RUN APPAREL — Custom B2B Sportswear & Team Wear Manufacturer',
    },
    // `noindex` while the beta is hidden; NOTHING when visible — see searchVisibility.ts
    // and the paragraph above about why `index: true` must never be declared here.
    robots: robotsFor(visibility),
    icons: {
      icon: settings.logoUrl
        ? [{ url: settings.logoUrl, type: settings.logoMimeType ?? undefined }]
        : [{ url: DEFAULT_ICON, type: 'image/svg+xml' }],
    },
  }
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  return (
    <html lang="en">
      <body>
        {/* Site-wide, so every page carries the company identity a crawler or an AI
            reader resolves the rest of the page against. The other blocks reference
            this node by @id rather than redescribing the company. */}
        <JsonLd data={organizationJsonLd(settings)} />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader wordmark={settings.temporaryWordmark} />
        {/*
          ⚠️ tabindex="-1" IS WHAT MAKES THE SKIP LINK REACH A SCREEN READER.
          Measured 2026-09-05: activating the skip link set the hash and the NEXT Tab
          did land inside the content, so it worked for a sighted keyboard user — but
          `document.activeElement` stayed on BODY, which is what a screen reader follows.
          A non-focusable target only sets the "sequential focus navigation starting
          point"; it does not move focus. -1 keeps it out of the tab order while making
          it focusable programmatically.
        */}
        <main id="main" className="site-main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter settings={settings} />
        <Analytics />
        {/* The viewer's dot-and-ring cursor, dependency-free; fine pointers only. */}
        <Cursor />
      </body>
    </html>
  )
}
