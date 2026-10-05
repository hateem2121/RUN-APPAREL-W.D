'use client'

import { type CSSProperties, type ReactNode, useState } from 'react'
import type { CardColour, LiveModel } from '../../lib/projectPublic'
import { LiveGarment } from './LiveGarment'
import { ProductPoster } from './ProductPoster'

/** What №03 needs of its garment: one published product with a poster. */
export type ProofProduct = {
  slug: string
  productName: string
  productCode: string
  posterUrl: string
  posterAlt: string
  colours: CardColour[]
  model: LiveModel | null
}

/**
 * №03, the showcase (polish D2, 2026-10-05; the report's recommendation, built without a design stop
 * by the owner's answer Q32): the garment large on one side; on the other the words, three points on
 * what a visitor can do with a 3D reference, and colour dots that change the garment.
 *
 * ⚠️ ONE CHOICE, THREE PLACES. A dot changes the live model's variant (`LiveGarment`), the still
 * picture under it, and the link that opens the garment's page, so a visitor who clicks through lands
 * on the colour they were looking at, as a gallery card's link follows its showing colour. Without
 * WebGL, or before the model arrives, the still alone answers the dot.
 *
 * ⚠️ THE DOTS ARE ON THE WORDS' SIDE, AS THE REPORT DREW THEM, AND THAT IS ALSO WHY THEY CAN BE BUTTONS:
 * under the garment they would sit inside its link, and a button inside a link is not allowed. They are
 * the gallery cards' dots (`.card-gallery__dot`: a 44px button, the colour painted in, a ring on the
 * chosen one), with the colour's name beside them, spoken as it changes.
 *
 * The garment's own figure is what the page had before (the still, the caption, "Opens the 3D viewer",
 * the live model laid over the still); `page.tsx` has the history of each part.
 */
export function ProofShowcase({
  product,
  garmentPages,
  actions,
  cue,
  children,
}: {
  product: ProofProduct | null
  garmentPages: string
  /** The button under the words, after the dots. */
  actions: ReactNode
  /**
   * "Opens the 3D viewer", drawn by the page that hands over the garment pages' address, so the
   * caption and the link it explains are counted in one file (`publicSite.test.ts`, XS-09).
   */
  cue: ReactNode
  /** The words: the number, the heading, the lede and the three points, drawn by the server. */
  children: ReactNode
}) {
  const [chosen, setChosen] = useState(0)
  const colours = product?.colours ?? []
  const colour = colours[chosen] ?? colours[0]
  const label = product ? `${product.productCode} ${product.productName}` : ''

  // The first colour keeps the product's own poster (light, and what the gallery shows); another
  // colour shows its own picture, or the drawn placeholder where it has none.
  const still =
    chosen === 0 || !colour
      ? { key: 'poster', src: product?.posterUrl ?? null, alt: product?.posterAlt ?? '' }
      : { key: colour.slug, src: colour.image?.url ?? null, alt: colour.image?.alt ?? '' }
  const variant = colour && product?.model ? (product.model.variants[colour.slug] ?? null) : null
  // A colour the one model cannot switch to (a model per colour) shows its still instead.
  const live = product?.model && (chosen === 0 || variant) ? product.model : null

  return (
    <>
      <div className="proof__copy">
        {children}
        {product && colours.length > 1 ? (
          <div className="proof__colours" role="group" aria-label={`${product.productName} colors`}>
            <span className="proof__colours-name" aria-live="polite">
              {colour?.name}
            </span>
            <span className="card-gallery__pick">
              {colours.map((each, index) => (
                <button
                  key={each.slug}
                  type="button"
                  className="card-gallery__dot"
                  aria-label={`Show ${each.name}`}
                  aria-pressed={index === chosen}
                  onClick={() => setChosen(index)}
                  style={each.swatch ? ({ '--swatch': each.swatch } as CSSProperties) : undefined}
                />
              ))}
            </span>
          </div>
        ) : null}
        {actions}
      </div>
      {product ? (
        <figure className="proof__figure">
          <a className="proof__link" href={`${garmentPages}/${product.slug}/${colour?.slug ?? ''}`}>
            <span className="proof__frame">
              {still.src ? (
                <ProductPoster key={still.key} src={still.src} alt={still.alt} />
              ) : (
                <span className="product-card__placeholder">[ 3D reference ]</span>
              )}
            </span>
            <figcaption className="proof__caption" translate="no">
              {label}
            </figcaption>
            {cue}
          </a>
          {/*
            The live garment sits OVER the picture and OUTSIDE the link, so turning it never
            navigates; the caption and cue below still open the full viewer (LiveGarment.tsx).
          */}
          {live ? <LiveGarment model={live} label={label} variant={variant} /> : null}
        </figure>
      ) : null}
    </>
  )
}
