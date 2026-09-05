import type { Metadata } from 'next'
import { JsonLd } from '../../../components/site/JsonLd'
import { ProductPoster } from '../../../components/site/ProductPoster'
import { getProductCards, type ProductCard } from '../../../lib/content'
import { buildMetadata, SITE_ORIGIN, VIEWER_ORIGIN } from '../../../lib/seo'
import { productListJsonLd } from '../../../lib/structuredData'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Products',
  description:
    'Every RUN APPAREL garment with a 3D reference — turn it, inspect the construction and see the print before a sample ships. Team wear, active wear, casual wear, outerwear and accessories.',
  path: '/products',
})

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

export default async function ProductsPage() {
  const products = await getProductCards()
  const posterHost = crossOriginPosterHost(products)

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

      <section className="site-section">
        <div className="site-container">
          {products.length === 0 ? (
            <p className="site-empty">
              The references are being updated. Email us and we will send the current set directly.
            </p>
          ) : (
            <>
              <p className="section-number">
                {products.length} reference{products.length === 1 ? '' : 's'}
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
