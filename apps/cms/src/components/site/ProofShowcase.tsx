'use client'

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { type DyeRun, playDye, readDyeTiming } from '@run-apparel/shared'
import type { CardColour, LiveModel } from '../../lib/projectPublic'
import { pillPaint } from '../../lib/proofShowcase'
import { LiveGarment, type PickedFrom, pointIn } from './LiveGarment'
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

/** The garment's own details, read from its CMS record (D43): a heading and labelled rows. */
export type ProofDetails = {
  /** "Women's Crop Hoodie": the garment's plain type, `''` when none is typed. */
  type: string
  rows: readonly (readonly [label: string, value: string])[]
}

/**
 * №03, the showcase (polish D2, 2026-10-05; rebuilt as D43, owner, 2026-10-15/16): the words, the
 * garment large beside them, its colours as a row of pills, its details from the CMS, and the way to
 * every garment.
 *
 * ⚠️ ONE CHOICE, THREE PLACES. A colour changes the live model's variant (`LiveGarment`), the still
 * picture under it, and the link that opens the garment's page, so a visitor who clicks through lands
 * on the colour they were looking at, as a gallery card's link follows its showing colour. Without
 * WebGL, or before the model arrives, the still alone answers the colour.
 *
 * ⚠️ THE ORDER IS THE PHONE'S READING ORDER (D43): the words, the garment, then its colours, its
 * details and the button. From 900px the garment stands on the right and the rest is laid out on the
 * left by grid areas (site.css), so the colours read after the garment they change, at every width.
 * They are outside the garment's link on purpose: a button inside a link is not allowed.
 */
