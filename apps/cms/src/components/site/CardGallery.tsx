'use client'

import { type CSSProperties, type ReactNode, useRef, useState } from 'react'
import { colourHref, slideAt, slidesToLoad } from '../../lib/cardGallery'
import { cardImage } from '../../lib/cardImage'
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
 * THE DOTS ARE PAINTED IN THE GARMENT'S COLOURS SINCE 2026-10-02 (visual audit VA-30,
 * owner-approved): each carries its colour's `hexSwatch`, the value the garment page paints
 * its swatches with, and the chosen one wears a ring. They were grey until then, held back by
 * a field description ("Buyers never see it") the garment pages had already made untrue. The
 * colour's NAME stays printed beside them: a dot alone says which, not what.
 *
 * PREVIOUS / NEXT ARROWS over the picture (VA-30; the W3C carousel pattern's slide buttons):
 * a mouse could change colour only through the small dots. They appear on hover and whenever
 * the card holds keyboard focus, are real buttons in the tab order, and wrap from the last
 * colour to the first. A touch screen has the swipe, so they are hidden there (site.css).
 */
export function CardGallery({
  productSlug,
  productName,
  garmentPages,
  colours,
  index,
  children,
}: {
  productSlug: string
  productName: string
  garmentPages: string
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
  const href = colourHref(garmentPages, productSlug, showing?.slug ?? '')

  /**
   * The colour a dot or an arrow is gliding the strip to, until it lands.
   *
   * ⚠️ WITHOUT IT, TWO QUICK ARROW PRESSES LOST THEIR PLACE (VA-30, caught by the browser test
   * 2026-10-02). A smooth scroll reports every slide it crosses, so mid-glide `active` read the
   * colour passing by, and the second press counted from that: "previous" twice from the
   * second colour landed on the first instead of wrapping to the last. So while a glide is on
   * its way the passing slides are not shown, and a press counts from the destination. A
   * finger, the wheel or a key takes over at once (`handOver`): the glide is no longer ours.
   */
  const heading = useRef<number | null>(null)
  /** Hand the strip back to the visitor — only for input ON the strip, never an arrow's press. */
  const handOver = (event: { target: EventTarget }) => {
    if (strip.current?.contains(event.target as Node)) heading.current = null
  }

  const onScroll = () => {
    const el = strip.current
    if (!el) return
    const at = slideAt(el.scrollLeft, el.clientWidth, colours.length)
    if (heading.current !== null) {
      if (at !== heading.current) return
      heading.current = null
    }
    setActive(at)
    want(at)
  }

  const show = (target: number) => {
    const el = strip.current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    heading.current = target
    el.scrollTo({ left: target * el.clientWidth, behavior: still ? 'auto' : 'smooth' })
    setActive(target)
    want(target)
  }
  /** One colour on, either way, round from the last to the first, counted from where it is going. */
  const step = (by: number) =>
    show(((heading.current ?? active) + by + colours.length) % colours.length)

  return (
    <>
      <figure
        className="product-card__figure"
        onPointerEnter={engage}
        onPointerDown={(event) => {
          engage()
          handOver(event)
        }}
        onTouchStart={(event) => {
          engage()
          handOver(event)
        }}
        onWheel={handOver}
        onKeyDown={handOver}
        onFocus={engage}
      >
        <div className="card-gallery" ref={strip} onScroll={onScroll}>
          {colours.map((colour, slide) => (
            <a
              key={colour.slug}
              className="card-gallery__slide"
              href={colourHref(garmentPages, productSlug, colour.slug)}
              tabIndex={slide === active ? 0 : -1}
              data-kind={colour.image?.kind ?? 'none'}
            >
              {!loaded.has(slide) ? (
                // Its name, until its picture (whose alt says the same) is allowed to load.
                <span className="visually-hidden">{`${productName} in ${colour.name}`}</span>
              ) : colour.image ? (
                <ProductPoster
                  {...cardImage(colour.image.url)}
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
        {colours.length > 1 ? (
          <>
            <button
              type="button"
              className="card-gallery__arrow card-gallery__arrow--prev"
              aria-label={`Previous colour of ${productName}`}
              onClick={() => step(-1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path
                  d="m15 5-7 7 7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="card-gallery__arrow card-gallery__arrow--next"
              aria-label={`Next colour of ${productName}`}
              onClick={() => step(1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path
                  d="m9 5 7 7-7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        ) : null}
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
          {/* One unbreakable group, so a long colour name moves ALL the dots down together
              rather than stranding the last one on a row of its own (site.css). */}
          <span className="card-gallery__pick">
            {colours.map((colour, slide) => (
              <button
                key={colour.slug}
                type="button"
                className="card-gallery__dot"
                aria-label={`Show ${colour.name}`}
                aria-pressed={slide === active}
                onClick={() => show(slide)}
                // The colour itself, read by `.card-gallery__dot::before`; none, an empty ring.
                style={colour.swatch ? ({ '--swatch': colour.swatch } as CSSProperties) : undefined}
              />
            ))}
          </span>
        </div>
      ) : null}
      <a className="product-card__link" href={href}>
        {children}
      </a>
    </>
  )
}
