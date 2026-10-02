import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AboutSection } from '../../components/site/AboutSection'
import { FactsBento } from '../../components/site/FactsBento'
import { FamilyCard } from '../../components/site/FamilyCard'
import { HomeHero } from '../../components/site/HomeHero'
import { JsonLd } from '../../components/site/JsonLd'
import { LiveGarment } from '../../components/site/LiveGarment'
import { OrderTimeline } from '../../components/site/OrderTimeline'
import { ProductPoster } from '../../components/site/ProductPoster'
import { ViewerCue } from '../../components/site/ViewerCue'
import { getProductCards, type ProductCard } from '../../lib/content'
import { getSiteSettings } from '../../lib/content'
import { FAMILIES, familyPictures } from '../../lib/families'
import { HOME_DESCRIPTION } from '../../lib/pageDescriptions'
import { buildMetadata, GARMENT_PAGES } from '../../lib/seo'
import { websiteJsonLd } from '../../lib/structuredData'

/**
 * ⚠️ `force-dynamic` IS NOT OPTIONAL. `resolveCloudflareEnv()` returns null during
 * `next build` — no D1 binding exists in the build phase — so any attempt to
 * pre-render this page reads an absent database. The content helpers also swallow the
 * throw, but that only converts a crash into a blank page; this is what stops the
 * attempt happening at all.
 */
export const dynamic = 'force-dynamic'

const TITLE = 'RUN APPAREL — Custom B2B Sportswear & Team Wear Manufacturer'

export const metadata: Metadata = {
  ...buildMetadata({ title: TITLE, description: HOME_DESCRIPTION, path: '/' }),
  // The template in layout.tsx would render "RUN APPAREL — … — RUN APPAREL".
  title: { absolute: TITLE },
}

/**
 * One real garment, standing still, on the page that sells 3D (audit FA-A-04).
 *
 * ⚠️ THE PAGE ARGUED FOR 3D AND SHOWED NONE OF IT. Section №02 was four lines of prose
 * and a link — a manufacturer's site claiming a differentiator with nothing to look at,
 * which is the one section where a picture is the argument rather than decoration.
 *
 * ⚠️ SINCE 2026-09-29 THE STILL IS THE FALLBACK, NOT THE WHOLE STORY (decision D24): the owner
 * chose "live 3D on scroll", so `LiveGarment` lays the real model over this picture once the
 * section nears the screen. What follows is why the picture is still what the server sends.
 *
 * ⚠️ A STILL, NOT A LIVE MODEL — owner's decision 2026-09-07. `<model-viewer>` on the
 * home page would put a WebGL renderer and a multi-megabyte GLB on the first screen a
 * buyer ever loads: the live garment is 3.9 MB and the viewer measured its own page at
 * 4.37 s to a picture. A 40 KB poster says the same thing at 1% of the weight, and the
 * real thing is one click away.
 *
 * ⚠️ IT IS A REAL PRODUCT, READ FROM THE CMS, AND THAT IS THE POINT. A hardcoded file
 * would go stale the first time a garment was retired and nothing would say so — the
 * same failure the gallery avoids by sharing `isAddressableColourway`. This picks the
 * first published product that HAS a poster, which is the same ordering the gallery
 * shows, so the home page can never advertise a garment the gallery does not carry.
 *
 * ⚠️ FIXED DIMENSIONS, AND THE ASPECT BOX IS WHY. `.proof__figure` carries the same
 * `aspect-ratio: 4 / 5` the gallery cards use and `ProductPoster` ships explicit
 * width/height, so the space is reserved before a byte of image arrives. The home page
 * failed Cumulative Layout Shift in this audit (FA-L-51); adding an unsized image here
 * would have re-opened it in the same commit that closed it.
 *
 * Renders NOTHING when there is no product or no poster. An empty band is honest; a
 * broken image on the home page is not, and `ProductPoster` already carries the two
 * layers that handle a poster which exists and fails.
 *
 * ⚠️ THE CAPTION NAMES THE GARMENT; `<ViewerCue />` SAYS WHERE THE LINK GOES (XS-09,
 * 2026-09-17). The caption used to end "— open the 3D reference", which the owner's
 * approved line now says in their words, so the tail went rather than saying it twice.
 */
