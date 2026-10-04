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
 *
 * ⚠️ `orientation: landscape` ON THE FIRST CLAUSE SINCE 2026-10-04 (polish F11, owner's answer
 * Q23): an UPRIGHT tablet keeps the phone's one column. 1024x1366 (iPad Pro 12.9, upright) was
 * two columns by width alone, with the name below the screen; upright, the garment is on top and
 * the name under it, on the first screen (page.css shortens the garment for it).
 */
export const TWO_COLUMN_QUERY =
  '(min-width: 900px) and (orientation: landscape), (min-width: 700px) and (min-aspect-ratio: 3 / 2)'

/**
 * When the product's name and description move into `.stage__aside`.
 *
 * ⚠️ EVERY COMPUTER SINCE 2026-10-04 (polish D8, owner-approved; F11 / Q23 for tablets):
 * "garment on the left, everything else on the right, on every computer screen", and sideways
 * iPads from 1024px. It needed a window 800-880px tall until then (VA-60, below), which most
 * laptops are not (a browser on a 1440x900 screen shows about 760), so they all had the name
 * under the garment. What made the tall window necessary was a long description pushing Email
 * and WhatsApp off the screen; the description beside the garment now stops at three lines with
 * "Read more" (ProductIdentity.tsx), which bounds the column instead of the window.
 *
 *   (min-width: 1024px)         F11/Q23's line: a sideways iPad (1024x768 and up) is a computer.
 *   (min-height: 620px)         the measured floor below; it also keeps every sideways phone out
 *                               (they are 500px tall or less).
 *   (orientation: landscape)    an upright tablet keeps one column (TWO_COLUMN_QUERY).
 *
 * MEASURED 2026-10-04 with copy longer than any live garment's (`LONGEST_COPY` in
 * e2e/motion-and-layout.spec.ts: a 462-character description, a 26-character name, five two-part
 * colour names), the window height the column needs for Email and WhatsApp to be on screen:
 *
 *                                   Chromium / Firefox   WebKit (sets that name on 3 lines at some widths)
 *     dots + the chosen name             549-578              548-602
 *     names under the dots (1280+)       618-629              618-640
 *
 * So the name moves beside the garment from 620px of height, and the names under the dots show
 * from 656px (page.css), 18px and 16px clear of WebKit's worst. A 1366x768 laptop's window (about
 * 1366x657) gets both, and a 1280x720 one (about 1280x633) the first. Below 620px the name stays
 * under the garment, as on every laptop before: the residual is a window that short.
 *
 * WHAT FOLLOWS IS THE HISTORY OF THE TALL-WINDOW RULE, kept because its two lessons still hold:
 * measure with the worst content, and measure every engine (one sets the name on a line more than
 * the others: Firefox in VA-60's measurements, WebKit in D8's).
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
 * ⚠️ THAT SLACK WAS THE FIXTURE'S, AND THE LIVE CATALOGUE SPENT IT (visual audit VA-60,
 * owner decision 2026-10-02). The table above was measured with the fixture's
 * 145-character description; live descriptions run to 454 ("ARMOR-TECH JACKET") and live
 * names to 25 characters ("THE KINETIC MATRIX JACKET"), and from 1100 to 1280px wide and
 * 720 to 800px tall those garments pushed Email and WhatsApp below the screen — at
 * 1100x799 by 8px. Re-measured that day with copy longer than any live garment's (462 and
 * 26 characters, `LONGEST_COPY` in motion-and-layout.spec.ts), the height the column
 * needs for both buttons to stay on screen:
 *
 *     viewport width   Firefox   Chromium   WebKit
 *     1100-1150          865      808-811     721
 *     1200               842        789       721
 *     1250               808        760       721
 *     1280+              783        738       721
 *
 * Firefox sets the name on three lines where Chromium sets two. So the floor has two
 * steps, each clear of Firefox: 880px of height from 1100px wide, 800px from 1280px.
 * Shorter windows show the name and description under the garment, as narrower screens
 * always have.
 *
 * ⚠️ RESIDUAL, STATED RATHER THAN HIDDEN: a description much longer than 462 characters
 * would exceed even these floors. It degrades to the band growing and the page
 * scrolling — `justify-content: safe center` on the aside keeps the top of the stack
 * reachable — and the contact test then fails. If the identity gains a field, or the
 * catalogue's descriptions get materially longer, re-measure and move these numbers;
 * do not round either of them down.
 *
 * ⚠️ IT MUST STAY A SUBSET OF `TWO_COLUMN_QUERY`. `.product-info--aside`'s styles
 * — including the container-query heading size — live inside the two-column block
 * in page.css, so an identity rendered outside that block would be unstyled: a
 * 69px viewport-sized heading in a 260px column. The test asserts the subset
 * relation structurally rather than trusting this comment: each step of this list is
 * `(min-width: …)` of at least 900px narrowed with `and`.
 */
export const IDENTITY_IN_ASIDE_QUERY =
  '(min-width: 1024px) and (min-height: 620px) and (orientation: landscape)'

/**
 * TWO signals, and the second one is not belt-and-braces.
 *
 * ⚠️ A `matchMedia` CHANGE EVENT IS NOT GUARANTEED TO ARRIVE. Headless WebKit in CI
 * does not fire one when the viewport is resized: measured 2026-08-31, where
 * `motion-and-layout.spec.ts`'s "the product heading moves between columns" failed
 * on `viewer-mobile-safari` in two of three runs while passing 100% locally on the
 * same browser. The log is what proves it was THIS and not a slow render — the two
 * assertions before it passed, so the page had exactly one visible <h1>; it was
 * simply still in `.stage__aside` after the viewport had shrunk to 375x812, 13
 * polls and 5 seconds later.
 *
 * `useSyncExternalStore` re-reads ONLY when subscribe notifies it. No event, no
 * re-read, and the page's own <h1> stays in a column that no longer exists — the
 * same class of bug this hook was written to fix, one notification source over.
 *
 * The cost is a read, not a render: React calls `getSnapshot` on notification and
 * bails out when the value is unchanged. That matters here because this repo has
 * already measured `dvh` producing FOURTEEN resizes in a single phone swipe — so
 * this listener fires often and, all fourteen times, does nothing.
 */
function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(IDENTITY_IN_ASIDE_QUERY)
  list.addEventListener('change', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    list.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
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
