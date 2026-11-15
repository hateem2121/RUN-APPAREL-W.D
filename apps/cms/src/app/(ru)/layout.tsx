/*
 * THE RUSSIAN SECTION'S ROOT LAYOUT (owner's decision 2026-11-15; design in
 * docs/superpowers/specs/2026-11-15-russian-section-design.md).
 *
 * ⚠️ THE ENGLISH LAYOUT, apps/cms/src/app/(frontend)/layout.tsx, IS THE AUTHORITY, AND ITS COMMENTS
 * EXPLAIN EVERY LINE BELOW. This is that file with four differences, and only these:
 *   1. `<html lang="ru">`, so Yandex, Google, screen readers and hyphenation read Russian;
 *   2. the Cyrillic faces (`cyrillic.css`), which only this layout imports;
 *   3. `CHROME.ru` handed to the header, footer, cookie question, progress line and curtain;
 *   4. a Russian default title.
 * `russianLayout.test.ts` holds the two files to the same components in the same order, so a part
 * added to the English layout and forgotten here fails a test.
 *
 * A third ROOT layout, beside (frontend) and (payload), because `<html lang>` belongs to the root:
 * a layout nested under (frontend) cannot change it. Moving between the two languages loads the
 * page whole, which is what a change of `<html lang>` should do.
 */
import '@run-apparel/ui/archivo.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@run-apparel/ui/cyrillic.css'
import '@run-apparel/ui/tokens.css'
import '@run-apparel/ui/base.css'
import '@run-apparel/ui/notch.css'
import '@run-apparel/ui/footer.css'
import '@run-apparel/ui/footer-prompt.css'
import '../(frontend)/site.css'
import type { Metadata, Viewport } from 'next'
import type React from 'react'
import { AboutPreloader } from '../../components/site/AboutPreloader'
import { Analytics } from '../../components/site/Analytics'
import { CardOpening } from '../../components/site/CardOpening'
import { ConsentBanner } from '../../components/site/ConsentBanner'
import { ContactClicks } from '../../components/site/ContactClicks'
import { Cursor } from '../../components/site/Cursor'
import { GarmentWarm } from '../../components/site/GarmentWarm'
import { JsonLd } from '../../components/site/JsonLd'
import { NavProgress } from '../../components/site/NavProgress'
import { SiteFooter } from '../../components/site/SiteFooter'
import { SiteHeader } from '../../components/site/SiteHeader'
import { SmoothScroll } from '../../components/site/SmoothScroll'
import { ThemeBoot } from '../../components/site/ThemeBoot'
import { getSiteSettings } from '../../lib/content'
import { CHROME } from '../../lib/i18n/chrome'
import { robotsFor, searchVisibility } from '../../lib/searchVisibility'
import { SITE_ORIGIN } from '../../lib/seo'
import { GARMENT_PREFETCH_RULES } from '../../lib/speculationRules'
import { organizationJsonLd } from '../../lib/structuredData'
import { THEME_COLOR } from '../../lib/themeColor'

export const viewport: Viewport = { themeColor: THEME_COLOR }

const DEFAULT_ICON = '/icon.svg'

/** The Russian home page's title when a page sets none; each Russian page sets its own. */
export const RU_HOME_TITLE = 'Производитель спортивной одежды под вашей маркой'

export async function generateMetadata(): Promise<Metadata> {
  const [settings, visibility] = await Promise.all([getSiteSettings(), searchVisibility()])
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      template: '%s | RUN APPAREL',
      default: RU_HOME_TITLE,
    },
    robots: robotsFor(visibility),
    icons: {
      icon: settings.logoUrl
        ? [{ url: settings.logoUrl, type: settings.logoMimeType ?? undefined }]
        : [{ url: DEFAULT_ICON, type: 'image/svg+xml' }],
      apple: '/apple-touch-icon.png',
    },
  }
}

export default async function RussianLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  const chrome = CHROME.ru
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeBoot />
        <AboutPreloader loading={chrome.loading} />
        <JsonLd data={organizationJsonLd(settings)} />
        <script
          type="speculationrules"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant written in lib/speculationRules.ts, never content; the only way to put speculation rules in the page.
          dangerouslySetInnerHTML={{ __html: GARMENT_PREFETCH_RULES }}
        />
        <a className="skip-link" href="#main">
          {chrome.skipLink}
        </a>
        <ConsentBanner
          copy={chrome.consent}
          privacyHref={chrome.footerLinks.find((link) => link.consent)?.href ?? '/ru/privacy'}
          label="Выбор файлов cookie"
        />
        <ContactClicks email={settings.email} />
        <NavProgress lang="ru" />
        <SiteHeader wordmark={settings.temporaryWordmark} chrome={chrome} />
        <main id="main" className="site-main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter settings={settings} chrome={chrome} />
        <Analytics />
        <Cursor />
        <SmoothScroll />
        <CardOpening />
        <GarmentWarm siteOrigin={SITE_ORIGIN} />
      </body>
    </html>
  )
}
