/**
 * The arithmetic behind a gallery card's colour strip (`components/site/CardGallery.tsx`),
 * kept out of the component so it can be tested without a browser.
 *
 * The strip is a CSS scroll-snap row with one full-width slide per colour, so the slide a
 * visitor is looking at is simply how far the row has scrolled, in slide widths.
 */

/**
 * Which slide is showing, from the row's scroll position.
 *
 * ⚠️ ROUNDED, NOT FLOORED. Mid-swipe the row sits between two slides, and the dot and the
 * card's link should follow the slide that covers more of the frame — flooring would keep
 * pointing at the previous colour until the new one had fully landed. `Math.abs` because a
 * right-to-left page reports NEGATIVE `scrollLeft` in every current engine.
 */
export function slideAt(scrollLeft: number, slideWidth: number, count: number): number {
  if (count <= 0 || !(slideWidth > 0) || !Number.isFinite(scrollLeft)) return 0
  const index = Math.round(Math.abs(scrollLeft) / slideWidth)
  return Math.min(Math.max(index, 0), count - 1)
}

/**
 * One colour on, either way, round from the last to the first: counted from where a glide is
 * going (`heading`) while one is under way, else from the colour showing (`active`).
 */
export function stepColour(
  heading: number | null,
  active: number,
  by: number,
  count: number,
): number {
  return ((heading ?? active) + by + count) % count
}

/**
 * After the strip scrolls: the colour the dots and the card's link should follow (`show`, or null
 * to keep the one showing), and where a glide a dot or an arrow started is still `heading`. A null
 * `heading` means nothing is gliding the strip: a finger, the wheel or a key moved it, so the
 * gallery follows it. `at` is the slide the strip reads now (`slideAt`).
 *
 * ⚠️ A GLIDE ENDS WHEN THE STRIP COMES TO REST, NOT WHEN IT FIRST READS ITS COLOUR (VA-30; main,
 * CI run 38142934506, 11 Oct 2026). A smooth scroll sent somewhere new keeps its speed. Sent back
 * to the first colour at 166px, Firefox's strip read the first colour at 182px on its way out to
 * 207px, past halfway, and only then turned round. Ending the glide on that reading let the next
 * one show the second colour, and a second "previous" counted back from there: to the first colour
 * instead of round to the last. Chromium and WebKit carry on too (10–58px measured); Firefox's
 * slower glide is the one that crossed halfway. So while a glide is under way no colour it passes
 * is shown, and once the browser reports the strip at rest (`scrollend`) the gallery shows where
 * it rests, even short of where it was sent: the dots follow the picture.
 *
 * A browser that never reports a rest (`scrollend` is Baseline only since December 2025, per MDN)
 * keeps the rule from before: the glide ends when the strip reads its colour.
 */
export function afterScroll(
  heading: number | null,
  at: number,
  { rested, restsReported }: { rested: boolean; restsReported: boolean },
): { heading: number | null; show: number | null } {
  if (heading === null || rested || (!restsReported && at === heading)) {
    return { heading: null, show: at }
  }
  return { heading, show: null }
}

/**
 * How many frames in a row a strip must stand still before a glide the gallery started counts as
 * at rest when the browser sends no `scrollend` (Chromium 153 sent none in 6 of 6 strands,
 * 11 Oct 2026). 12 frames found every rest in Chromium, Firefox and WebKit in that day's probe
 * (18 tries each, presses 0, 8 and 16ms apart), and a gliding strip moves on every frame, so none
 * was a glide caught mid-way.
 */
export const REST_FRAMES = 12

/**
 * Where a strip that has come to rest BETWEEN two pictures should settle: the picture it shows
 * (`slideAt`), or null when it already rests on one, within a pixel either way.
 *
 * ⚠️ FIREFOX AND CHROMIUM CAN LEAVE A MANDATORY SNAP STRIP BETWEEN TWO PICTURES (11 Oct 2026).
 * "Next" then "previous" 8ms apart: the compositor had glided the strip a few pixels while the
 * page still read 0, so "previous" asked for 0, the position the page thought it was at. CSSOM View
 * aborts the first glide; the second went nowhere. Firefox 155 rested 2–14px into the second
 * picture (13 of 16 tries at 8ms; Mozilla bug 1959811 reports the family); Chromium 153 rested
 * 2px in, 6 of 6, and sent no `scrollend` (hence `REST_FRAMES`). WebKit 26.6 never did. CSS Scroll Snap
 * 1 says a mandatory strip "is required to be snapped to a snap position when there are no active
 * scrolling operations", so the gallery finishes the move when the browser does not.
 *
 * `slideWidth` must be the strip's real layout width, fractions included (its computed width, which
 * no press-scale transform touches): a card 365.6px wide reports `clientWidth` 366, and measured in
 * slides of 366 the fifth picture would read 1.6px off for ever, so every correction would start
 * another.
 */
export function restingTarget(
  scrollLeft: number,
  slideWidth: number,
  count: number,
): number | null {
  if (count <= 0 || !(slideWidth > 0) || !Number.isFinite(scrollLeft)) return null
  const at = slideAt(scrollLeft, slideWidth, count)
  return Math.abs(Math.abs(scrollLeft) - at * slideWidth) > 1 ? at : null
}

/** One colour's garment page, `<GARMENT_PAGES>/<product>/<colour>` — the address printed on the QR tags. */
export function colourHref(garmentPages: string, productSlug: string, colourSlug: string): string {
  return `${garmentPages}/${productSlug}/${colourSlug}`
}

/**
 * The slides whose pictures may load: those already loaded, plus the showing slide and its
 * two neighbours. Neighbours, so the next swipe in either direction lands on a picture that
 * is already there. Never unloads — a picture the visitor has seen stays put.
 * `CardGallery.tsx` has the measurement that makes this necessary.
 */
export function slidesToLoad(
  loaded: ReadonlySet<number>,
  around: number,
  count: number,
): ReadonlySet<number> {
  const next = new Set(loaded)
  for (const slide of [around - 1, around, around + 1]) {
    if (slide >= 0 && slide < count) next.add(slide)
  }
  return next
}
