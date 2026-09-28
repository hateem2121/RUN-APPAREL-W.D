'use client'

import { type ReactNode, useRef, useState } from 'react'
import { colourHref, slideAt, slidesToLoad } from '../../lib/cardGallery'
import type { CardColour } from '../../lib/projectPublic'
import { ProductPoster } from './ProductPoster'
import { ViewerCue } from './ViewerCue'

/**
 * A gallery card's pictures, one per colour, that a visitor swipes between (owner's call,
 * 2026-09-28: the studio render where a colour has one, else its 3D poster; swipe plus
 * dots; tapping the card opens the colour that is showing).
 *
 * ⚠️ THE SWIPE IS THE BROWSER'S OWN, NOT A GESTURE HANDLER. The strip is a CSS scroll-snap
 * row (`.card-gallery` in site.css), so a finger, a trackpad and a keyboard all move it
 * natively, it works before hydration and with scripting off, and nothing here can fight
 * the page's vertical scroll — a touch handler that calls `preventDefault` to own the
 * swipe is exactly what makes a phone page feel stuck. JavaScript only reads where the
 * row landed (`slideAt`) and moves it when a dot is pressed.
 *
 * ⚠️ EVERY SLIDE IS ITS OWN LINK TO ITS OWN COLOUR, so tapping the picture opens the colour
 * it shows even before hydration. The card's text link follows the showing colour once
 * scripting runs; without it, that link keeps the default colour, which is where it
 * pointed before this existed. Only the SHOWING slide is in the tab order (a roving
 * `tabIndex`): one stop per card, not five, and once it has focus the arrow keys scroll the
 * strip — the keyboard's swipe. With every slide at -1, axe failed the strip
 * (`scrollable-region-focusable`): a keyboard could not reach a region that scrolls.
 * A screen reader still meets every slide, each named by its CONTENT — the picture's alt,
 * or its name while the picture waits, plus the caption below — never an `aria-label`,
 * which replaced the caption's words (`e2e/viewerCue.spec.ts` read only "Studio render: …
 * in Wine"). Hiding the off-screen ones with `aria-hidden` would hide a working link,
 * which Biome's `useAnchorContent` rightly refuses.
 *
 * ⚠️ EACH PICTURE LINK SAYS IT OPENS THE 3D VIEWER, TO A SCREEN READER (XS-09). The owner's
 * rule is that every link to the viewer says so. A sighted visitor reads the caption just
 * below the picture, on the same card; a screen reader meets each picture link on its own,
 * so the same words ride inside it, visually hidden. `e2e/viewerCue.spec.ts` counts one
 * caption per viewer link and would fail a picture link without one.
 *
 * ⚠️ `loading="lazy"` DOES NOT KEEP THE OTHER COLOURS FROM LOADING — MEASURED, SO THE
 * PICTURES ARE HELD BACK HERE. On 2026-09-28 a card with two renders and two posters, lazy
 * on every slide but the first, fetched ALL FOUR the moment the card scrolled into view in
 * Chromium, and three of four in Firefox and WebKit: the engines' lazy-load margin ignores
 * the strip's own clipping, so a slide hidden beside the frame counts as "near". With the
 * renders at 0.5–0.7 MB each, that is every render of every card on screen. So a slide
 * gets its image only once `slidesToLoad` says so — the first on arrival, and the showing
 * colour's neighbours as soon as the visitor touches, points at or focuses the card.
 * Without scripting only the first picture loads; the other slides stay blank.
 *
 * ⚠️ THE DOTS ARE NOT PAINTED IN THE GARMENT'S COLOURS. The only colour value the CMS holds
 * is `hexSwatch`, and its field description says buyers never see it (see `toProductCard`).
 * The colour's NAME is printed beside the dots instead.
 */
export function CardGallery({
  productSlug,
  productName,
  viewerOrigin,
  colours,
  index,
  children,
}: {
  productSlug: string
  productName: string
  viewerOrigin: string
  colours: CardColour[]
  /** The card's position in the gallery, for the first picture's loading priority. */
  index: number
  children: ReactNode
}) {
  const [active, setActive] = useState(0)
  const [engaged, setEngaged] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]))
  const want = (around: number) => {
    setLoaded((previous) => {
      const next = slidesToLoad(previous, around, colours.length)
      return next.size === previous.size ? previous : next
    })
  }
  const engage = () => {
    if (engaged) return
    setEngaged(true)
    want(active)
  }
  const showing = colours[active] ?? colours[0]
  const href = colourHref(viewerOrigin, productSlug, showing?.slug ?? '')

  const onScroll = () => {
    const el = strip.current
    if (!el) return
    const at = slideAt(el.scrollLeft, el.clientWidth, colours.length)
    setActive(at)
    want(at)
  }

  const show = (target: number) => {
    const el = strip.current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: target * el.clientWidth, behavior: still ? 'auto' : 'smooth' })
    setActive(target)
    want(target)
  }

  return (
    <>
      <figure
        className="product-card__figure"
        onPointerEnter={engage}
        onPointerDown={engage}
        onTouchStart={engage}
        onFocus={engage}
      >
        <div className="card-gallery" ref={strip} onScroll={onScroll}>
          {colours.map((colour, slide) => (
            <a
              key={colour.slug}
              className="card-gallery__slide"
              href={colourHref(viewerOrigin, productSlug, colour.slug)}
              tabIndex={slide === active ? 0 : -1}
              data-kind={colour.image?.kind ?? 'none'}
            >
              {!loaded.has(slide) ? (
                // Its name, until its picture (whose alt says the same) is allowed to load.
                <span className="visually-hidden">{`${productName} in ${colour.name}`}</span>
              ) : colour.image ? (
                <ProductPoster
                  src={colour.image.url}
                  alt={colour.image.alt}
                  // Only the first picture competes for the first screen; the rest are
                  // lazy, so a colour loads when a visitor swipes to it.
                  index={slide === 0 ? index : undefined}
                />
              ) : (
                <span className="product-card__placeholder">[ 3D reference ]</span>
              )}
              <span className="visually-hidden">
                <ViewerCue />
              </span>
            </a>
          ))}
        </div>
      </figure>
      {colours.length > 1 ? (
        <div
          className="card-gallery__dots"
          role="group"
          aria-label={`${productName} colours`}
          onPointerEnter={engage}
          onFocus={engage}
        >
          <span className="card-gallery__colour" aria-live="polite">
            {showing?.name}
          </span>
          {colours.map((colour, slide) => (
            <button
              key={colour.slug}
              type="button"
              className="card-gallery__dot"
              aria-label={`Show ${colour.name}`}
              aria-pressed={slide === active}
              onClick={() => show(slide)}
            />
          ))}
        </div>
      ) : null}
      <a className="product-card__link" href={href}>
        {children}
      </a>
    </>
  )
}
