import type { Metadata } from 'next'
import { JsonLd } from '../../../components/site/JsonLd'
import { getProductCards, type ProductCard } from '../../../lib/content'
import { buildMetadata, VIEWER_ORIGIN } from '../../../lib/seo'
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
export default async function ProductsPage() {
  const products = await getProductCards()

  return (
    <>
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
              <ul className="product-grid" style={{ marginTop: '24px' }}>
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
            /*
             * A plain <img>, not next/image. apps/cms runs on Workers without `sharp`,
             * so the optimiser cannot resize anything — next/image would add a proxy
             * hop and ship the identical bytes. `lazy` + `async` decoding keeps the
             * posters off the critical path; the aspect-ratio box means no layout
             * shift while they arrive.
             */
            // biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize — it would add a proxy hop and serve byte-identical posters. See above.
            <img
              className="product-card__img"
              src={product.posterUrl}
              alt={product.posterAlt}
              loading="lazy"
              decoding="async"
              width={1200}
              height={1500}
            />
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
