import Link from 'next/link'
import { FAMILIES } from '../../lib/families'
import { FAMILY_PAGE_ACTION, familyPageFor } from '../../lib/familyPages'
import { GUIDES, GUIDES_INDEX, type Guide, type GuideBlock } from '../../lib/guides'
import { guideBreadcrumbJsonLd } from '../../lib/structuredData'
import { JsonLd } from './JsonLd'

/**
 * One buyer guide (2026-09-30). Every word comes from `lib/guides.ts`, which the owner
 * approved; this file only lays it out, from pieces the site already has.
 *
 * ⚠️ ONE PRIMARY BUTTON, at the end, in the buyer pages' words (`e2e/copy.spec.ts`, CT-08).
 * A guide is read top to bottom, so the way in comes after the answer, not before it.
 *
 * The closing heading and sentence are the home page's own (№06), so the guides add no
 * claim the site does not already make.
 */
function Block({ block }: { block: GuideBlock }) {
  if (block.kind === 'text') return <p>{block.text}</p>
  if (block.kind === 'label') return <p className="subhead">{block.text}</p>
  if (block.kind === 'point') {
    return (
      <div>
        <h3 className="product-card__name prose__heading">{block.title}</h3>
        <p>{block.text}</p>
      </div>
    )
  }
  const List = block.ordered ? 'ol' : 'ul'
  return (
    <List className="prose__list">
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </List>
  )
}

/**
 * The other guides and the buyer pages, as the chips `/products` filters with.
 *
 * `guides={false}` leaves the guides out: the index shows every guide as a card already, so the
 * same seven as chips was the repetition VA-47 removed (2026-10-02). Every guide page keeps them.
 */
export function GuideLinks({ current, guides = true }: { current: string; guides?: boolean }) {
  const buyerPages = FAMILIES.map((family) => ({ family, page: familyPageFor(family) }))
  return (
    <nav className="filter-bar filter-bar--titles" aria-label="More to read">
      {(guides ? GUIDES.filter((guide) => guide.path !== current) : []).map((guide) => (
        <Link key={guide.path} className="filter-chip" href={guide.path}>
          {guide.title}
        </Link>
      ))}
      {current === GUIDES_INDEX.path ? null : (
        <Link className="filter-chip" href={GUIDES_INDEX.path}>
          All guides
        </Link>
      )}
      {buyerPages.map(({ family, page }) =>
        page ? (
          <Link key={page.path} className="filter-chip" href={page.path}>
            {family.name}
          </Link>
        ) : null,
      )}
    </nav>
  )
}

export function GuidePage({ guide }: { guide: Guide }) {
  return (
    <>
      <JsonLd data={guideBreadcrumbJsonLd(guide)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Buyer guide ]</p>
          {/* `hero-guide`: this headline never swaps fonts mid-visit (site.css, 2026-10-01).
              `display--long`: 36-46 characters, so a phone sets it with more air (base.css, VA-45). */}
          <h1 className="display display--hero display--long hero-guide">
            {guide.heading} <span className="serif-accent">{guide.headingAccent}</span>
          </h1>
          <p className="site-lede">{guide.lede}</p>
        </div>
      </section>

      {guide.sections.map((section) => (
        <section className="site-section" data-site-reveal key={section.heading}>
          <div className="site-container prose prose--guide">
            <h2 className="display display--section">{section.heading}</h2>
            {section.blocks.map((block) => (
              <Block
                key={
                  block.kind === 'list'
                    ? block.items[0]
                    : 'title' in block
                      ? block.title
                      : block.text
                }
                block={block}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
          <p className="site-lede">
            Send the styles, quantities and specs you have — a sketch is enough to start. We reply
            within 24 hours.
          </p>
          <div className="site-actions">
            <Link className="btn btn--primary" href="/contact#inquiry">
              {FAMILY_PAGE_ACTION}
            </Link>
          </div>
          <GuideLinks current={guide.path} />
        </div>
      </section>
    </>
  )
}
