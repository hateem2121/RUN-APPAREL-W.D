import type { ViewerProduct, ViewerColourway } from '@run-apparel/shared'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { headingWithAccent } from './SerifAccent'

interface ProductIdentityProps {
  product: ViewerProduct
  selected: ViewerColourway
  selectedIndex: number
  /** Beside the garment: the description shows three lines and "Read more" (polish D8). */
  clampDescription?: boolean
}

const STANDARD_DESCRIPTION =
  'This is a development reference, not a finished stock product. We can change the fabric, color, fit, trims, branding and performance details to suit your brand.'

/**
 * THE DESCRIPTION, AT THREE LINES BESIDE THE GARMENT (polish D8, owner-approved 2026-10-04).
 *
 * Beside the garment, the column holds the name, this paragraph, the colours and both contact
 * buttons. Live descriptions run to 454 characters, and from 2 Oct (VA-60) the whole block was
 * moved under the garment on any window under 800-880px tall rather than let a long one push
 * Email and WhatsApp off the screen, which left most laptops with no name beside the garment.
 * Three lines and "Read more" keep the column's height bounded instead, so the name stays.
 *
 * `-webkit-line-clamp` with its two companion properties (page.css): MDN "line-clamp" (modified
 * 2026-09-14) gives the unprefixed property as not Baseline and this form as supported
 * everywhere and staying so. The clipped lines are still read by a screen reader.
 *
 * The button shows only when the text is longer than three lines, measured, and re-measured
 * when the column changes width or the site's fonts arrive (a font swap can make three lines
 * four). The paragraph keeps its full text in the DOM either way.
 */
function Statement({ text, clamp }: { text: string; clamp: boolean }) {
  const id = useId()
  const paragraph = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const p = paragraph.current
    if (!clamp || !p || expanded) return
    const measure = () => setOverflows(p.scrollHeight > p.clientHeight + 1)
    measure()
    let live = true
    void document.fonts?.ready.then(() => {
      if (live) measure()
    })
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        live = false
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(p)
    return () => {
      live = false
      observer.disconnect()
    }
  }, [clamp, expanded])

  if (!clamp) return <p className="product-info__statement">{text}</p>
  return (
    <>
      <p
        id={id}
        ref={paragraph}
        className="product-info__statement"
        data-clamped={expanded ? undefined : ''}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          className="product-info__more"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </>
  )
}

/**
 * Who the garment is: its chips, its name, its description, its colour note.
 *
 * Split out of <ProductPanel> on 2026-08-21 because it now renders in one of two
 * places and the spec list does not. See `lib/useTwoColumnLayout.ts` for the
 * query, and <ProductIdentitySection> below for the wrapper.
 *
 * A FRAGMENT, deliberately. In the single-column layout these fields and
 * `.spec-list` share one `.product-info` section and its 16px gap, exactly as
 * they did before the split — giving this its own wrapper there would put
 * `.content`'s 32-64px grid gap between a description and the facts that belong
 * to it.
 */
export function ProductIdentityFields({
  product,
  selected,
  selectedIndex,
  clampDescription = false,
}: ProductIdentityProps) {
  return (
    <>
      <div className="product-info__labels">
        <span className="label">
          [ {product.category.toUpperCase()} / <span translate="no">{product.productCode}</span> ]
        </span>
        {/* Re-keyed so switching colourway cross-fades the label. */}
        <span className="label product-info__colour" key={selected.slug}>
          [ COLORWAY {String(selectedIndex + 1).padStart(2, '0')} /{' '}
          {selected.displayName.toUpperCase()} ]
        </span>
      </div>
      <h1 id="product-heading" className="display display--hero" translate="no">
        {/* 'first', not the default 'last'. Every product in this catalogue ends
            in its garment type, so the accent landed on "skinsuit" every time —
            the least distinctive word on the page — while the model name sat in
            plain uppercase beside it. Owner decision 2026-08-14. */}
        {headingWithAccent(product.productName, 'first')}
      </h1>
      {/*
        The garment's own description when the owner has written one, and the
        standard development-reference wording when they have not.

        ⚠️ THE FALLBACK IS NOT DEAD CODE. `shortDescription` was added on
        2026-08-17 and EVERY product that existed before then has none, so on the
        day this ships the fallback is what every page renders. Deleting it would
        silently strip the paragraph from the whole live catalogue.

        `||` rather than `??`, and deliberately — the CMS field is a textarea, so
        the likeliest way it goes missing is a human clearing it to an empty
        string rather than it being unset. Same reasoning as RETIRED_FALLBACK in
        App.tsx, which was written after exactly that bug.
      */}
      {/* Keyed by the garment, so another garment's text is measured afresh and starts closed. */}
      <Statement
        key={product.slug}
        text={product.shortDescription || STANDARD_DESCRIPTION}
        clamp={clampDescription}
      />
      {/*
        Moved out of <ColourwayTabs> on 2026-08-20, and into this component on
        2026-08-21 with the rest of the identity.

        It belongs to the product description rather than to the control: the
        colourway it qualifies is named two elements above, in
        `.product-info__colour`. In the two-column layout it now also sits
        directly above the swatch rail it describes, which is where it was
        originally reaching for — without the 31px it used to cost the garment
        on a phone.
      */}
      <p className="product-info__colour-note">
        These colorways are examples. We match your own colors to your requirements.
      </p>
    </>
  )
}

/**
 * The same fields, wrapped for the stage aside.
 *
 * ⚠️ EXACTLY ONE `.product-info` SECTION EXISTS AT A TIME — this one OR the one
 * <ProductPanel> renders, never both, because `useTwoColumnLayout()` chooses. Two
 * would mean two <h1> elements and two `id="product-heading"`, which is an invalid
 * document and would break `aria-labelledby` for whichever lost the race.
 *
 * `data-reveal` is deliberately ABSENT here and on <ProductPanel>'s section.
 * `startReveals()` scans `[data-reveal]` once at startup and observes what it
 * finds; a block that moves between parents on a resize is a NEW element created
 * after that scan, so it would never be observed, never receive `.is-inview`, and
 * stay at opacity 0 for the rest of the session. Removing the reveal removes the
 * failure mode rather than papering over it — and this content is the page's own
 * product name, which should be present on arrival rather than fading in.
 */
export function ProductIdentity(props: ProductIdentityProps) {
  return (
    <section
      className="product-info product-info--aside"
      aria-labelledby="product-heading"
      data-testid="product-identity-aside"
    >
      <ProductIdentityFields {...props} />
    </section>
  )
}
