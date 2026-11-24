// The Russian twin of app/(frontend)/guides/page.tsx (Russian section, 2026-11-15): the same page,
// every guide in the English order, each the Russian guide at the same path (lib/i18n/ruNames.ts).
import type { Metadata } from 'next'
import { GuideCard } from '../../../../components/site/GuideCard'
import { GuideLinks } from '../../../../components/site/GuidePage'
import { GUIDES } from '../../../../lib/guides'
import { GUIDES_INDEX_RU, guideAtRu } from '../../../../lib/i18n/ruNames'
import { t } from '../../../../lib/i18n/ui'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(GUIDES_INDEX_RU),
  description: GUIDES_INDEX_RU.description,
  path: GUIDES_INDEX_RU.path,
  locale: 'ru',
})

export default function RussianGuidesPage() {
  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">{t('ru', '[ Buyer guides ]')}</p>
          {/* `hero-legal`: this headline never swaps fonts (site.css, "The guide headlines never swap").
              Measured on the live site, 23 Nov 2026: about half a second after load the Cyrillic
              face arrived, the headline re-wrapped (100px, 117px, back to 100px tall) and the page
              under it moved up to 70px: layout shift 0.04, 0.47 and 0.48 in three runs at 1440px,
              0.03 to 0.06 on a phone. The English list measured 0 and is unchanged. The Russian
              guides, policy and buyer pages already draw their headlines this way. */}
          <h1 className="display display--hero hero-legal">
            {GUIDES_INDEX_RU.heading}{' '}
            <span className="serif-accent">{GUIDES_INDEX_RU.headingAccent}</span>
          </h1>
          <p className="site-lede">{GUIDES_INDEX_RU.lede}</p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <ul className="guide-grid">
            {GUIDES.map((guide) => (
              <GuideCard key={guide.path} guide={guideAtRu(guide.path)} locale="ru" />
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <GuideLinks current={GUIDES_INDEX_RU.path} guides={false} locale="ru" />
        </div>
      </section>
    </>
  )
}