function ProofGarment({ product }: { product: ProductCard | null }) {
  if (!product?.posterUrl) return null
  const href = `${GARMENT_PAGES}/${product.slug}/${product.defaultColourSlug}`
  return (
    <figure className="proof__figure">
      <a className="proof__link" href={href}>
        <span className="proof__frame">
          <ProductPoster src={product.posterUrl} alt={product.posterAlt} />
        </span>
        <figcaption className="proof__caption">
          {product.productCode} {product.productName}
        </figcaption>
        <ViewerCue />
      </a>
      {/*
        The live garment sits OVER the picture and OUTSIDE the link, so turning it never
        navigates; the caption and cue below still open the full viewer (LiveGarment.tsx).
      */}
      {product.model ? (
        <LiveGarment
          model={product.model}
          label={`${product.productCode} ${product.productName}`}
        />
      ) : null}
    </figure>
  )
}

export default async function HomePage() {
  /*
   * Two reads, in parallel. `getProductCards` is the same 60-second in-process cache the
   * gallery uses (`lib/content.ts`), so the home page adds no D1 round trip of its own
   * once either page has been served, and both helpers degrade to a safe default rather
   * than throwing — a database wobble costs this section, not the page.
   */
  const [settings, products] = await Promise.all([getSiteSettings(), getProductCards()])
  const proof = products.find((product) => product.posterUrl) ?? null
  const pictures = familyPictures(products)
  return (
    <>
      <JsonLd data={websiteJsonLd(settings)} />
      <HomeHero />

      {/*
        ⚠️ THE ORDER IS DECISION D23 (owner, 2026-09-29), WHICH AMENDS D6: who we are → what we
        make → the 3D → how an order works → the numbers → talk to us. D6's point survives —
        credibility still comes before capability — and `e2e/composition.spec.ts` (LA-01) pins
        the №01–№06 order so the next reorder is a decision, not a drift.

        ⚠️ A SEVENTH SECTION, "INSIDE THE FACTORY", SAT BETWEEN THE NUMBERS AND TALK TO US UNTIL
        2026-10-02. The owner removed it (visual audit VA-29 with VA-34, their choice): its ten
        photos repeated the eight in №04 and the two in №01, so every room it showed was already
        pictured, and the closing section took its number (№06) so the sequence has no gap.

        ⚠️ `№` ALONE — NOT `N°` AND NOT `N№` (FA-Q-08, FA-Q-51). The numero sign already means
        "number"; measured present in `--font-mono` at the same advance as "0" and "N". Two
        digits, because there are six sections and `006` implies a scale that does not exist.
      */}
      <AboutSection />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="section-number">№02 — What we make</p>
          <h2 className="display display--section">Five families, one&nbsp;standard.</h2>
          <p className="site-lede">
            One standard means one factory, one set of hands and one set of tolerances — every
            family below is cut, stitched and finished on the same floor, to the same specification,
            whether it is a hundred pieces or a hundred thousand.
          </p>
          {/*
            ⚠️ ITS OWN GRID, NOT THE PRODUCT ONE (FA-E-01): five items in a generic `auto-fill`
            grid never resolve into a shape. The count mirrors the `category` options on
            Products, so the grid treats it as a composition rather than an unknown list.
          */}
          <ul className="family-grid">
            {FAMILIES.map((family) => (
              <FamilyCard
                key={family.slug}
                family={family}
                picture={pictures[family.slug] ?? null}
              />
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container proof">
          <div className="proof__copy">
            <p className="section-number">№03 — See it before it exists</p>
            <h2 className="display display--section">
              Every reference, <span className="serif-accent">in&nbsp;3D.</span>
            </h2>
            {/*
              ⚠️ "ON REQUEST", AND THAT IS THE OWNER'S CORRECTION OF 2026-09-29. This said "Each
              garment we develop gets a 3D reference"; the owner confirmed that day a 3D
              reference is NOT part of every order, and chose this wording.
            */}
            <p className="site-lede">
              We can build a 3D reference of your garment on request — turn it, inspect the print
              and share it before a sample is cut.
            </p>
            <div className="site-actions">
              <Link className="btn btn--primary" href="/products">
                Browse the references
              </Link>
            </div>
          </div>
          <ProofGarment product={proof} />
        </div>
      </section>

      <OrderTimeline />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="section-number">№05 — The works</p>
          <h2 className="display display--section">
            Numbers you can <span className="serif-accent">hold us&nbsp;to.</span>
          </h2>
          <p className="site-lede">
            Confirmed capacity, not marketing. If any of these matters to your program, ask and we
            will put it in writing.
          </p>
          <FactsBento />
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="section-number">№06 — Talk to us</p>
          <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
          <p className="site-lede">
            Send the styles, quantities and specs you have — a sketch is enough to start. We reply
            within 24 hours.
          </p>
          <div className="site-actions">
            <Link className="btn btn--primary" href="/contact#inquiry">
              Start a conversation
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
      </section>
    </>
  )
}
