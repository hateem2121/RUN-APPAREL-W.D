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
import { SiteFooter } from '../../components/site/SiteFooter'
import { SiteHeader } from '../../components/site/SiteHeader'
import { getSiteSettings } from '../../lib/content'
import { SITE_ORIGIN } from '../../lib/seo'

/**
 * The PUBLIC marketing site.
 *
 * ⚠️ This route group used to be a stub carrying `robots: { index: false }`, because
 * the only thing on this Worker was the admin. It is now indexable on purpose. The
 * admin and the REST API live in the sibling `(payload)` group and are unaffected —
 * they are protected by authentication, never by this metadata, and
 * `publicSite.test.ts` pins that distinction.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    template: '%s — RUN APPAREL',
    default: 'RUN APPAREL — Custom B2B Sportswear & Team Wear Manufacturer',
  },
  robots: { index: true, follow: true },
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader settings={settings} />
        <main id="main" className="site-main">
          {children}
        </main>
        <SiteFooter settings={settings} />
      </body>
    </html>
  )
}
