import type { Metadata } from 'next'
import { GuideCard } from '../../../components/site/GuideCard'
import { GuideLinks } from '../../../components/site/GuidePage'
import { GUIDES, GUIDES_INDEX } from '../../../lib/guides'
import { buildMetadata } from '../../../lib/seo'

/**
 * The guides' index: the page the footer's "Guides" link opens (owner, 2026-09-30).
 * It shows each guide's own title and description from `lib/guides.ts`, so it says nothing
 * the guides do not.
 *
 * ⚠️ EACH GUIDE APPEARS ONCE (visual audit VA-47, 2026-10-02): as a card that is one link. The
 * index used to list every guide twice, as a card with a button and again as a chip in the list
 * at the foot of the page. The foot of the page now carries only the links the cards do not
 * repeat, the four buyer pages; the guide pages themselves still list their sibling guides.
 *
 * No database read of its own, but still rendered per request like every other page here:
 * the layout reads the site settings, and `(frontend)/page.tsx` records why that cannot be
 * prerendered.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: GUIDES_INDEX.title,
  description: GUIDES_INDEX.description,
  path: GUIDES_INDEX.path,
})

export default function GuidesPage() {
  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Buyer guides ]</p>
          <h1 className="display display--hero">
            {GUIDES_INDEX.heading}{' '}
            <span className="serif-accent">{GUIDES_INDEX.headingAccent}</span>
          </h1>
          <p className="site-lede">{GUIDES_INDEX.lede}</p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <ul className="guide-grid">
            {GUIDES.map((guide) => (
              <GuideCard key={guide.path} guide={guide} />
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <GuideLinks current={GUIDES_INDEX.path} guides={false} />
        </div>
      </section>
    </>
  )
}
