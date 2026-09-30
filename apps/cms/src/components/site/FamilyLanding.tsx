import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import Link from 'next/link'
import type { ProductCard, PublicSiteSettings } from '../../lib/content'
import { FACTORY_PHOTOS, factoryPhotoSrc } from '../../lib/factoryPhotos'
import { FAMILIES } from '../../lib/families'
import { FAMILY_PAGE_ACTION, type FamilyPage, familyHref, familyOf } from '../../lib/familyPages'
import { breadcrumbJsonLd, faqJsonLd, productListJsonLd } from '../../lib/structuredData'
import { FactoryFigure } from './FactoryFigure'
import { FactsBento } from './FactsBento'
import { JsonLd } from './JsonLd'
import { ProductCardItem } from './ProductCardItem'

/**
 * A buyer page: one product family, written for the words a buyer searches (2026-09-30).
 *
 * Every word comes from `lib/familyPages.ts`, which the owner approved; this file only
 * lays it out. It is built from pieces the site already has (the hero, the garment cards,
 * the numbers, the factory pictures), so it adds one CSS rule and no new look.
 *
 * ⚠️ THE ORDER IS THE ARGUMENT, top to bottom: who we are and the minimum (so a buyer can
 * leave at once if it does not fit), what is made, the garments themselves, how an order
 * works, the numbers, where it is made, the questions, the way in. A search engine and a
 * skimming buyer both read the top and sample the rest, so the first paragraph has to be
 * complete on its own.
 *
 * ⚠️ ONE PRIMARY BUTTON PER SCREEN, and the same words both times (`e2e/copy.spec.ts`,
 * CT-08). The second way in is a quiet link.
 *
 * ⚠️ THE QUESTIONS ARE ON THE PAGE AND IN THE DATA FROM ONE LIST. `faqJsonLd` says why a
 * question the page does not show must never be in the data.
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
  const photos = page.photos
    .map((slug) => FACTORY_PHOTOS.find((photo) => photo.slug === slug))
    .filter((photo) => photo !== undefined)
  const others = FAMILIES.filter(
    (entry) =>
      entry.slug !== family.slug && products.some((product) => product.category === entry.name),
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
          <h1 className="display display--hero">
            {page.heading} <span className="serif-accent">{page.headingAccent}</span>
          </h1>
          <p className="site-lede">{page.lede}</p>
          <div className="site-actions">
            <Link className="btn btn--primary" href="/contact#inquiry">
              {FAMILY_PAGE_ACTION}
            </Link>
            {garments.length > 0 ? (
              <a className="btn btn--ghost" href="#garments">
                See the garments in 3D
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container prose">
          <h2 className="display display--section">What we make for teams</h2>
          {page.makes.map((entry) => (
            <div key={entry.sport}>
              <h3 className="product-card__name prose__heading">{entry.sport}</h3>
              <p>{entry.garments}</p>
            </div>
          ))}
        </div>
      </section>

      {garments.length > 0 ? (
        <section className="site-section" id="garments" data-site-reveal>
          <div className="site-container">
            <h2 className="display display--section">
              See it before a sample <span className="serif-accent">is&nbsp;cut.</span>
            </h2>
            <p className="site-lede">
              Every garment below has its own 3D page. Turn it, zoom in and check the print, the
              fabric composition, the weight and the fit. Share the link with your team before
              anyone pays for a sample.
            </p>
            <ul className="product-grid">
              {garments.map((product, index) => (
                // `index + 1`: these cards start below the first screen, so none loads eagerly.
                <ProductCardItem
                  key={product.slug}
                  product={product}
                  index={index + 1}
                  heading="h3"
                />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="site-section" data-site-reveal>
        <div className="site-container prose">
          <h2 className="display display--section">How a team order works</h2>
          {page.steps.map((step, index) => (
            <div key={step.title}>
              <h3 className="product-card__name prose__heading">
                {index + 1}. {step.title}
              </h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section">The numbers</h2>
          <p className="site-lede">
            Confirmed capacity. If any of these matters to your program, ask and we will put it in
            writing.
          </p>
          <FactsBento />
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container about">
          <div className="about__copy">
            <h2 className="display display--section">One building, one team answerable</h2>
            <p className="site-lede">
              Your order is cut, printed, stitched, checked and packed inside the DURUS INDUSTRIES
              building in Sialkot, our parent company&rsquo;s. One team answers for it, from the
              first stitch to the sealed bag.
            </p>
          </div>
          <div className="about__photos">
            {photos.map((photo) => (
              <FactoryFigure
                key={photo.slug}
                photo={photo}
                src={factoryPhotoSrc(photo, 640)}
                srcSet={`${factoryPhotoSrc(photo, 640)} 640w, ${factoryPhotoSrc(photo, 1200)} 1200w`}
                sizes="(min-width: 900px) 540px, 100vw"
                width={640}
                height={400}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container prose">
          <h2 className="display display--section">Questions buyers ask</h2>
          {page.questions.map((entry) => (
            <div key={entry.question}>
              <h3 className="product-card__name prose__heading">{entry.question}</h3>
              <p>{entry.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section">Have a team that needs kit?</h2>
          <p className="site-lede">
            Send the styles, quantities and specs you have. A sketch is enough to start. We reply
            within 24 hours, and the quote is free and commits you to nothing.
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
          <nav className="filter-bar" aria-label="Other product families">
            {others.map((entry) => (
              <Link key={entry.slug} className="filter-chip" href={familyHref(entry)}>
                {entry.name}
              </Link>
            ))}
            <Link className="filter-chip" href="/products">
              All products in 3D
            </Link>
          </nav>
        </div>
      </section>
    </>
  )
}
