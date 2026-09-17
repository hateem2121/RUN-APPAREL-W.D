import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '../../components/site/JsonLd'
import { ProductPoster } from '../../components/site/ProductPoster'
import { ViewerCue } from '../../components/site/ViewerCue'
import { CERTIFICATION, FACTS, SHIPS_TO } from '../../lib/companyFacts'
import { getProductCards, type ProductCard } from '../../lib/content'
import { getSiteSettings } from '../../lib/content'
import { FAMILIES } from '../../lib/families'
import { HOME_DESCRIPTION } from '../../lib/pageDescriptions'
import { buildMetadata, VIEWER_ORIGIN } from '../../lib/seo'
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
  const href = `${VIEWER_ORIGIN}/${product.slug}/${product.defaultColourSlug}`
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
  return (
    <>
      <JsonLd data={websiteJsonLd(settings)} />
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">
            [ PRIVATE LABEL MANUFACTURER · SIALKOT, PK · FAMILY TRADE SINCE 1889 ]
          </p>
          <h1 className="display display--hero">
            Made to order. <span className="serif-accent">Made&nbsp;properly.</span>
          </h1>
          <p className="site-lede">
            RUN APPAREL is a private label manufacturer in Sialkot — team wear, active wear, casual
            wear, outerwear and sports accessories, made to order for the brands, teams and
            organizations that never look back.
          </p>
          <div className="site-actions">
            <Link className="btn btn--primary" href="/contact">
              Start a conversation
            </Link>
            <Link className="btn btn--ghost" href="/products">
              See the 3D references
            </Link>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          {/*
        ⚠️ `№` ALONE — NOT `N°` AND NOT `N№`. The numero sign already means "number", so a
        letter N in front of it reads as "N-number-01". Both surfaces got this wrong in
        different ways until 2026-09-07 (audit FA-Q-08, FA-Q-51): the site wrote `N` plus
        U+00B0 DEGREE SIGN, which means degrees of temperature or angle, and the viewer
        wrote `N` plus U+2116, doubling the abbreviation.

        Measured before choosing, because the audit's evidence warned that U+2116 has
        patchy coverage in system monospace stacks and might be substituted from a
        fallback face: in `--font-mono` at 40px, "0", "N", `№`, `°` and `º` all advance
        24.09px — the numero sign is present in the face and is not substituted. The
        control is that "0" and "N" agree, which is what proves the face is monospaced at
        all; the first version of that probe put quoted family names inside an HTML
        `style` attribute, terminated it early, and measured a proportional font.

        Two digits, not three, on both surfaces: there are four sections here and three
        there, and `003` implies a scale that does not exist.
      */}
          <p className="section-number">№01 — What we make</p>
          <h2 className="display display--section">Five families, one&nbsp;standard.</h2>
          <p className="site-lede">
            One standard means one factory, one set of hands and one set of tolerances — every
            family below is cut, stitched and finished on the same floor, to the same specification,
            whether it is a hundred pieces or a hundred thousand.
          </p>
          {/*
            ⚠️ ITS OWN GRID, NOT THE PRODUCT ONE. Five items in a generic `auto-fill` grid
            never resolve into a shape — at 768 the fifth card sat alone under a pair, and
            from 1024 up the last row was two cards and a hole, at every width (FA-E-01).
            The count here is fixed and mirrors the `category` options on Products, so the
            grid can treat it as a composition rather than as an unknown list.
          */}
          <ul className="family-grid">
            {FAMILIES.map((family) => (
              <li className="panel family-card" key={family.name}>
                {/*
                  ⚠️ THE WHOLE CARD IS THE LINK. These five described a family and then went
                  nowhere — a card that looks like a control and is not one (FA-I-02). They
                  now open the gallery already filtered to that family, which is the page a
                  reader of this card wants next and which did not exist until 2026-09-07.
                */}
                <Link className="family-card__link" href={`/products?family=${family.slug}`}>
                  <h3 className="product-card__name">{family.name}</h3>
                  <p className="product-card__desc">{family.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container proof">
          <div className="proof__copy">
            <p className="section-number">№02 — See it before it exists</p>
            <h2 className="display display--section">
              Every reference, <span className="serif-accent">in&nbsp;3D.</span>
            </h2>
            <p className="site-lede">
              Each garment we develop gets a 3D reference you can turn, inspect and share — the same
              model our QR tags open. No sample shipped, no guesswork about how a print sits.
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

      {/*
        ⚠️ AFTER THE 3D PITCH, NOT BEFORE IT. The owner decided on 2026-09-07 that the
        introduction leads and the 3D section keeps its place (FA-I-18,
        docs/DECISIONS-BETA-WEBSITE.md D6), so this is inserted below rather than above —
        adding proof must not quietly reorder a section whose position was just settled.
      */}
      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="section-number">№03 — The works</p>
          <h2 className="display display--section">
            Numbers you can <span className="serif-accent">hold us&nbsp;to.</span>
          </h2>
          <p className="site-lede">
            Confirmed capacity, not marketing. If any of these matters to your program, ask and we
            will put it in writing.
          </p>
          <dl className="facts-grid">
            {FACTS.map((fact) => (
              <div className="fact" key={fact.label}>
                <dt className="fact__value display display--section">{fact.value}</dt>
                <dd className="fact__label">{fact.label}</dd>
              </div>
            ))}
          </dl>
          <div className="facts-notes">
            <div>
              <p className="field-label">Where we ship</p>
              <p className="fact__note">{SHIPS_TO}</p>
            </div>
            <div>
              <p className="field-label">Certification</p>
              <p className="fact__note">{CERTIFICATION}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="section-number">№04 — Talk to us</p>
          <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
          <p className="site-lede">
            Send the styles, quantities and specs you have — a sketch is enough to start. We reply
            within 2 business days.
          </p>
          <div className="site-actions">
            <a className="btn btn--primary" href={`mailto:${settings.email}`}>
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
