import { FAQ_INDEX, faqTopicAt, faqTopicForGuide } from '../../lib/faqs'
import { GLOSSARY_INDEX } from '../../lib/glossary'
import Link from 'next/link'
import { FACTORY_PHOTOS, factoryPhotoImage } from '../../lib/factoryPhotos'
import { FAMILIES } from '../../lib/families'
import { FAMILY_PAGE_ACTION, familyPageFor } from '../../lib/familyPages'
import { GUIDES, GUIDES_INDEX, type Guide, type GuideBlock } from '../../lib/guides'
import { guideArticleJsonLd, guideBreadcrumbJsonLd } from '../../lib/structuredData'
import { Byline } from './Byline'
import { FactoryFigure, HALF_COLUMN_SIZES } from './FactoryFigure'
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
export function Block({ block }: { block: GuideBlock }) {
  // The home page's eight cards, not a copy (polish D4, the owner's answer Q41).
  if (block.kind === 'orderSteps') return <OrderSteps />
  if (block.kind === 'table') return <GuideTable block={block} />
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
 * A table of the guide's own words (polish X22): a caption, a header per column (`scope="col"`)
 * and each row's first cell as its header (`scope="row"`), the markup of W3C WAI's "Tables with
 * two headers" (read 2026-10-05), so a screen reader names the method with every cell.
 *
 * ⚠️ TWO COLUMNS OF SHORT WORDS, SO IT STAYS A TABLE ON A 320px PHONE. No `display` is changed on
 * any table part, which is what has stripped a table's meaning in browsers (Safari until 17, per
 * Adrian Roselli's "Tables, CSS Display Properties, and ARIA", updated 7 Oct 2023), and nothing
 * scrolls sideways. A wider table would need the stacked layout instead (web-guidance
 * "responsive-table", index of 4 September 2026).
 */
function GuideTable({ block }: { block: Extract<GuideBlock, { kind: 'table' }> }) {
  return (
    <table className="guide-table">
      <caption className="product-card__name">{block.caption}</caption>
      <thead>
        <tr>
          {block.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map(([head, ...cells]) => (
          <tr key={head}>
            <th scope="row">{head}</th>
            {cells.map((cell) => (
              <td key={cell}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * One of the owner's factory photos under a section's heading (polish X22), in the heading's half
 * of the `.spread` from 900px, which was empty beside the words. That half is `.about`'s half (the
 * same grid and gap, site.css), so the photo asks for `HALF_COLUMN_SIZES`; the files and their
 * widths are `factoryPhotos.ts`'s (`factoryPhotoImage`), as `OrderSteps.tsx` reads them.
 */
function SectionPhoto({ slug }: { slug: string }) {
  const photo = FACTORY_PHOTOS.find((entry) => entry.slug === slug)
  // `guides.test.ts` fails a slug with no photo; drawing nothing is the safe miss in production.
  if (!photo) return null
  // Every width the photo has (polish X16 added larger ones for sharp screens), as №01 asks.
  return <FactoryFigure photo={photo} {...factoryPhotoImage(photo)} sizes={HALF_COLUMN_SIZES} />
}

/** One group of links at the end of a page, under its own heading. */
function LinkGroup({
  id,
  title,
  level,
  links,
}: {
  id: string
  title: string
  level: 'h2' | 'h3'
  links: readonly { href: string; name: string }[]
}) {
  const Heading = level
  return (
    <div className="see-also__group">
      <Heading className="product-card__name" id={id}>
        {title}
      </Heading>
      <ul className="see-also__list">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The other guides and the buyer pages, in two groups, each under its own heading (polish X22).
 *
 * ⚠️ NOT ONE CLOUD OF CHIPS. The audit of 3 October 2026: "links to other guides and to product
 * families sit together in one cloud of 12 small 'filter' chips under the quote button". The chips
 * were `/products`' filter chips, so they also looked like filters. Now each group is a list of
 * plain links, drawn as "On this page" draws its links on the legal pages (44px rows), side by
 * side from 900px. The headings are words the site already uses for the same pages: "Buyer guides"
 * (the guides' own index) and "What we make" (the home page's №02, and the footer's group of the
 * same four pages). Every link that was a chip is still here.
 *
 * ⚠️ STILL A GROUP OF ITS OWN UNDER "More to read" (polish X2, 2026-10-04). Measured 0px between
 * "Get a free quote" and the first chip, on a phone and a computer, and the two rows read as one.
 * The visible title is also the navigation's name (`e2e/composition.spec.ts` reads it).
 *
 * `guides={false}` leaves the guides out: the index shows every guide as a card already, so the
 * same seven as links was the repetition VA-47 removed (2026-10-02). There the one group left is
 * the navigation itself, named by its own `h2` (the cards above it are `h2`s), with no "More to
 * read" over it: four buyer pages are not reading.
 */
export function GuideLinks({ current, guides = true }: { current: string; guides?: boolean }) {
  const buyerPages = FAMILIES.flatMap((family) => {
    const page = familyPageFor(family)
    return page ? [{ href: page.path, name: family.name }] : []
  })
  if (!guides) {
    return (
      <nav className="see-also" aria-labelledby="what-we-make">
        <LinkGroup id="what-we-make" title="What we make" level="h2" links={buyerPages} />
      </nav>
    )
  }
  // The guide's FAQ topic and the glossary (PLAN.md Task 3.4, shown to the owner 2026-10-07).
  const topic = faqTopicForGuide(current)
  const answers = [
    ...(topic ? [{ href: topic, name: faqTopicAt(topic).title }] : []),
    { href: FAQ_INDEX.path, name: 'All questions' },
    { href: GLOSSARY_INDEX.path, name: GLOSSARY_INDEX.title },
  ]
  const otherGuides = [
    ...GUIDES.filter((guide) => guide.path !== current).map((guide) => ({
      href: guide.path,
      name: guide.title,
    })),
    ...(current === GUIDES_INDEX.path ? [] : [{ href: GUIDES_INDEX.path, name: 'All guides' }]),
  ]
  return (
    <nav className="see-also" aria-labelledby="more-to-read">
      <p className="subhead" id="more-to-read">
        More to read
      </p>
      <div className="see-also__groups">
        <LinkGroup id="more-guides" title="Buyer guides" level="h3" links={otherGuides} />
        <LinkGroup id="more-families" title="What we make" level="h3" links={buyerPages} />
        <LinkGroup id="more-answers" title="Answers" level="h3" links={answers} />
      </div>
    </nav>
  )
}

export function GuidePage({ guide }: { guide: Guide }) {
  return (
    <>
      <JsonLd data={guideBreadcrumbJsonLd(guide)} />
      {/* Who wrote it and when its words last changed, as Article data (findability audit,
          2026-10-08); the same facts as the byline under the lede, from `bylines.ts`. */}
      <JsonLd data={guideArticleJsonLd(guide)} />

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
          <Byline path={guide.path} />
        </div>
      </section>

      {/* Each section's heading on the left and its words on the right from 900px (`.spread`,
          polish D1): the words keep their 50ch measure, and the heading fills the half beside them.
          A section with a photo puts it under its heading, in that half (polish X22); on a phone
          it comes between the heading and the words, as the markup has it. */}
      {guide.sections.map((section) => {
        const heading = <h2 className="display display--section">{section.heading}</h2>
        return (
          <section className="site-section" data-site-reveal key={section.heading}>
            <div className="site-container prose prose--guide spread">
              {section.photo ? (
                <div className="spread__head">
                  {heading}
                  <SectionPhoto slug={section.photo} />
                </div>
              ) : (
                heading
              )}
              <div className="spread__body">
                {section.blocks.map((block) => (
                  <Block
                    key={
                      block.kind === 'orderSteps'
                        ? 'order-steps'
                        : block.kind === 'table'
                          ? block.caption
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
        )
      })}

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
