import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AboutSection } from '../../components/site/AboutSection'
import { FactsBento } from '../../components/site/FactsBento'
import { FamilyCard } from '../../components/site/FamilyCard'
import { HomeHero } from '../../components/site/HomeHero'
import { JsonLd } from '../../components/site/JsonLd'
import { OrderTimeline } from '../../components/site/OrderTimeline'
import { type ProofProduct, ProofShowcase } from '../../components/site/ProofShowcase'
import { TicketDismiss } from '../../components/site/TicketDismiss'
import { ViewerCue } from '../../components/site/ViewerCue'
import { getProductCards, type ProductCard } from '../../lib/content'
import { getSiteSettings } from '../../lib/content'
import { FAMILIES, familyPictures } from '../../lib/families'
import { familyIsSoon } from '../../lib/familyPages'
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
 *
 * Since polish D2 (2026-10-05) the figure is drawn by `ProofShowcase`, beside the words and their
 * colour dots, which change it; this picks the garment and passes on only what it needs.
 */
function proofProduct(product: ProductCard | null): ProofProduct | null {
  if (!product?.posterUrl) return null
  return {
    slug: product.slug,
    productName: product.productName,
    productCode: product.productCode,
    posterUrl: product.posterUrl,
    posterAlt: product.posterAlt,
    colours: product.colours,
    model: product.model,
  }
}

/** A point's icon: the site's line drawing, 1.6 wide, round ends (the "Drag to turn" hint's). */
function PointIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="proof__point-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
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
          {/* The heading beside its words from 900px (`.section-head`, polish D1). */}
          <div className="section-head">
            <div className="section-head__title">
              <p className="section-number">№02 — What we make</p>
              <h2 className="display display--section">Five families, one&nbsp;standard.</h2>
            </div>
            <p className="site-lede">
              One standard means one factory, one set of hands and one set of tolerances — every
              family below is cut, stitched and finished on the same floor, to the same
              specification, whether it is a hundred pieces or a hundred thousand.
            </p>
          </div>
          {/*
            ⚠️ ITS OWN GRID, NOT THE PRODUCT ONE (FA-E-01): five items in a generic `auto-fill`
            grid never resolve into a shape. The count mirrors the `category` options on
            Products, so the grid treats it as a composition rather than an unknown list.
          */}
          <ul className="family-grid">
            {FAMILIES.map((family) => {
              const count = products.filter((product) => product.category === family.name).length
              return (
                <FamilyCard
                  key={family.slug}
                  family={family}
                  picture={pictures[family.slug] ?? null}
                  soon={familyIsSoon(family, count)}
                  count={count}
                />
              )
            })}
          </ul>
          {/* Escape closes an open card; everything else about the cards is CSS (polish D3). */}
          <TicketDismiss />
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container proof">
          <ProofShowcase
            product={proofProduct(proof)}
            garmentPages={GARMENT_PAGES}
            cue={<ViewerCue />}
            actions={
              <div className="site-actions">
                <Link className="btn btn--primary" href="/products">
                  Browse the references
                </Link>
              </div>
            }
          >
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
            {/*
              The lede's three verbs, each shown (polish D2; new words for the owner's approval at
              the end, written only from what the site already says): the garment here turns under a
              drag ("Drag to turn", LiveGarment.tsx); a garment's 3D page zooms ("Drag to rotate, use
              scroll or pinch to zoom", the viewer's Stage.tsx); each colour has its own address on the
              site (`/products/<garment>/<colour>`, the one a printed QR tag opens).
            */}
            <ul className="proof__points">
              <li className="proof__point">
                <PointIcon>
                  <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3" />
                  <path d="M17.3 3.4v3.3h-3.3M6.7 20.6v-3.3h3.3" />
                </PointIcon>
                <p>
                  <b>Turn it all the way around.</b> Drag the garment to see every side.
                </p>
              </li>
              <li className="proof__point">
                <PointIcon>
                  <circle cx="10.5" cy="10.5" r="6" />
                  <path d="m15 15 5 5M8 10.5h5M10.5 8v5" />
                </PointIcon>
                <p>
                  <b>Zoom into the print.</b> On its 3D page, scroll or pinch to look closer.
                </p>
              </li>
              <li className="proof__point">
                <PointIcon>
                  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                  <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                </PointIcon>
                <p>
                  <b>Share a link.</b> Each color has its own address, to send before a sample is
                  cut.
                </p>
              </li>
            </ul>
          </ProofShowcase>
        </div>
      </section>

      <OrderTimeline />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="section-head">
            <div className="section-head__title">
              <p className="section-number">№05 — The works</p>
              <h2 className="display display--section">
                Numbers you can <span className="serif-accent">hold us&nbsp;to.</span>
              </h2>
            </div>
            <p className="site-lede">
              Confirmed capacity, not marketing. If any of these matters to your program, ask and we
              will put it in writing.
            </p>
          </div>
          <FactsBento worksCoordinates={settings.footer.worksCoordinates} />
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container section-head">
          <div className="section-head__title">
            <p className="section-number">№06 — Talk to us</p>
            <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
          </div>
          <div className="section-head__words">
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
        </div>
      </section>
    </>
  )
}
