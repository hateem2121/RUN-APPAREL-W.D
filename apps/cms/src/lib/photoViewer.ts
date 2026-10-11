/**
 * The arithmetic of the factory gallery's photo viewer (the about-factory build,
 * 2026-10-09). `FactoryPhotoViewer.tsx` draws; this decides which photo is on screen, what the
 * counter and the dialog's name say, and which photos are loaded. Kept out of the island so the
 * coverage floors measure it, and so the counter and the name cannot disagree.
 */

/** The photo `delta` steps from `index`, wrapping round both ends of `count` photos. */
export function stepIndex(index: number, delta: number, count: number): number {
  return (((index + delta) % count) + count) % count
}

/** What the counter shows: no captions (owner, 2026-10-05), only the place in the set. */
export function counterText(index: number, count: number): string {
  return `${index + 1} / ${count}`
}

/** The dialog's accessible name, which changes as the photo does. */
export function viewerTitle(index: number, count: number): string {
  return `Factory photo ${index + 1} of ${count}`
}

/**
 * The photo on screen, from how far the strip is scrolled: the nearer one mid-swipe, held to the
 * set. A strip not laid out yet (0 wide) is on its first photo.
 */
export function indexFromScroll(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)))
}

/**
 * What the viewer does once a slide it started has come to rest: done (it is where it was sent),
 * ask once more, or give up and name the photo on screen. `retried` is whether this rest follows
 * the one more try.
 *
 * ⚠️ A BROWSER CAN CANCEL THE SLIDE (2026-10-12). Firefox 157 put the strip back on the photo it
 * was leaving mid-slide, after the next photo's <img> joined the strip (CSS Scroll Snap 1 §4.1.3
 * re-snaps after a layout change), and the viewer, still waiting for the slide, said "4 / 8" over
 * photo 3. Chromium 156, with the slide cancelled on purpose, rested 8px off any photo. One more
 * try finishes what the visitor asked for; a second cancel means the browser will not go there, and
 * the counter must not name a photo the visitor cannot see, so it follows the strip. Never a loop.
 */
export function afterSlideRest(
  heading: number,
  scrollLeft: number,
  slideWidth: number,
  count: number,
  retried: boolean,
): { retry: boolean; index: number } {
  if (Math.abs(scrollLeft - heading * slideWidth) < 2) return { retry: false, index: heading }
  if (!retried) return { retry: true, index: heading }
  return { retry: false, index: indexFromScroll(scrollLeft, slideWidth, count) }
}

/** The photo on screen and its neighbours either side: the only ones whose files are asked for. */
export function photosToLoad(index: number, count: number): Set<number> {
  return new Set([stepIndex(index, -1, count), index, stepIndex(index, 1, count)])
}
