'use client'

import { containedBox, type DyeRun, playDye, readDyeTiming } from '@run-apparel/shared'
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  afterScroll,
  colourHref,
  NEAR_MARGIN,
  REST_FRAMES,
  restingTarget,
  slideAt,
  slidesToLoad,
  startsFar,
  stepColour,
} from '../../lib/cardGallery'
import { cardImage } from '../../lib/cardImage'
import type { CardColour } from '../../lib/projectPublic'
import { ProductPoster } from './ProductPoster'
import { ViewerCue } from './ViewerCue'

/** The pressed control's centre, in px from the top-left of `layer`. */
function pointFrom(from: Element, layer: Element): { x: number; y: number } {
  const pressed = from.getBoundingClientRect()
  const box = layer.getBoundingClientRect()
  return {
    x: pressed.left + pressed.width / 2 - box.left,
    y: pressed.top + pressed.height / 2 - box.top,
  }
}

/** The longest the old picture is held over a new one still loading (CardGallery's header). */
const HOLD_MS = 1500

/**
 * Settles once `slide`'s picture has loaded, or after `HOLD_MS`: the slide may not even have its
 * picture yet (`slidesToLoad` adds it on the press), and a lazy one is asked for at once.
 */
function arrived(slide: HTMLElement): Promise<void> {
  return new Promise((done) => {
    const started = performance.now()
    const look = () => {
      const picture = slide.querySelector('img')
      if (picture?.complete && picture.naturalWidth > 0) return done()
      if (picture?.loading === 'lazy') picture.loading = 'eager'
      if (performance.now() - started > HOLD_MS) return done()
      requestAnimationFrame(look)
    }
    look()
  })
}

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
 *
 * ⚠️ A DOT OR AN ARROW CHANGES THE COLOUR WITH THE DYE, NOT THE GLIDE (owner, 2026-10-26: one dye
 * everywhere a garment changes colour; packages/shared/src/dyePlayer.ts). The strip jumps to the new
 * colour at once, as it does under reduced motion, and the old picture is laid over it on the
 * rectangle it is drawn in and soaks away from the pressed control. A finger, the wheel and the
 * keyboard still glide the strip: a swipe is a slide. And a press still glides where the dye cannot
 * start cleanly: a render beside a poster (two framings would show both garments), the showing
 * picture not loaded, or a visitor who asked for less motion.
 *
 * ⚠️ THE NEW PICTURE IS OFTEN NOT THERE YET, SO THE OLD ONE IS HELD OVER IT UNTIL IT IS (2026-10-26).
 * A neighbouring slide's picture is lazy and clipped by the strip, and Chromium had not fetched it
 * 10 s after the card was engaged (e2e/cardDye.spec.ts, local run). The press asks for it at once
 * (`loading` turned eager) and the dye starts once it has loaded, or after `HOLD_MS` whatever came.
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
   * A card far down the page waits to draw its other colours (`data-far`, site.css has why). Once it
   * comes within two screens the mark goes for good, so a card a visitor can touch is whole and its
   * next colour loads ahead of a swipe in every engine, as before. Without scripting the mark stays;
   * those slides have no picture to show then anyway (only the first loads, see above).
   */
  const figure = useRef<HTMLElement>(null)
  const [far, setFar] = useState(() => startsFar(index) && colours.length > 1)
  useEffect(() => {
    const el = figure.current
    if (!far || !el) return
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setFar(false)
      },
      { rootMargin: NEAR_MARGIN },
    )
    near.observe(el)
    return () => near.disconnect()
  }, [far])

  /**
   * The colour a dot or an arrow is gliding the strip to, until the strip comes to rest.
   *
   * ⚠️ WITHOUT IT, TWO QUICK ARROW PRESSES LOST THEIR PLACE (VA-30, caught by the browser test
   * 2026-10-02). A smooth scroll reports every slide it crosses, so mid-glide `active` read the
   * colour passing by, and the second press counted from that: "previous" twice from the
   * second colour landed on the first instead of wrapping to the last. So while a glide is on
   * its way the passing slides are not shown, and a press counts from the destination. A
   * finger, the wheel or a key takes over at once (`handOver`): the glide is no longer ours.
   *
   * ⚠️ AND IT LASTS UNTIL THE STRIP RESTS (`onScrollEnd`), NOT UNTIL IT FIRST READS ITS COLOUR
   * (11 Oct 2026, CI run 38142934506): a glide sent somewhere new keeps its speed, so it can read
   * its destination on the way OUT. `afterScroll` in `lib/cardGallery.ts` has the measurements.
   */
  const heading = useRef<number | null>(null)
  /** Hand the strip back to the visitor — only for input ON the strip, never an arrow's press. */
  const handOver = (event: { target: EventTarget }) => {
    if (strip.current?.contains(event.target as Node)) heading.current = null
  }

  /**
   * Whether the strip's last move was the gallery settling it onto a picture (`restingTarget`):
   * the rest after it is never corrected again, so a strip the browser will not snap where it is
   * asked can never start a loop of corrections.
   */
  const settling = useRef(false)

  /**
   * One slide's width, fractions included. `clientWidth` rounds: a card 365.6px wide reports 366,
   * and reading positions in one width while `restingTarget` reads them in the other left the fifth
   * picture 1.6px "off", so a press on it waited the long rest instead of 12 frames (review, 11 Oct
   * 2026). Every read here uses this one.
   *
   * THE LAYOUT WIDTH, NOT `getBoundingClientRect()`: that one follows transforms, and a press on the
   * card's words scales the whole card to 0.97 (`.product-card:active`, site.css), so a rest read
   * mid-press saw the strip 3% narrow and asked for a scroll 11px short of the second picture
   * (second review, 12 Oct 2026). Measured the same day, the mandatory snap pulled that request back
   * onto the picture in all three engines, so nothing showed; this reads the width the snap points
   * are laid out in. The strip has no padding or border, so its computed width is the slide.
   */
  const slideWidth = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).width)

  /**
   * The gallery's own rest signal for a glide it started: `REST_FRAMES` frames in a row with the
   * strip still, beside `scrollend`.
   *
   * ⚠️ `scrollend` DOES NOT ALWAYS COME (11 Oct 2026). "Next" then "previous" 8ms apart stopped
   * Chromium 153's strip 2px into the second picture, and no `scrollend` followed, in 6 of 6
   * tries, though the strip had moved; Firefox 155 left it 7–14px in WITH one. A frame count, not a
   * timer: a busy page that pauses the strip pauses the frames too, so a stalled glide never reads
   * as a rest. It stops as soon as the glide is no longer ours (`heading` changed: a finger, the
   * wheel, a key or another press).
   */
  const watcher = useRef(0)
  const watchRest = (target: number) => {
    cancelAnimationFrame(watcher.current)
    const from = strip.current?.scrollLeft ?? 0
    let last = from
    let still = 0
    const tick = () => {
      const el = strip.current
      if (!el || heading.current !== target) return
      still = el.scrollLeft === last ? still + 1 : 0
      last = el.scrollLeft
      // A glide the browser has not started yet is not a rest: still counts only once the strip
      // has moved or already stands where it was sent, or after `REST_FRAMES` × 5 without either.
      const settled =
        el.scrollLeft !== from || Math.abs(el.scrollLeft - target * slideWidth(el)) <= 1
      if (still >= (settled ? REST_FRAMES : REST_FRAMES * 5)) follow(true)
      else watcher.current = requestAnimationFrame(tick)
    }
    watcher.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => cancelAnimationFrame(watcher.current), [])

  /** The strip moved; `rested` once it has come to rest (`scrollend`, or `watchRest`). */
  const follow = (rested: boolean) => {
    const el = strip.current
    if (!el) return
    const at = slideAt(el.scrollLeft, slideWidth(el), colours.length)
    const next = afterScroll(heading.current, at, {
      rested,
      restsReported: 'onscrollend' in window,
    })
    heading.current = next.heading
    if (rested) {
      const settle = settling.current
        ? null
        : restingTarget(el.scrollLeft, slideWidth(el), colours.length)
      settling.current = settle !== null
      if (settle !== null) {
        // Settling onto the picture it shows: a glide of our own, so none of its passing is shown.
        heading.current = settle
        el.scrollTo({ left: settle * slideWidth(el), behavior: glide() })
        watchRest(settle)
      }
    }
    if (next.show === null) return
    setActive(next.show)
    want(next.show)
  }

  /** The dye a press plays over the picture (see the header), and the canvas it is drawn on. */
  const dyeLayer = useRef<HTMLCanvasElement>(null)
  const dyeRun = useRef<DyeRun | null>(null)
  useEffect(() => () => dyeRun.current?.cancel(), [])
  /** Starts the dye from the showing picture to `target`'s, from `from`'s centre; false if it cannot. */
  const dyeTo = (target: number, from: Element): boolean => {
    dyeRun.current?.cancel()
    dyeRun.current = null
    const el = strip.current
    const layer = dyeLayer.current
    if (!el || !layer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    const slides = el.querySelectorAll<HTMLElement>('.card-gallery__slide')
    const now = slides[slideAt(el.scrollLeft, slideWidth(el), colours.length)]
    const next = slides[target]
    const old = now?.querySelector('img')
    if (!now || !next || now === next || now.dataset.kind !== next.dataset.kind) return false
    if (!old?.complete || !old.naturalWidth) {
      // A press during a dye still holding for its picture: the new dye takes over from what is on
      // screen, where the layer already lies (whole-branch review, 2026-10-26: it glided over a
      // blank slide).
      if (!layer.hasAttribute('data-running')) return false
      dyeRun.current = playDye({
        layer,
        old: null,
        point: pointFrom(from, layer),
        swatch: colours[target]?.swatch || null,
        kind: 'full',
        timing: readDyeTiming((token) => getComputedStyle(layer).getPropertyValue(token)),
        after: arrived(next),
      })
      return true
    }
    const style = getComputedStyle(old)
    const drawn = containedBox(
      { width: old.offsetWidth, height: old.offsetHeight },
      {
        top: Number.parseFloat(style.paddingTop) || 0,
        right: Number.parseFloat(style.paddingRight) || 0,
        bottom: Number.parseFloat(style.paddingBottom) || 0,
        left: Number.parseFloat(style.paddingLeft) || 0,
      },
      { width: old.naturalWidth, height: old.naturalHeight },
    )
    if (!drawn) return false
    Object.assign(layer.style, {
      left: `${el.offsetLeft + drawn.x}px`,
      top: `${el.offsetTop + drawn.y}px`,
      width: `${drawn.width}px`,
      height: `${drawn.height}px`,
    })
    dyeRun.current = playDye({
      layer,
      old,
      point: pointFrom(from, layer),
      swatch: colours[target]?.swatch || null,
      kind: 'full',
      timing: readDyeTiming((token) => getComputedStyle(layer).getPropertyValue(token)),
      after: arrived(next),
    })
    return true
  }

  /** A smooth glide, or an instant move when the visitor asks for reduced motion. */
  const glide = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

  /** Shows `target`; `from` is the dot or arrow pressed, whose press plays the dye (the header). */
  const show = (target: number, from?: Element) => {
    const el = strip.current
    if (!el) return
    // Before the strip moves: the dye starts from the picture showing now.
    const dyed = from ? dyeTo(target, from) : false
    heading.current = target
    // A press is a new glide, not the settling one: its own rest may be corrected again (review,
    // 11 Oct 2026: a dot pressed while a correction ran skipped the correction it needed).
    settling.current = false
    el.scrollTo({ left: target * slideWidth(el), behavior: dyed ? 'auto' : glide() })
    watchRest(target)
    setActive(target)
    want(target)
  }
  /** One colour on, either way, round from the last to the first, counted from where it is going. */
  const step = (by: number, from: Element) =>
    show(stepColour(heading.current, active, by, colours.length), from)

  return (
    <>
      <figure
        className="product-card__figure"
        ref={figure}
        data-far={far ? '' : undefined}
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
        <div
          className="card-gallery"
          ref={strip}
          onScroll={() => follow(false)}
          onScrollEnd={() => follow(true)}
        >
          {colours.map((colour, slide) => (
            <a
              key={colour.slug}
              className="card-gallery__slide"
              href={colourHref(garmentPages, productSlug, colour.slug)}
              tabIndex={slide === active ? 0 : -1}
              data-kind={colour.image?.kind ?? 'none'}
              // R1, dye first (D51): the colour shows at once, behind the transparent picture, and
              // passes off in picks when the picture has landed. A cached picture never fires load.
              style={colour.swatch ? ({ '--dye': colour.swatch } as CSSProperties) : undefined}
              ref={(el) => {
                if (el?.querySelector('img')?.complete) el.dataset.landed = 'true'
              }}
              onLoadCapture={(event) => {
                event.currentTarget.dataset.landed = 'true'
              }}
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
          // The old colour soaking away after a press (dyeTo): a copy of what is on screen, so silent.
          // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas has no tabindex and takes no focus (as LiveGarment.tsx's).
          <canvas className="dye-layer" ref={dyeLayer} aria-hidden="true" />
        ) : null}
        {colours.length > 1 ? (
          <>
            <button
              type="button"
              className="card-gallery__arrow card-gallery__arrow--prev"
              aria-label={`Previous colour of ${productName}`}
              onClick={(event) => step(-1, event.currentTarget)}
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
              onClick={(event) => step(1, event.currentTarget)}
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
      {/* The name before the dots (polish D3b): the ticket's stub reads name, then colours, on a
          phone's sideways card as on a computer's, and the Tab key meets them in that order. */}
      <a className="product-card__link" href={href}>
        {children}
      </a>
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
                onClick={(event) => show(slide, event.currentTarget)}
                // The colour itself, read by `.card-gallery__dot::before`; none, an empty ring.
                style={colour.swatch ? ({ '--swatch': colour.swatch } as CSSProperties) : undefined}
              />
            ))}
          </span>
        </div>
      ) : null}
    </>
  )
}
