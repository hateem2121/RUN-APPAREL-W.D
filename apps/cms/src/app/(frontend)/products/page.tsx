import type { Metadata } from 'next'
import Link from 'next/link'
import { permanentRedirect } from 'next/navigation'
import { JsonLd } from '../../../components/site/JsonLd'
import { ProductCardItem } from '../../../components/site/ProductCardItem'
import { ProductsFilmHero } from '../../../components/site/ProductsFilm'
import { getProductCards, type ProductCard } from '../../../lib/content'
import { FAMILIES } from '../../../lib/families'
import {
  FAMILY_SOON,
  familyFilterForward,
  familyIsSoon,
  familyPageFor,
} from '../../../lib/familyPages'
import { PRODUCTS_DESCRIPTION } from '../../../lib/pageDescriptions'
import { buildMetadata } from '../../../lib/seo'
import { preconnectHost } from '../../../lib/posterHost'
import { productListJsonLd } from '../../../lib/structuredData'

export const dynamic = 'force-dynamic'

/**
 * The products page's title, in the owner's own words (2026-09-30). It was "Products", which
 * told a search engine nothing; measured that day, all ten pages ranking for "custom
 * sportswear manufacturer" lead their title with what they sell.
 *
 * ⚠️ SHORTENED TO FIT (polish F18, 2026-10-04): the owner's words were 56 characters, 71 with the
 * " — RUN APPAREL" the layout adds, and Google cut them to "…RUN APPA…". These keep the owner's
 * words and say "Sportswear", the word buyers search ("custom sportswear manufacturer", the
 * 2026-09-30 study): 44 characters, 58 in all, inside the ~60 a result shows. On the owner's
 * end-of-build list of new words; e2e/findability.spec.ts holds the length.
 */
const PRODUCTS_TITLE = 'Private Label Sportswear & Casual Wear in 3D'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: PRODUCTS_TITLE,
    description: PRODUCTS_DESCRIPTION,
    path: '/products',
  })
}

type PageProps = { searchParams: Promise<{ family?: string | string[] }> }

/**
 * The public product gallery.
 *
 * ⚠️ CARDS LINK OUT TO THE VIEWER, on its own host. The 3D reference is a separate
 * Worker reached from printed QR tags, and those URLs must not change. Linking to
 * `/{slug}/{colour}` on THIS host would 404 — nothing here serves that shape. Each card
 * says so in words, with the owner's caption (XS-09, `components/site/ViewerCue.tsx`).
 *
 * ⚠️ THE LIST IS FILTERED BY THE SAME RULE THE DETAIL PAGE USES. `getProductCards`
 * shares `isAddressableColourway` with `buildViewerResponse`; without that, a card
 * could advertise a garment whose viewer URL 404s, and both sides would stay green.
 */
/**
 * The origin the posters will actually be fetched from, when it is not this one.
 *
 * ⚠️ IN PRODUCTION EVERY POSTER COMES FROM A DIFFERENT HOST — media.wear-run.help — so
 * the first one pays a full DNS lookup, TCP handshake and TLS negotiation before a
 * single byte of image arrives. A `preconnect` gets that out of the way while the HTML
 * is still being parsed. It costs no bandwidth, which is exactly why it is here and why
 * preloading the FONTS is not: measured 2026-09-05 over a throttled connection,
 * preloading 110 KB of fonts delayed first paint by 68 ms because it competed with the
 * stylesheet for the pipe, while delivering the fonts no sooner.
 *
 * Derived from the URLs about to be rendered rather than from the environment variable,
 * so it cannot advertise an origin this page does not use.
 *
 * ⚠️ VERIFIED AGAINST PRODUCTION, BECAUSE NO LOCAL RUNTIME CAN SHOW IT. Under `next dev`,
 * `next start` AND `opennextjs-cloudflare preview` — workerd with real bindings — Payload
 * emits relative `/api/media/file/…` URLs, so this correctly returns null and nothing is
 * rendered. That is indistinguishable from a hint that never fires, which would make it
 * the same dead-code defect as the `aria-current` rule this audit found.
 *
 * So it was checked where it matters: `GET cms.wear-run.help/api/public/viewer/rxps/wine`
 * returns `https://media.wear-run.help/rxps-wine-poster.webp`. The hint fires in
 * production and stays silent everywhere else, which is exactly the intended behaviour.
 */
function crossOriginPosterHost(products: ProductCard[]): string | null {
  // Each card draws its first colour's picture (render, else poster), else the product poster.
  // Since 2026-09-29 a media.wear-run.com picture is resized on THIS page's address, so no hint
  // is emitted for it — `lib/posterHost.ts`.
  return preconnectHost(
    products.map((product) => product.colours[0]?.image?.url ?? product.posterUrl),
  )
}

