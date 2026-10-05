import Link from 'next/link'
import { FAMILIES } from '../../lib/families'
import { FAMILY_PAGE_ACTION, familyPageFor } from '../../lib/familyPages'
import { GUIDES, GUIDES_INDEX, type Guide, type GuideBlock } from '../../lib/guides'
import { guideBreadcrumbJsonLd } from '../../lib/structuredData'
import { JsonLd } from './JsonLd'
import { OrderSteps } from './OrderSteps'

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
  // The home page's eight cards, not a copy (polish D4, the owner's answer Q41).
  if (block.kind === 'orderSteps') return <OrderSteps />
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
 *
 * ⚠️ A GROUP OF ITS OWN, WITH A TITLE (polish X2, 2026-10-04). Measured 0px between "Get a free
 * quote" and the first chip, on a phone and a computer, and the two rows read as one. The visible
 * title is also the navigation's name, so `e2e/pages.spec.ts` still finds it as "More to read".
 */
export function GuideLinks({ current, guides = true }: { current: string; guides?: boolean }) {
  const buyerPages = FAMILIES.map((family) => ({ family, page: familyPageFor(family) }))
  return (
    <nav className="see-also" aria-labelledby="more-to-read">
      <p className="subhead" id="more-to-read">
        More to read
      </p>
      <div className="filter-bar filter-bar--titles">
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
      </div>
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

      {/* Each section's heading on the left and its words on the right from 900px (`.spread`,
          polish D1): the words keep their 50ch measure, and the heading fills the half beside them. */}
      {guide.sections.map((section) => (
        <section className="site-section" data-site-reveal key={section.heading}>
          <div className="site-container prose prose--guide spread">
            <h2 className="display display--section">{section.heading}</h2>
            <div className="spread__body">
              {section.blocks.map((block) => (
                <Block
                  key={
                    block.kind === 'orderSteps'
                      ? 'order-steps'
                      : block.kind === 'list'
                        ? block.items[0]
                        : 'title' in block
                          ? block.title
                          : block.text
                  }
                  block={block}
                />
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="section-head">
            <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
            <div className="section-head__words">
              <p className="site-lede">
                Send the styles, quantities and specs you have — a sketch is enough to start. We
                reply within 24 hours.
              </p>
              <div className="site-actions">
                <Link className="btn btn--primary" href="/contact#inquiry">
                  {FAMILY_PAGE_ACTION}
                </Link>
              </div>
            </div>
          </div>
          <GuideLinks current={guide.path} />
        </div>
      </section>
    </>
  )
}
