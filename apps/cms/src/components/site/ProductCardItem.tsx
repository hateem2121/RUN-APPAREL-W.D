import { nameSegments } from '../../lib/cardName'
import type { ProductCard } from '../../lib/content'
import { GARMENT_PAGES } from '../../lib/seo'
import { CardGallery } from './CardGallery'
import { ViewerCue } from './ViewerCue'

/**
 * One garment card: its pictures, its name, its code and where the link goes.
 *
 * Moved out of `(frontend)/products/page.tsx` on 2026-09-30, unchanged, when the buyer
 * pages began showing the same cards; a Next page file may export only the page, so a card
 * two pages share has to live here.
 *
 * The pictures, dots and link live in `CardGallery` (a client component, for the dots);
 * the text below is still rendered here and handed to it as children.
 *
 * ⚠️ `index` DECIDES WHICH PICTURE LOADS FIRST: card 0 is fetched eagerly at high priority
 * (`e2e/composition.spec.ts`, IM-05). That is right for the gallery, whose first card is on
 * the first screen. A page whose cards start lower down passes `index + 1`, so none of them
 * competes with the headline.
 *
 * `heading` keeps the outline honest: `h2` where the cards hang off the page's `h1`, `h3`
 * where they sit under a section heading.
 *
 * The name's hyphenated words (V-NECK, ZIP-UP) are each held in one piece, so a two-up phone card
 * never ends a line on "V-" (`lib/cardName.ts`, owner's call 2026-10-02). The words read exactly as
 * before: the spans add no characters, and the heading's text is the name.
 */
export function ProductCardItem({
  product,
  index,
  heading: Heading = 'h2',
}: {
  product: ProductCard
  index: number
  heading?: 'h2' | 'h3'
}) {
  const colours = product.colourNames.length

  return (
    <li className="product-card">
      <CardGallery
        productSlug={product.slug}
        productName={product.productName}
        garmentPages={GARMENT_PAGES}
        colours={product.colours}
        index={index}
      >
        <div className="product-card__body">
          <Heading className="product-card__name">
            {nameSegments(product.productName).map((part) =>
              part.whole ? (
                <span key={part.at} className="product-card__word">
                  {part.text}
                </span>
              ) : (
                part.text
              ),
            )}
          </Heading>
          <p className="product-card__meta">
            <span>{product.productCode}</span>
            {product.category ? <span>· {product.category}</span> : null}
            <span>
              · {colours} color{colours === 1 ? '' : 's'}
            </span>
          </p>
          <ViewerCue />
          {product.shortDescription ? (
            <p className="product-card__desc">{product.shortDescription}</p>
          ) : null}
        </div>
      </CardGallery>
    </li>
  )
}
