import { useSyncExternalStore } from 'react'

/**
 * The query `page.css` uses to build the stage band as two columns.
 *
 * Exported for ONE purpose: `useIdentityInAside.test.tsx` asserts that this exact
 * string appears in `page.css`, and that `IDENTITY_IN_ASIDE_QUERY` below is
 * strictly narrower than it. Nothing subscribes to this — the layout it describes
 * is entirely CSS's.
 *
 * The second clause is not redundant with the first: it catches a landscape phone
 * (844x390), which is wide enough in SHAPE for two columns while being narrower
 * than 900px. See the block it belongs to in page.css for the aspect-ratio
 * reasoning and the viewports it was verified against.
 */
export const TWO_COLUMN_QUERY =
  '(min-width: 900px), (min-width: 700px) and (min-aspect-ratio: 3 / 2)'

/**
 * When the product's name and description move into `.stage__aside`.
 *
 * ⚠️ NARROWER THAN `TWO_COLUMN_QUERY`, IN BOTH AXES, AND BOTH NUMBERS ARE
 * MEASURED. Two builds of this shipped a wrong floor before the third measured it,
 * and both failures looked the same from the code: the aside became the tallest
 * column, the band grew past the viewport, the garment was cut off at the fold and
 * the colourway rail and enquiry buttons went under it.
 *
 *   Keyed off TWO_COLUMN_QUERY alone -> 844x390 gave a 726px band in a 390px
 *     viewport. The layout query deliberately includes a landscape phone so that
 *     the CONTROLS can sit beside the garment in a ~320px band; a 312-character
 *     paragraph is a different question, and one query cannot answer both.
 *   A 700px height floor -> 900x700 gave a 729px band. The floor had been
 *     extrapolated from a single sample at 1024x768 rather than measured, and the
 *     requirement is not width-independent.
 *
 * MEASURED 2026-08-21 — the viewport height the aside's whole stack needs, at the
 * column width each viewport width produces:
 *
 *     viewport width   column   identity   rail   needs
 *      900             260px    484px      113px  797px
 *      960             271px    485px      113px  801px
 *     1000             282px    487px      113px  805px
 *     1024             289px    439px      113px  758px
 *     1100             310px    416px       53px  677px
 *     1280+            360px    399px       53px  664px
 *
 * The cliff between 1024 and 1100 is the colourway rail: below a ~300px column its
 * container query wraps five swatches onto TWO rows, which costs 60px at exactly
 * the width where the narrower column is already making the paragraph taller. That
 * is why the width floor is 1100 and not 1024 — 1024x768 fits by 10px, and a
 * ten-pixel margin on a layout whose inputs are a CMS textarea and a font is a
 * coincidence, not an invariant. Below the floor the identity stays in `.content`,
 * which is where it has always been and is not a degraded state.
 *
 * 720 rather than 677: 1100x720 leaves 43px of slack and 1280x720 leaves 56px.
 *
 * ⚠️ RESIDUAL, STATED RATHER THAN HIDDEN: a description roughly twice this one's
 * length would exceed even that slack. It degrades to the band growing and the
 * page scrolling — `justify-content: safe center` on the aside keeps the top of
 * the stack reachable — rather than to hidden product. If the identity gains a
 * field, or the catalogue's descriptions get materially longer, re-run
 * `probe-fit` and move these numbers; do not round either of them down.
 *
 * ⚠️ IT MUST STAY A SUBSET OF `TWO_COLUMN_QUERY`. `.product-info--aside`'s styles
 * — including the container-query heading size — live inside the two-column block
 * in page.css, so an identity rendered outside that block would be unstyled: a
 * 69px viewport-sized heading in a 260px column. The test asserts the subset
 * relation structurally rather than trusting this comment.
 */
export const IDENTITY_IN_ASIDE_QUERY = '(min-width: 1100px) and (min-height: 720px)'

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(IDENTITY_IN_ASIDE_QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(IDENTITY_IN_ASIDE_QUERY).matches
}

/**
 * True when the stage aside is the right home for the product's name and
 * description — wide enough to have a column, and tall enough to hold prose in it.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, for the reason
 * `useCoarsePointer.ts` records at length: the value is read DURING render — it
 * chooses which parent <ProductIdentity> mounts into — so a hook that only learns
 * the answer in an effect renders one frame with the block in the wrong place, and
 * on a resize that frame is a visible jump of the page's own <h1>.
 *
 * Rotating a tablet crosses this query in both axes, so it genuinely changes
 * mid-session; it is not a mount-time constant dressed up as a subscription.
 */
export function useIdentityInAside(): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    // Server snapshot. This SPA never server-renders, but the argument is
    // required. `false` is the safe default: it is the single-column placement,
    // the one that renders every element the page has rather than assuming an
    // aside exists to put them in.
    () => false,
  )
}
