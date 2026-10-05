import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import Link from 'next/link'
import type { ProductCard, PublicSiteSettings } from '../../lib/content'
import { FAMILIES, familyPictures } from '../../lib/families'
import { FAMILY_PAGE_ACTION, type FamilyPage, familyHref, familyOf } from '../../lib/familyPages'
import { guideAt } from '../../lib/guides'
import { breadcrumbJsonLd, faqJsonLd, productListJsonLd } from '../../lib/structuredData'
import { FamilyHeroPicture } from './FamilyHeroPicture'
import { GarmentGrid } from './GarmentGrid'
import { JsonLd } from './JsonLd'

/** The guide that tells how an order works, once, for every buyer page (polish S4). */
const ORDER_GUIDE = guideAt('/guides/how-a-private-label-order-works')

/**
 * A buyer page: one product family, written for the words a buyer searches (2026-09-30).
 *
 * Every word comes from `lib/familyPages.ts`, which the owner approved; this file only
 * lays it out. It is built from pieces the site already has (the hero, the garment cards,
 * the numbers, the factory pictures), so it adds one CSS rule and no new look.
 *
 * ⚠️ THE ORDER IS THE ARGUMENT, top to bottom: who we are and the minimum (so a buyer can
 * leave at once if it does not fit), what is made, the garments themselves, how an order
 * works, the questions, the way in. A search engine and a skimming buyer both read the top and
 * sample the rest, so the first paragraph has to be complete on its own.
 *
 * ⚠️ THE ONLY LIST OF ITS FAMILY, AND NOTHING COPIED (polish S1 and S4, the owner's answers Q24 and
 * Q26, 2026-10-04). The garments below are the family's one list: the products page shows every
 * family under a heading that opens this page, and its old filter address forwards here. The page
 * no longer repeats the home page's numbers and factory photos, nor its own five order steps: "how
 * an order works" is one sentence and a link to the order guide, which tells it once for every page.
 *
 * ⚠️ ONE PRIMARY BUTTON PER SCREEN, and the same words both times (`e2e/copy.spec.ts`,
 * CT-08). The second way in is a quiet link.
 *
 * ⚠️ THE QUESTIONS ARE ON THE PAGE AND IN THE DATA FROM ONE LIST. `faqJsonLd` says why a
 * question the page does not show must never be in the data.
 *
 * ⚠️ THE HERO OPENS ON THE FAMILY'S PICTURE (visual audit VA-48, owner's choice 2026-10-02): home and
 * contact open on a factory photo and these four pages opened on plain paper, so they read as less
 * finished than the pages that link to them. The picture is the one the family's home-page card
 * shows (`familyPictures`), drawn by `FamilyHeroPicture`. It sits BESIDE THE LEDE, not behind the
 * headline: the headline is the site's 72px display type, set across the whole column it takes
 * three lines, and in the half-width column a beside-the-headline picture leaves it would take six.
 * No text is ever over the picture, so the headline and lede keep the contrast they have on paper,
 * in both themes. A family with no picture at all (no garment yet, no photo of its own) keeps the
 * hero exactly as it was: the same words, in the same order, with nothing drawn.
 *
 * Renders the page without a garment grid when the family has no card to show (a database
 * wobble returns none): the words still stand, and no empty box is drawn.
 */
