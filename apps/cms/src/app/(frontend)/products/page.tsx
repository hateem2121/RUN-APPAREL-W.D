import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '../../../components/site/JsonLd'
import { ProductPoster } from '../../../components/site/ProductPoster'
import { getProductCards, type ProductCard } from '../../../lib/content'
import { FAMILIES, familyBySlug } from '../../../lib/families'
import { buildMetadata, SITE_ORIGIN, VIEWER_ORIGIN } from '../../../lib/seo'
import { productListJsonLd } from '../../../lib/structuredData'

export const dynamic = 'force-dynamic'

const DESCRIPTION =
  'Every RUN APPAREL garment with a 3D reference — turn it, inspect the construction and see the print before a sample ships. Team wear, active wear, casual wear, outerwear and accessories.'

/**
 * ⚠️ THE CANONICAL IS ALWAYS `/products`, WHATEVER THE FILTER SAYS.
 *
 * A filter is a way of looking at one page, not six pages. `?family=outerwear` shows a
 * subset of the same garments under a URL a visitor can share, and pointing its canonical
 * at itself would offer a search engine six near-duplicate pages competing with each
 * other — with the unfiltered one, the only page carrying every garment, the likeliest to
 * lose. `buildMetadata` is given the bare path for exactly that reason.
 *
 * The TITLE follows the filter, because that is what a shared link should say in a tab.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const family = familyBySlug((await searchParams).family)
  return buildMetadata({
    title: family ? `${family.name} — 3D references` : 'Products',
    description: family ? `${family.name} from RUN APPAREL. ${DESCRIPTION}` : DESCRIPTION,
    path: '/products',
  })
}

type PageProps = { searchParams: Promise<{ family?: string }> }

/**
 * The public product gallery.
 *
 * ⚠️ CARDS LINK OUT TO THE VIEWER, on its own host. The 3D reference is a separate
 * Worker reached from printed QR tags, and those URLs must not change. Linking to
 * `/{slug}/{colour}` on THIS host would 404 — nothing here serves that shape.
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
  const absolute = products.find((product) => product.posterUrl?.startsWith('http'))?.posterUrl
  if (!absolute) return null
  try {
    const { origin } = new URL(absolute)
    return origin === SITE_ORIGIN ? null : origin
  } catch {
    return null
  }
}

/**
 * ⚠️ FILTERED ON THE SERVER, AND THE UNFILTERED PAGE STILL CARRIES EVERY GARMENT.
 *
 * Owner decision 2026-09-07 (FA-I-08, docs/DECISIONS-BETA-WEBSITE.md D1): filters rather
 * than pagination or a "load more". At 11 products one ungated list was right; at 67 the
 * page measured 45.8 phone screens, so a buyer looking for one jacket scrolled past 66
 * other things.
 *
 * Filters were chosen over pagination precisely so that `/products` keeps all 67 garments
 * in one document — a crawler sees the whole catalogue at one URL, and the page still
 * works with scripting off, because each chip is an ordinary link to an ordinary server
 * -rendered page. There is no client component here and nothing to hydrate.
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const family = familyBySlug((await searchParams).family)
  const all = await getProductCards()
  const products = family ? all.filter((product) => product.category === family.name) : all
  const posterHost = crossOriginPosterHost(products)
  const counts = new Map<string, number>()
  for (const product of all) {
    if (product.category) counts.set(product.category, (counts.get(product.category) ?? 0) + 1)
  }

  return (
    <>
      {/* No `crossOrigin` attribute: these are plain <img> requests, which use a
          non-CORS connection. A preconnect in CORS mode would open a SECOND connection
          the images never use, making it slower rather than faster. */}
      {posterHost ? <link rel="preconnect" href={posterHost} /> : null}
      {products.length > 0 ? <JsonLd data={productListJsonLd(products)} /> : null}
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ 3D PRODUCT REFERENCES ]</p>
          <h1 className="display display--hero">
            Every garment, <span className="serif-accent">turnable.</span>
          </h1>
          <p className="site-lede">
            These are development references, not a shop. Open one to turn the garment, inspect the
            construction and see exactly how the artwork sits before a sample is ever cut.
          </p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          {/*
            A <nav> of plain links, not a listbox or a set of buttons. Every chip is a real
            URL that can be shared, bookmarked, opened in a new tab and reached with
            scripting off, and `aria-current="page"` is what tells a screen reader which
            view is showing — the same mechanism the header nav uses.
          */}
          <nav className="filter-bar" aria-label="Filter by product family">
            <Link
              className="filter-chip"
              href="/products"
              aria-current={family ? undefined : 'page'}
            >
              All<span className="filter-chip__count">{all.length}</span>
            </Link>
            {FAMILIES.map((entry) => (
              <Link
                key={entry.slug}
                className="filter-chip"
                href={`/products?family=${entry.slug}`}
                aria-current={family?.slug === entry.slug ? 'page' : undefined}
                data-empty={(counts.get(entry.name) ?? 0) === 0 ? 'true' : undefined}
              >
                {entry.name}
                <span className="filter-chip__count">{counts.get(entry.name) ?? 0}</span>
              </Link>
            ))}
          </nav>

          {products.length === 0 ? (
            /*
              Two different empty states, because they mean two different things and the
              old single message would have been a lie in the filtered case — nothing is
              "being updated" when the catalogue is fine and this family is simply empty.
            */
            <p className="site-empty">
              {family
                ? `No 3D references in ${family.name} yet — the garments exist, the references are still being built. Email us and we will send what we have.`
                : 'The references are being updated. Email us and we will send the current set directly.'}
            </p>
          ) : (
            <>
              <p className="section-number">
                {products.length} reference{products.length === 1 ? '' : 's'}
                {family ? ` in ${family.name}` : ''}
              </p>
              <ul className="product-grid">
                {products.map((product) => (
                  <Card key={product.slug} product={product} />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  )
}

function Card({ product }: { product: ProductCard }) {
  const href = `${VIEWER_ORIGIN}/${product.slug}/${product.defaultColourSlug}`
  const colours = product.colourNames.length

  return (
    <li className="product-card">
      <a className="product-card__link" href={href}>
        <figure className="product-card__figure">
          {product.posterUrl ? (
            <ProductPoster src={product.posterUrl} alt={product.posterAlt} />
          ) : (
            <span className="product-card__placeholder">[ 3D reference ]</span>
          )}
        </figure>
        <div className="product-card__body">
          <h2 className="product-card__name">{product.productName}</h2>
          <p className="product-card__meta">
            <span>{product.productCode}</span>
            {product.category ? <span>· {product.category}</span> : null}
            <span>
              · {colours} colour{colours === 1 ? '' : 's'}
            </span>
          </p>
          {product.shortDescription ? (
            <p className="product-card__desc">{product.shortDescription}</p>
          ) : null}
        </div>
      </a>
    </li>
  )
}
