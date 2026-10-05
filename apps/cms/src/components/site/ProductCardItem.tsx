import { nameSegments } from '../../lib/cardName'
import type { ProductCard } from '../../lib/content'
import { GARMENT_PAGES } from '../../lib/seo'
import type { SportPlace } from '../../lib/sports'
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
 * ⚠️ EACH CARD IS A TICKET SINCE POLISH D3b (2026-10-05; the owner's D3, X9 and M1). The front is the
 * picture, the name and the dots; the code, the description and "Opens the 3D viewer" wait in
 * `.product-card__more` until a pointer rests on the card or the keyboard reaches it, from 560px.
 * A phone always shows the sideways ticket with only the name and the dots. site.css ("The product
 * tickets") has the geometry; `TicketDismiss.tsx` closes an open one on Escape.
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
 *
 * `place`: on a page with sport buttons (polish S7), the card's sport and its place among that
 * sport's cards, which site.css reads while one sport is shown (`lib/sports.ts`).
 */
export function ProductCardItem({
  product,
  index,
  heading: Heading = 'h2',
  place,
}: {
  product: ProductCard
  index: number
  heading?: 'h2' | 'h3'
  place?: SportPlace
}) {
  return (
    <li
      className="product-card"
      data-sport={place?.sport ?? undefined}
      data-cut={place?.cut.length ? place.cut.join(' ') : undefined}
      data-lie={place?.lie ? '' : undefined}
    >
      <CardGallery
        productSlug={product.slug}
        productName={product.productName}
        garmentPages={GARMENT_PAGES}
        colours={product.colours}
        index={index}
      >
        <div className="product-card__body">
          <Heading className="product-card__name" translate="no">
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
          {/* The ticket's opening part (polish D3b, X9): out of sight until the card opens, and
              on a phone always (M1), but a screen reader reads it in the link's name either way.
              What the garment is, then the way in, as the D3 demo ordered them. */}
          <div className="product-card__more">
            {/* No "· 5 colors": the dots already show how many (polish D6, 2026-10-04), and their
                group names every colour to a screen reader (CardGallery.tsx). */}
            <p className="product-card__meta">
              <span translate="no">{product.productCode}</span>
              {product.category ? <span>· {product.category}</span> : null}
            </p>
            {product.shortDescription ? (
              <p className="product-card__desc">{product.shortDescription}</p>
            ) : null}
            <ViewerCue />
          </div>
        </div>
      </CardGallery>
    </li>
  )
}
