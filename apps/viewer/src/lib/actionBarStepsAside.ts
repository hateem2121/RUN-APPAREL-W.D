/** The in-page pair of contact buttons the bar steps aside for (`<ContactSection>`). */
const IN_PAGE_CONTACT = '.contact__buttons'

/** Set on the bar while that pair is on screen; `page.css` fades the bar out for it. */
export const TUCKED_ATTRIBUTE = 'data-tucked'

/**
 * How much of the pair counts as "on screen". 0.95 rather than exactly 1, so a sub-pixel of layout
 * rounding can never keep the bar up over a pair that is, to the eye, wholly in view.
 */
const ON_SCREEN = 0.95

/**
 * Fade the fixed contact bar away while the SAME two buttons are on screen in the page, and bring
 * it back when they scroll off (visual audit VA-54, 2026-10-02).
 *
 * ⚠️ THE DUPLICATE WAS ON SCREEN TOGETHER. At 402x874 and 375x667 the end of the page showed
 * "Develop this with us" with EMAIL US and WHATSAPP US under it, and the fixed bar at the foot of
 * the screen showed EMAIL US and WHATSAPP US again, at the same moment. `Contact.tsx` records why
 * both exist (the bar is the persistent conversion path on a phone; the page's own pair is what a
 * screen reader meets reading down); this keeps both and shows one at a time.
 *
 * It only sets an attribute. The fade, and keeping a hidden bar out of the Tab order and the
 * accessibility tree, are CSS (`visibility` after the fade), so there is nothing here to get out of
 * step: no state, no re-render, no timer. And `page.css` exempts a bar with focus inside it, so a
 * keyboard visitor standing on one of its buttons is never left on a button that vanished.
 *
 * ⚠️ THE BUTTONS COUNT ONLY WHEN THEY ARE ABOVE THE BAR. The bar covers the foot of the screen, so
 * a pair scrolled in underneath it is on screen and not usable. The observer's bottom edge is pulled
 * up by the bar's own height, read from the bar and not assumed (it grows with the visitor's text
 * size and is 0 where the layout hides it — `actionBarHeight.ts` has the numbers), and the observer
 * is rebuilt when that height changes. The bar then goes at the moment the pair is clear of it,
 * and the two never overlap.
 *
 * Fails open: with no `IntersectionObserver`, or no in-page pair, the bar simply stays.
 */
export function startActionBarStepsAside(bar: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const target = bar.ownerDocument.querySelector(IN_PAGE_CONTACT)
  if (!target) return () => {}

  let observer: IntersectionObserver | null = null
  let inset = -1
  const watch = () => {
    const next = Math.ceil(bar.getBoundingClientRect().height)
    if (next === inset) return
    inset = next
    observer?.disconnect()
    observer = new IntersectionObserver(
      (entries) => {
        // Oldest first; the newest says where the pair is now.
        const latest = entries.at(-1)
        if (latest) bar.toggleAttribute(TUCKED_ATTRIBUTE, latest.intersectionRatio >= ON_SCREEN)
      },
      { rootMargin: `0px 0px -${inset}px 0px`, threshold: ON_SCREEN },
    )
    observer.observe(target)
  }
  watch()
  const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(watch)
  resizes?.observe(bar)

  return () => {
    observer?.disconnect()
    resizes?.disconnect()
    bar.removeAttribute(TUCKED_ATTRIBUTE)
  }
}
