import type { ViewerProduct, ViewerColourway } from '@run-apparel/shared'
import { headingWithAccent } from './SerifAccent'

interface ProductIdentityProps {
  product: ViewerProduct
  selected: ViewerColourway
  selectedIndex: number
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
export function ProductIdentityFields({ product, selected, selectedIndex }: ProductIdentityProps) {
  return (
    <>
      <div className="product-info__labels">
        <span className="label">
          [ {product.category.toUpperCase()} / {product.productCode} ]
        </span>
        {/* Re-keyed so switching colourway cross-fades the label. */}
        <span className="label product-info__colour" key={selected.slug}>
          [ COLOURWAY {String(selectedIndex + 1).padStart(2, '0')} /{' '}
          {selected.displayName.toUpperCase()} ]
        </span>
      </div>
      <h1 id="product-heading" className="display display--hero">
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
      <p className="product-info__statement">
        {product.shortDescription ||
          'This is a development reference, not a finished stock product. We can change the fabric, colour, fit, trims, branding and performance details to suit your brand.'}
      </p>
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
        These colourways are examples. We match your own colours to your requirements.
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
