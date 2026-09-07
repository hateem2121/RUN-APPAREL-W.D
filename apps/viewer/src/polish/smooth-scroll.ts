import Lenis from 'lenis'
import { prefersReducedMotion } from '../lib/capabilities'
import { SCROLL_DURATION_S } from '../lib/motion'

/**
 * Buttery editorial smooth-scroll. Disabled entirely under reduced-motion and
 * automation. `data-lenis-prevent` on the 3D stage keeps model-viewer's
 * scroll-to-zoom working. Returns a teardown.
 */
let instance: Lenis | null = null

export function startSmoothScroll(): () => void {
  if (instance || typeof window === 'undefined') return () => {}
  if (navigator.webdriver || prefersReducedMotion()) return () => {}

  const lenis = new Lenis({
    autoRaf: true,
    duration: SCROLL_DURATION_S,
    // Gentle ease-out — calm, not springy.
    easing: (t: number) => 1 - (1 - t) ** 3,
    /**
     * ⚠️ MATCH THE BROWSER: a wheel event nobody rolled must not scroll the page.
     *
     * Audit FA-F-12. Lenis 1.3.26 contains no `isTrusted` anywhere in `dist/`, so it
     * acts on any `wheel` event that reaches `window` — and the browser's own wheel
     * handling does not. Measured 2026-09-07 on the built app, same page, same event
     * (`new WheelEvent('wheel', { deltaY: 4000 })` dispatched from page script):
     *
     *     Lenis running   scrollY 0 → 1090
     *     Lenis absent    scrollY 0 →    0
     *
     * **This is untidiness, not a vulnerability, and the same measurement is what
     * says so.** Dispatching an untrusted event requires script execution in this
     * origin, and `window.scrollTo(0, 500)` in that second page moved the document
     * to 500 — so the capability a synthetic wheel would "gain" is one any such
     * script already has. There is no cross-origin path either: a document cannot
     * dispatch events into another document. Do not re-file this as a security fix.
     *
     * It is closed anyway because the cost is one predicate and the benefit is that
     * the smooth layer stops being a behavioural difference from the platform it is
     * decorating. `virtualScroll` returning false cancels that event only.
     *
     * ⚠️ REAL SCROLLING IS UNTOUCHED, and each branch was checked rather than
     * assumed. Lenis passes only `WheelEvent | TouchEvent` here (the package's own
     * `dist/lenis.d.ts`), both of which are trusted when a person makes them;
     * Playwright's `page.mouse.wheel()` is trusted too (driver-injected), which is
     * the positive control in the guard. KEYBOARD scrolling never reaches this —
     * Lenis binds no key listener, which is why `audit-guards.spec.ts` → FA-F-10
     * passes with the smooth layer running. Touch is already native (audit FA-F-09).
     *
     * The one thing this DOES cost: a browser extension that scrolls by dispatching
     * synthetic wheel events stops working here. It already did not work on any page
     * without a smooth-scroll layer, which is the whole basis of this change, so the
     * page now behaves the same way as the rest of the web rather than better than it
     * for that one case.
     */
    virtualScroll: ({ event }) => event.isTrusted,
  })
  instance = lenis

  return () => {
    lenis.destroy()
    instance = null
  }
}