export function FamilyLanding({
  page,
  products,
  settings,
}: {
  page: FamilyPage
  products: ProductCard[]
  settings: PublicSiteSettings
}) {
  const family = familyOf(page)
  const garments = products.filter((product) => product.category === family.name)
  const picture = familyPictures(products)[family.slug] ?? null
  const others = FAMILIES.filter(
    (entry) =>
      entry.slug !== family.slug && products.some((product) => product.category === entry.name),
  )

  // The lede and the two buttons: one definition for the hero with a picture and the hero without.
  const words = (
    <>
      <p className="site-lede">{page.lede}</p>
      <div className="site-actions">
        <Link className="btn btn--primary" href="/contact#inquiry">
          {FAMILY_PAGE_ACTION}
        </Link>
        {garments.length > 0 ? (
          <a className="btn btn--ghost" href="#garments">
            Browse in 3D
          </a>
        ) : null}
      </div>
    </>
  )

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(page)} />
      <JsonLd data={faqJsonLd(page.questions)} />
      {garments.length > 0 ? (
        <JsonLd data={productListJsonLd(garments, `RUN APPAREL ${family.name} in 3D`)} />
      ) : null}

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">{page.eyebrow}</p>
          {/* `hero-family`: this headline never swaps fonts mid-visit (site.css, 2026-10-01).
              `display--long`: 45-53 characters, so a phone sets it with more air (base.css, VA-45). */}
          <h1 className="display display--hero display--long hero-family">
            {page.heading} <span className="serif-accent">{page.headingAccent}</span>
          </h1>
          {picture ? (
            <div className="family-hero__body">
              <div>{words}</div>
              <FamilyHeroPicture picture={picture} />
            </div>
          ) : (
            words
          )}
        </div>
      </section>

      {/* The heading on the left and its list on the right from 900px (`.spread`, polish D1). */}
      <section className="site-section" data-site-reveal>
        <div className="site-container prose spread">
          <h2 className="display display--section">{page.makesHeading}</h2>
          <div className="spread__body">
            {page.makes.map((entry) => (
              <div key={entry.group}>
                <h3 className="product-card__name prose__heading">{entry.group}</h3>
                <p>{entry.garments}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {garments.length > 0 ? (
        <section className="site-section" id="garments" data-site-reveal>
          <div className="site-container">
            <div className="section-head">
              <h2 className="display display--section">
                See it before a sample <span className="serif-accent">is&nbsp;cut.</span>
              </h2>
              <p className="site-lede">
                Every garment below has its own 3D page. Turn it, zoom in and check the print, the
                fabric composition, the weight and the fit. Share the link with your team before
                anyone pays for a sample.
              </p>
            </div>
            {/* On the Teamwear page, a button for each sport above the cards (polish S7). */}
            <GarmentGrid family={family} garments={garments} />
          </div>
        </section>
      ) : null}

      {/* How an order works: the order guide's own description, and the way to it (polish S4). */}
      <section className="site-section" data-site-reveal>
        <div className="site-container prose spread">
          <h2 className="display display--section">{page.stepsHeading}</h2>
          <div className="spread__body">
            <p>{ORDER_GUIDE.description}</p>
            <div className="site-actions">
              <Link className="btn btn--ghost" href={ORDER_GUIDE.path}>
                {ORDER_GUIDE.title}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container prose spread">
          <h2 className="display display--section">Questions buyers ask</h2>
          <div className="spread__body">
            {page.questions.map((entry) => (
              <div key={entry.question}>
                <h3 className="product-card__name prose__heading">{entry.question}</h3>
                <p>{entry.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="section-head">
            <h2 className="display display--section">{page.closingHeading}</h2>
            <div className="section-head__words">
              <p className="site-lede">
                Send the styles, quantities and specs you have. A sketch is enough to start. We
                reply within 24 hours, and the quote is free and commits you to nothing.
              </p>
              <div className="site-actions">
                <Link className="btn btn--primary" href="/contact#inquiry">
                  {FAMILY_PAGE_ACTION}
                </Link>
                <a className="btn btn--ghost" href={`mailto:${settings.email}`}>
                  Email {settings.email}
                </a>
                <a
                  className="btn btn--ghost"
                  href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`}
                  rel="noopener"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
          {/* A "see also" group of its own, titled and set apart from the buttons above (polish M4). */}
          <nav className="see-also" aria-labelledby="other-ranges">
            <p className="subhead" id="other-ranges">
              Other ranges
            </p>
            <div className="filter-bar">
              {others.map((entry) => (
                <Link key={entry.slug} className="filter-chip" href={familyHref(entry)}>
                  {entry.name}
                </Link>
              ))}
              <Link className="filter-chip" href="/products">
                Browse in 3D
              </Link>
            </div>
          </nav>
        </div>
      </section>
    </>
  )
}
