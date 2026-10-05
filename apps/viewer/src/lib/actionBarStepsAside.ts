/**
 * The page's own main contact button the bar steps aside for (`<ContactSection>`).
 *
 * ⚠️ THE MAIN BUTTON, NOT THE WHOLE ROW, SINCE POLISH S10 (2026-10-04). The row was the bar's own
 * pair, Email Us and WhatsApp Us, until "Ask about this garment" joined it as the section's main
 * button; three buttons wrap onto two rows on a phone, and with the whole row watched the bar
 * stayed up while "Ask about this garment" was already wholly in view: two main buttons, leading
 * to two places, on one screen (e2e/copy.spec.ts, CT-08, measured at 390px in four engines). The
 * bar now goes the moment that button is clear of it, and fading reveals the row's other two.
 */
const IN_PAGE_CONTACT = '.contact__ask'

/** The page's footer, the website's own since VA-31; the bar steps aside while any of it shows. */
const FOOTER = '.site-footer'

/** Set on the bar while that button or the footer is on screen; `page.css` fades the bar out for it. */
export const TUCKED_ATTRIBUTE = 'data-tucked'

/**
 * How much of the pair counts as "on screen". 0.95 rather than exactly 1, so a sub-pixel of layout
 * rounding can never keep the bar up over a pair that is, to the eye, wholly in view.
 */
const ON_SCREEN = 0.95

/**
 * Fade the fixed contact bar away while the page's own contact buttons are on screen (since polish
 * S10, once their main button is; IN_PAGE_CONTACT says why), or the
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
 * carries the email and the WhatsApp number itself (and carried "Start an inquiry" until polish Q42
 * made the page's own section its one prompt), so the bar goes while ANY of the footer is above it
 * (owner's choice that day), and the page ends in the footer's colour. Since polish M2 (2026-10-04)
 * it ends AT the footer: with the bar always gone there, the room `.page` kept for it under the
 * footer was an empty band, and is gone (`page.css`). The footer's own watcher is
 * separate from the pair's, because "any of it" and "nearly all of it" are different thresholds.
 *
 * It only sets an attribute. The fade, and keeping a hidden bar out of the Tab order and the
 * accessibility tree, are CSS (`visibility` after the fade), so there is nothing here to get out of
 * step: no re-render, no timer. And `page.css` exempts a bar with focus inside it, so a keyboard
 * visitor standing on one of its buttons is never left on a button that vanished.
 *
 * ⚠️ THE FOOTER COUNTS ONLY WHEN IT IS ABOVE THE BAR. The bar covers the foot of the screen, so the
 * footer's observer has its bottom edge pulled up by the bar's own height, read from the bar and not
 * assumed (it grows with the visitor's text size and is 0 where the layout hides it —
 * `actionBarHeight.ts` has the numbers), and is rebuilt when that height changes.
 *
 * ⚠️ THE PAGE'S MAIN BUTTON COUNTS ONCE IT IS WHOLLY ON SCREEN, EVEN BEHIND THE BAR (polish S10,
 * 2026-10-04). It was measured against the bar's edge too, as the duplicate pair was (VA-54): the
 * bar went the moment the pair was clear of it, so the two never overlapped. "Ask about this
 * garment" leads somewhere else than the bar's Email Us, and with the bar's edge a button half
 * clear of it showed beside the bar, two main buttons on one screen (CT-08, e2e/copy.spec.ts). So
 * the bar now goes as soon as the button is on the screen at all, fading away from over it, and a
 * visitor sees one main button or the other, never both.
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
          // Oldest first; the newest says where the button is now.
          const latest = entries.at(-1)
          if (!latest) return
          pairShows = latest.intersectionRatio >= ON_SCREEN
          decide()
        },
        // The whole screen, not the bar's edge (the note above says why).
        { rootMargin: '0px', threshold: ON_SCREEN },
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
