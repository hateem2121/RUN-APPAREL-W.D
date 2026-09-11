/**
 * How a gallery poster loads, decided by its position in the grid (audit IM-05, PF-20).
 *
 * ⚠️ EVERY CARD WAS `loading="lazy"`, INCLUDING THE ONES ON SCREEN WHEN THE PAGE OPENS. A lazy
 * image waits for layout before it is requested, so the largest picture on the first screen —
 * the element Largest Contentful Paint times — started late. Lighthouse measured /products at
 * 4,012 ms LCP on a phone profile on 2026-09-11, against 2,688 ms for the home page.
 *
 * Only the FIRST card gets `fetchpriority="high"`: raising the priority of several images is
 * the same as raising none of them, and on a one-column phone the first card is the only one on
 * screen. Cards two and three are eager without a priority hint, because they share the first
 * row from tablet width up. Everything after that stays lazy — the browser still fetches the
 * next few early on its own, because its lazy threshold reaches well below the fold.
 */
export interface PosterLoading {
  loading: 'eager' | 'lazy'
  fetchPriority?: 'high'
}

/** The cards that can share the first row. The owner's brief names three. */
export const EAGER_POSTERS = 3

export function posterLoading(index: number): PosterLoading {
  if (index === 0) return { loading: 'eager', fetchPriority: 'high' }
  if (index < EAGER_POSTERS) return { loading: 'eager' }
  return { loading: 'lazy' }
}
