/** The in-page pair of contact buttons the bar steps aside for (`<ContactSection>`). */
const IN_PAGE_CONTACT = '.contact__buttons'

/** The page's footer, the website's own since VA-31; the bar steps aside while any of it shows. */
const FOOTER = '.site-footer'

/** Set on the bar while that pair or the footer is on screen; `page.css` fades the bar out for it. */
export const TUCKED_ATTRIBUTE = 'data-tucked'

/**
 * How much of the pair counts as "on screen". 0.95 rather than exactly 1, so a sub-pixel of layout
 * rounding can never keep the bar up over a pair that is, to the eye, wholly in view.
 */
const ON_SCREEN = 0.95

/**
 * Fade the fixed contact bar away while the SAME two buttons are on screen in the page, or the
 * footer is, and bring it back when they scroll off (visual audit VA-54, 2026-10-02; the footer
 * since 2026-10-03).
 *
 * ⚠️ THE DUPLICATE WAS ON SCREEN TOGETHER. At 402x874 and 375x667 the end of the page showed
 * "Develop this with us" with EMAIL US and WHATSAPP US under it, and the fixed bar at the foot of
 * the screen showed EMAIL US and WHATSAPP US again, at the same moment. `Contact.tsx` records why
 * both exist (the bar is the persistent conversion path on a phone; the page's own pair is what a
 * screen reader meets reading down); this keeps both and shows one at a time.
 *
 * ⚠️ AND OVER THE FOOTER THE BAR WAS A WHITE BLOCK (owner's iPhone screenshot, 2026-10-02). The
 * bar is paper, and iPhone Safari extends a fixed bar's colour into the strip behind its own
 * toolbar, so the dark footer ended in a block of paper a fifth of the screen tall. The footer
 * carries the email, the WhatsApp number and "Start an inquiry" itself, so the bar goes while ANY
 * of the footer is above it (owner's choice that day), and the page ends in the footer's colour:
 * `.page`'s room for the bar is painted that colour in `page.css`. The footer's own watcher is
 * separate from the pair's, because "any of it" and "nearly all of it" are different thresholds.
 *
 * It only sets an attribute. The fade, and keeping a hidden bar out of the Tab order and the
 * accessibility tree, are CSS (`visibility` after the fade), so there is nothing here to get out of
 * step: no re-render, no timer. And `page.css` exempts a bar with focus inside it, so a keyboard
 * visitor standing on one of its buttons is never left on a button that vanished.
 *
 * ⚠️ THE BUTTONS COUNT ONLY WHEN THEY ARE ABOVE THE BAR. The bar covers the foot of the screen, so
 * a pair scrolled in underneath it is on screen and not usable. The observer's bottom edge is pulled
 * up by the bar's own height, read from the bar and not assumed (it grows with the visitor's text
 * size and is 0 where the layout hides it — `actionBarHeight.ts` has the numbers), and the observer
 * is rebuilt when that height changes. The bar then goes at the moment the pair is clear of it,
 * and the two never overlap. The footer is measured against the same edge.
 *
 * Fails open: with no `IntersectionObserver`, or neither an in-page pair nor a footer, the bar
 * simply stays.
 */
export function startActionBarStepsAside(bar: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const pair = bar.ownerDocument.querySelector(IN_PAGE_CONTACT)
  const footer = bar.ownerDocument.querySelector(FOOTER)
  if (!pair && !footer) return () => {}

  let pairShows = false
  let footerShows = false
  const decide = () => bar.toggleAttribute(TUCKED_ATTRIBUTE, pairShows || footerShows)

  let observers: IntersectionObserver[] = []
  let inset = -1
  const watch = () => {
    const next = Math.ceil(bar.getBoundingClientRect().height)
    if (next === inset) return
    inset = next
    for (const observer of observers) observer.disconnect()
    observers = []
    const rootMargin = `0px 0px -${inset}px 0px`
    if (pair) {
      const observer = new IntersectionObserver(
        (entries) => {
          // Oldest first; the newest says where the pair is now.
          const latest = entries.at(-1)
          if (!latest) return
          pairShows = latest.intersectionRatio >= ON_SCREEN
          decide()
        },
        { rootMargin, threshold: ON_SCREEN },
      )
      observer.observe(pair)
      observers.push(observer)
    }
    if (footer) {
      const observer = new IntersectionObserver(
        (entries) => {
          const latest = entries.at(-1)
          if (!latest) return
          footerShows = latest.isIntersecting
          decide()
        },
        { rootMargin, threshold: 0 },
      )
      observer.observe(footer)
      observers.push(observer)
    }
  }
  watch()
  const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(watch)
  resizes?.observe(bar)

  return () => {
    for (const observer of observers) observer.disconnect()
    resizes?.disconnect()
    bar.removeAttribute(TUCKED_ATTRIBUTE)
  }
}