export function ProofShowcase({
  product,
  details,
  garmentPages,
  actions,
  cue,
  children,
}: {
  product: ProofProduct | null
  details: ProofDetails | null
  garmentPages: string
  /** The button and the count beside it, after the details. */
  actions: ReactNode
  /**
   * "Opens the 3D viewer", drawn by the page that hands over the garment pages' address, so the
   * caption and the link it explains are counted in one file (`publicSite.test.ts`, XS-09).
   */
  cue: ReactNode
  /** The words: the number, the heading, the lede and the points, drawn by the server. */
  children: ReactNode
}) {
  const [chosen, setChosen] = useState(0)
  const colours = product?.colours ?? []
  const colour = colours[chosen] ?? colours[0]
  const label = product ? `${product.productCode} ${product.productName}` : ''

  // The first colour keeps the product's own poster (light, and what the gallery shows); another
  // colour shows its own picture, or the drawn placeholder where it has none.
  /*
   * ⚠️ THE POSTER'S WORDS ARE THE COLOUR'S NAME, NOT THE POSTER FILE'S (home page audit, 2026-10-17).
   * The poster's own alt in the CMS still said "CAPSULE CORE HOODIE in Olive / Sage" while the
   * colour, its renders and the pill all say "Bay Leaf / Matcha" (live API, read 2026-10-17), so a
   * screen reader heard a colour the page never showed. Built from the colour as the colourway's
   * own `altText` is, so the two can no longer drift.
   */
  const still: Still =
    chosen === 0 || !colour
      ? {
          key: 'poster',
          src: product?.posterUrl ?? null,
          alt:
            product && colour
              ? `${product.productName} in ${colour.name}`
              : (product?.posterAlt ?? ''),
        }
      : { key: colour.slug, src: colour.image?.url ?? null, alt: colour.image?.alt ?? '' }
  const variant = colour && product?.model ? (product.model.variants[colour.slug] ?? null) : null
  // A colour the one model cannot switch to (a model per colour) shows its still instead.
  const live = product?.model && (chosen === 0 || variant) ? product.model : null
  // A colour's dot, read as its colour lands, so its dye opens from it (LiveGarment.tsx).
  const pick = useRef<HTMLDivElement>(null)
  const dotFrom = useCallback((dot: HTMLElement | null | undefined): PickedFrom | null => {
    if (!dot?.parentElement) return null
    const box = dot.getBoundingClientRect()
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      swatch: getComputedStyle(dot.parentElement).getPropertyValue('--swatch').trim(),
    }
  }, [])
  /*
   * The dot that was PRESSED, read at the press: once chosen, its pill grows and the row moves, so a
   * dot read later sits somewhere the visitor never touched (the first still wipe began with no size
   * for the same reason, 2026-10-19). A keyboard pick reads the chosen dot instead.
   */
  const pressed = useRef<PickedFrom | null>(null)
  const pickedFrom = useCallback(
    () =>
      pressed.current ??
      dotFrom(pick.current?.querySelector<HTMLElement>('[aria-checked="true"] > i')),
    [dotFrom],
  )
  const choose = (index: number) => {
    const dot = pick.current
      ?.querySelectorAll<HTMLElement>('.proof__pill')
      [index]?.querySelector<HTMLElement>('i')
    pressed.current = dotFrom(dot)
    setChosen(index)
  }
  /*
   * With the 3D off, the old picture soaks away the same way (dyePlayer.ts; owner, 2026-10-19, as the
   * 3D garment's colour does). Not under a shown model, which covers the still: a dye there would draw
   * the old picture around the garment's edges.
   */
  const frame = useRef<HTMLSpanElement>(null)
  const stillDye = useRef<HTMLCanvasElement>(null)
  const stillRun = useRef<DyeRun | null>(null)
  const dyeStill = () => {
    stillRun.current?.cancel()
    stillRun.current = null
    const box = frame.current
    const canvas = stillDye.current
    const old = box?.querySelector('img')
    if (!box || !canvas || !old?.complete || !old.naturalWidth) return
    if (box.closest('.proof__figure')?.querySelector('.live-garment[data-phase="shown"]')) return
    const picked = pressed.current
    stillRun.current = playDye({
      layer: canvas,
      old,
      point: pointIn(canvas, picked),
      swatch: picked?.swatch || null,
      kind: 'full',
      timing: readDyeTiming((token) => getComputedStyle(canvas).getPropertyValue(token)),
    })
  }
  useEffect(() => () => stillRun.current?.cancel(), [])
  const { shown, leaving } = useArrivingStill(still, dyeStill)
  // Fetch every colour's picture once the visitor reaches for the colours, so a pick has its picture.
  const warmed = useRef(false)
  const warm = () => {
    if (warmed.current) return
    warmed.current = true
    for (const each of colours) {
      if (each.image?.url) new Image().src = each.image.url
    }
  }

  return (
    <>
      <div className="proof__copy">{children}</div>
      {product ? (
        <figure className="proof__figure">
          <a className="proof__link" href={`${garmentPages}/${product.slug}/${colour?.slug ?? ''}`}>
            <span className="proof__frame" ref={frame}>
              {/* The leaving picture keeps its key, so it stays the very element already drawn:
                  remounted, Firefox drew no picture at all for a frame (measured 2026-10-17, and
                  again 2026-10-26 when this hand-off was first dropped). */}
              {leaving?.src ? (
                <ProductPoster key={leaving.key} src={leaving.src} alt="" leaving />
              ) : null}
              {shown.src ? (
                <ProductPoster key={shown.key} src={shown.src} alt={shown.alt} />
              ) : (
                <span className="product-card__placeholder">[ 3D reference ]</span>
              )}
              {/* The old colour soaking away (dyeStill, above); silent, as the picture names it. */}
              {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas has no tabindex and takes no focus (as LiveGarment.tsx's). */}
              <canvas className="dye-layer" ref={stillDye} aria-hidden="true" />
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
          {live ? (
            <LiveGarment model={live} label={label} variant={variant} from={pickedFrom} />
          ) : null}
        </figure>
      ) : null}
      {product && colours.length > 1 ? (
        <ColourPills
          colours={colours}
          chosen={chosen}
          onChoose={choose}
          onReach={warm}
          pickRef={pick}
        />
      ) : null}
      {product && details && details.rows.length > 0 ? (
        <div className="proof__details">
          <p className="proof__label">
            {details.type ? `This reference · ${details.type}` : 'This reference'}
          </p>
          <dl className="proof__specs">
            {details.rows.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div className="proof__actions">{actions}</div>
    </>
  )
}

/** The picture under the garment: which, from where, and its words. */
type Still = { key: string; src: string | null; alt: string }

/**
 * ⚠️ A NEW COLOUR'S PICTURE ARRIVES OVER THE OLD ONE, NEVER OVER AN EMPTY BOX (home page audit,
 * 2026-10-17). The still was keyed by colour, so a pick threw the old picture away and drew a new,
 * lazy one: with the 3D off (data saver, 2G, a failed load), the box stood empty and white for
 * 0.4–1.2 s on the live site. Now the old picture stays until the new one is fetched and decoded;
 * then `beforeArrive` lays the old one over it to soak away (owner, 2026-10-19), and the new one is
 * shown. The old element stays over the new one for two frames, because a newly drawn picture is
 * blank for a frame in Firefox. A picture that fails to load still arrives, and ProductPoster draws
 * its placeholder.
 */
function useArrivingStill(
  still: Still,
  beforeArrive: () => void,
): { shown: Still; leaving: Still | null } {
  const [shown, setShown] = useState(still)
  const [leaving, setLeaving] = useState<Still | null>(null)
  const current = useRef(shown)
  current.current = shown
  const target = useRef(still)
  target.current = still
  const before = useRef(beforeArrive)
  before.current = beforeArrive

  useEffect(() => {
    if (still.key === current.current.key) return
    let alive = true
    const arrive = () => {
      if (!alive) return
      before.current()
      setLeaving(current.current)
      setShown(target.current)
    }
    if (!still.src) {
      arrive()
    } else {
      const image = new Image()
      image.src = still.src
      image.decode().then(arrive, arrive)
    }
    return () => {
      alive = false
    }
  }, [still.key, still.src])

  // The old element goes once the new one has had two frames to draw.
  useEffect(() => {
    if (!leaving) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setLeaving(null))
    })
    return () => cancelAnimationFrame(frame)
  }, [leaving])

  return { shown, leaving }
}

/** A dot's width until the row says otherwise (`--pill-dot`), and the room between two buttons. */
const DOT = 44
const GAP = 8

/**
 * The colours as a row of round buttons; the chosen one grows into a pill with its name (D43, the
 * owner's "growing pill", 2026-10-15). A radio group (WAI-ARIA APG, "Radio Group", read 2026-10-16):
 * Tab lands on the chosen colour, the arrows move and choose, wrapping at the ends, Space chooses.
 *
 * ⚠️ THE ROW MOVES BY `translate` (the options page measured 3 layout passes a change, against 199 for
 * a view transition). Each button is measured at its full width; an unchosen one is its dot, and the
 * chosen one takes its width while a `clip-path` grows it from the dot (site.css). Nothing outside the
 * row moves. A new font, a resized row or a renamed colour re-measures.
 *
 * ⚠️ A NAME THAT WOULD RUN OFF A PHONE WRAPS INSIDE ITS PILL. On a phone the dots are 36px wide (the
 * owner, 2026-10-16; `--pill-dot`), and the pill is held to the room they leave it, where a long
 * name takes up to three lines. Before the measure, and with scripting off, the row is a plain wrapping
 * row of the same buttons (`:not([data-measured])` in site.css).
 */
function ColourPills({
  colours,
  chosen,
  onChoose,
  onReach,
  pickRef,
}: {
  colours: readonly CardColour[]
  chosen: number
  onChoose: (index: number) => void
  /** The pointer or the keyboard has reached the colours: fetch their pictures now. */
  onReach: () => void
  /** The row's box, where №03 reads the chosen dot from. */
  pickRef: RefObject<HTMLDivElement | null>
}) {
  const titleId = useId()
  const row = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  // Each button's full width (dot and name on one line), and the row's width.
  const [natural, setNatural] = useState<number[] | null>(null)
  const [room, setRoom] = useState(0)
  const [dot, setDot] = useState(DOT)

  // A pointer over the row, or the keyboard arriving in it, fetches the colours' pictures.
  useEffect(() => {
    const element = row.current
    if (!element) return
    element.addEventListener('pointerenter', onReach)
    element.addEventListener('focusin', onReach)
    return () => {
      element.removeEventListener('pointerenter', onReach)
      element.removeEventListener('focusin', onReach)
    }
  }, [onReach])

  useEffect(() => {
    const element = row.current
    if (!element) return
    let alive = true
    const measure = () => {
      if (!alive) return
      // Each at its full width, its name drawn whole and nothing waiting on a transition (site.css).
      const widths = buttons.current.map((button) => {
        if (!button) return DOT
        const { width: before, transition } = button.style
        button.dataset.measuring = ''
        button.style.transition = 'none'
        button.style.width = 'max-content'
        const width = Math.ceil(button.getBoundingClientRect().width)
        button.style.width = before
        button.style.transition = transition
        delete button.dataset.measuring
        return width
      })
      // Unchanged widths are not set again, so a name that wraps cannot measure itself in a loop.
      setNatural((current) => (current && current.join() === widths.join() ? current : widths))
      setRoom(element.getBoundingClientRect().width)
      setDot(Number.parseFloat(getComputedStyle(element).getPropertyValue('--pill-dot')) || DOT)
    }
    measure()
    // The mono face arriving late widens every name; measure again once it is in.
    document.fonts?.ready.then(measure, () => undefined)
    /*
     * And whenever the row or a name changes size: a narrower screen leaves a pill less room, and a
     * browser translating the page rewrites the names (PostHog's replays caught translation on this
     * site, 2026-10-14), so a name measured in English would hold a German one to its width.
     */
    const resize = new ResizeObserver(measure)
    resize.observe(element)
    for (const button of buttons.current) {
      const name = button?.querySelector('span')
      if (name) resize.observe(name)
    }
    return () => {
      alive = false
      resize.disconnect()
    }
  }, [])

  // The widest a pill may be: the row less every other dot and gap.
  const most = Math.max(dot, room - (colours.length - 1) * (dot + GAP))
  const widths = natural?.map((width) => Math.min(width, most)) ?? null
  let x = 0
  const places = colours.map((_, index) => {
    const place = x
    x += (index === chosen ? (widths?.[index] ?? dot) : dot) + GAP
    return place
  })

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = (index + step + colours.length) % colours.length
    onChoose(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="proof__pick" ref={pickRef}>
      <p className="proof__label" id={titleId}>
        Colors
      </p>
      <div
        className="proof__pills"
        ref={row}
        role="radiogroup"
        aria-labelledby={titleId}
        data-measured={widths ? '' : undefined}
      >
        {colours.map((each, index) => {
          const paint = pillPaint(each.swatch)
          const style = {
            '--swatch': each.swatch ?? 'transparent',
            '--pill-text': paint.text,
            ...(widths
              ? { '--pill': `${widths[index]}px`, translate: `${places[index]}px 0` }
              : {}),
          } as CSSProperties
          return (
            <button
              key={each.slug}
              ref={(element) => {
                buttons.current[index] = element
              }}
              type="button"
              role="radio"
              aria-checked={index === chosen}
              tabIndex={index === chosen ? 0 : -1}
              className="proof__pill"
              data-surface={paint.surface}
              // Held narrower than its name on one line: the name wraps (three lines fit in 44px).
              data-wrap={(widths?.[index] ?? 0) < (natural?.[index] ?? 0) ? '' : undefined}
              onClick={() => onChoose(index)}
              onKeyDown={(event) => move(event, index)}
              style={style}
            >
              <i aria-hidden="true" />
              <span>{each.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