/**
 * ⚠️ EVERY GARMENT ON ONE PAGE, UNDER ITS FAMILY'S HEADING (polish S2, the owner's answer Q25,
 * 2026-10-04).
 *
 * Owner decision 2026-09-07 (FA-I-08, docs/DECISIONS-BETA-WEBSITE.md D1): no pagination and no
 * "load more", so that `/products` keeps every garment in one document — a crawler sees the whole
 * catalogue at one URL, and the page works with scripting off. That reason holds. What changed is
 * the family filter: `?family=outerwear` showed a family's garments under a second address, beside
 * the family's own page that listed them too, so a family had two lists (Q24). The family's page
 * is the only list of its garments now (D27); this page shows every family under a heading that
 * opens that page, and the filter's addresses forward there (`familyFilterForward`).
 *
 * ⚠️ THE CHIPS JUMP, THEY DO NOT FILTER (polish S8, Q28): each is an ordinary link to its family's
 * group on this page (`#outerwear`), so it works with scripting off, lands below the bar
 * (`html { scroll-padding-top }`, site.css) and changes no address a search engine could keep.
 * Nothing here is a client component; the one on a card is `CardGallery`, for its colour dots.
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  // An old filter address forwards, permanently, to where its family is listed now (polish S3).
  // Next sends 308 for a permanent redirect; Google treats 308 as it treats 301 (Search Central,
  // "Redirects and Google Search", updated 14 April 2026).
  const { family } = await searchParams
  if (family !== undefined) {
    permanentRedirect(familyFilterForward(Array.isArray(family) ? family[0] : family))
  }

  const all = await getProductCards()
  // Numbered across the groups, so the page's first card is the one picture that loads first
  // (`ProductCardItem`'s `index`).
  let first = 0
  const groups = FAMILIES.map((entry) => {
    const products = all.filter((product) => product.category === entry.name)
    const start = first
    first += products.length
    const soon = familyIsSoon(entry, products.length)
    return { family: entry, page: familyPageFor(entry), products, soon, start }
  })
  // A garment whose category names no family still stands on the page (D1): after the groups.
  const named = new Set(FAMILIES.map((entry) => entry.name))
  const unnamed = all.filter((product) => !named.has(product.category))
  const posterHost = crossOriginPosterHost(all)

  return (
    <>
      {/* No `crossOrigin` attribute: these are plain <img> requests, which use a
          non-CORS connection. A preconnect in CORS mode would open a SECOND connection
          the images never use, making it slower rather than faster. */}
      {posterHost ? <link rel="preconnect" href={posterHost} /> : null}
      {all.length > 0 ? <JsonLd data={productListJsonLd(all)} /> : null}
      {/* The hoodie film plays behind these words (owner, 2026-10-01); the words stay the server's. */}
      <ProductsFilmHero>
        <p className="label">[ 3D product references ]</p>
        <h1 className="display display--hero hero-products">
          Every garment, <span className="serif-accent">turnable.</span>
        </h1>
        <p className="site-lede">
          These are development references, not a shop. Open one to turn the garment, inspect the
          construction and see exactly how the artwork sits before a sample is ever cut.
        </p>
      </ProductsFilmHero>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          {all.length === 0 ? (
            // No garment at all is one fact, said once: the catalogue, not five families, is empty.
            <p className="site-empty">
              The references are being updated. Email us and we will send the current set directly.
            </p>
          ) : (
            <>
              {/*
                A <nav> of plain links to the groups below. On a phone it is ONE ROW THAT SCROLLS
                SIDEWAYS (`filter-bar--scroll`, visual audit VA-42): three wrapped rows had filled
                172px of the first screen. Tab still walks every chip and the browser scrolls each
                one into view, so it needs no script. A family with no garment yet keeps its chip,
                dashed, with its count of 0 (D17).
              */}
              <nav
                className="filter-bar filter-bar--scroll"
                aria-label="Product families on this page"
              >
                {groups.map(({ family: entry, products }) => (
                  <a
                    key={entry.slug}
                    className="filter-chip"
                    href={`#${entry.slug}`}
                    data-empty={products.length === 0 ? 'true' : undefined}
                  >
                    {entry.name}
                    <span className="filter-chip__count">{products.length}</span>
                  </a>
                ))}
              </nav>

              {groups.map(({ family: entry, page, products, soon, start }) => (
                <section
                  key={entry.slug}
                  id={entry.slug}
                  className="gallery-group"
                  aria-labelledby={`${entry.slug}-heading`}
                >
                  <div className="gallery-group__head">
                    {/* The heading opens the family's own page, its only list (Q25). */}
                    <h2
                      id={`${entry.slug}-heading`}
                      className="display display--section gallery-group__title"
                    >
                      {page ? (
                        <Link className="gallery-group__link" href={page.path}>
                          {entry.name}
                          {/* The no-break space keeps the arrow beside the last word. */}
                          <span aria-hidden="true">&nbsp;&rarr;</span>
                        </Link>
                      ) : (
                        entry.name
                      )}
                    </h2>
                    {soon ? (
                      // No page and no garments yet: the owner's words for this family (Q21).
                      <p className="gallery-group__soon">
                        <span className="label">{FAMILY_SOON.label}</span>
                        <Link className="gallery-group__ask" href={FAMILY_SOON.href}>
                          {FAMILY_SOON.ask}
                          <span aria-hidden="true">&rarr;</span>
                        </Link>
                      </p>
                    ) : (
                      <p className="result-count">
                        {products.length} reference{products.length === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                  {products.length > 0 ? (
                    <ul className="product-grid">
                      {products.map((product, index) => (
                        <ProductCardItem
                          key={product.slug}
                          product={product}
                          index={start + index}
                          heading="h3"
                        />
                      ))}
                    </ul>
                  ) : page ? (
                    <p className="site-empty">
                      No 3D references in {entry.name} yet — the garments exist, the references are
                      still being built. Email us and we will send what we have.
                    </p>
                  ) : null}
                </section>
              ))}

              {unnamed.length > 0 ? (
                <ul className="product-grid">
                  {unnamed.map((product, index) => (
                    <ProductCardItem
                      key={product.slug}
                      product={product}
                      index={first + index}
                      heading="h3"
                    />
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  )
}
