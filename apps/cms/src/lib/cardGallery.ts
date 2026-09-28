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

/** The 3D viewer URL for one colour — the same shape printed QR tags use. */
export function colourHref(viewerOrigin: string, productSlug: string, colourSlug: string): string {
  return `${viewerOrigin}/${productSlug}/${colourSlug}`
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
