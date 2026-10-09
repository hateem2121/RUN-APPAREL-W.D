/**
 * The arithmetic of the factory gallery's photo viewer (BUILD 8.5, the about-factory build,
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

/** The photo on screen and its neighbours either side: the only ones whose files are asked for. */
export function photosToLoad(index: number, count: number): Set<number> {
  return new Set([stepIndex(index, -1, count), index, stepIndex(index, 1, count)])
}
