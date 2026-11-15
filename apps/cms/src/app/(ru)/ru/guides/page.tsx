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
          <h1 className="display display--hero">
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
