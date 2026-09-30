import type { Metadata } from 'next'
import Link from 'next/link'
import { GuideLinks } from '../../../components/site/GuidePage'
import { GUIDES, GUIDES_INDEX } from '../../../lib/guides'
import { buildMetadata } from '../../../lib/seo'

/**
 * The guides' index: the page the footer's "Guides" link opens (owner, 2026-09-30).
 * It shows each guide's own title and description from `lib/guides.ts`, so it says nothing
 * the guides do not.
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
          <p className="label">[ BUYER GUIDES ]</p>
          <h1 className="display display--hero">
            {GUIDES_INDEX.heading}{' '}
            <span className="serif-accent">{GUIDES_INDEX.headingAccent}</span>
          </h1>
          <p className="site-lede">{GUIDES_INDEX.lede}</p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container prose">
          {GUIDES.map((guide) => (
            <div key={guide.path}>
              <h2 className="product-card__name prose__heading">{guide.title}</h2>
              <p>{guide.description}</p>
              <div className="site-actions">
                <Link className="btn btn--ghost" href={guide.path}>
                  Read this guide
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <GuideLinks current={GUIDES_INDEX.path} />
        </div>
      </section>
    </>
  )
}
