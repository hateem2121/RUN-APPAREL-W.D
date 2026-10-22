/**
 * Marks each box `data-edge="on"` while it reaches the screen's foot and `"off"` once it does not,
 * so CSS can make a full-width sticky box `visibility: hidden` while it is away from the foot.
 *
 * ⚠️ WHY (2026-10-20, again 2026-10-22). iOS 26 Safari colours the strip under its bottom pill
 * from the fixed or sticky box at the screen's foot, and when none is there it KEEPS the last one's
 * colour for as long as that box is still `visibility: visible` (WebKit,
 * Page::updateFixedContainerEdges, read 2026-10-20). The order steps left the strip ink over paper
 * (2026-10-20); the About page's sticky hero left it paper under the dark footer in the Compact
 * layout (site check-up, 2026-10-22: 362 of 441 apart, iOS 27.0 simulator). The box itself paints
 * nothing, and the CSS keeps its children `visible`, so not one pixel moves and Safari lets go.
 *
 * The band is the last 1% of the screen; WebKit's hit test is 4px above the foot.
 */
export const FOOT_BAND = '-99% 0px 0px 0px'

type Observe = (
  callback: IntersectionObserverCallback,
  options: IntersectionObserverInit,
) => Pick<IntersectionObserver, 'observe' | 'disconnect'>

const browserObserver: Observe = (callback, options) => new IntersectionObserver(callback, options)

/** Starts following `boxes`; the returned function stops and clears every mark. */
export function followFootEdge(
  boxes: readonly HTMLElement[],
  observe: Observe = browserObserver,
): () => void {
  const edge = observe(
    (entries) => {
      for (const entry of entries) {
        ;(entry.target as HTMLElement).dataset.edge = entry.isIntersecting ? 'on' : 'off'
      }
    },
    { rootMargin: FOOT_BAND },
  )
  for (const box of boxes) edge.observe(box)
  return () => {
    edge.disconnect()
    for (const box of boxes) delete box.dataset.edge
  }
}
