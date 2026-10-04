/**
 * Holding the page still while a pop-up is open (polish audit F2 and F3, 2026-10-04).
 *
 * ⚠️ `overflow: hidden` STOPS A PERSON SCROLLING, NOT A SCRIPT, AND THE SMOOTH SCROLL IS A SCRIPT.
 * The HD picture is a base-ui dialog, and base-ui locks the page by writing `overflow: hidden` on
 * <html> or <body> (@base-ui/utils, useScrollLock), so the browser refuses the wheel. Lenis does
 * not refuse it: it takes the wheel event itself and moves the page with `scrollTo`, which overflow
 * does not stop. Measured in the audit's second check (2026-10-03): the page slid from 0 to 1,200px
 * behind the open picture, which covers the screen, so the visitor closed it somewhere else. The
 * phone menu had no lock at all, so the page scrolled behind it too (F3).
 *
 * Lenis asks its `virtualScroll` option before it does anything else with an event, and `false`
 * hands the event back to the browser untouched (lenis 1.3.26, dist/lenis.mjs, `onVirtualScroll`).
 * So both smooth scrolls ask `pageHeld` first, and the browser's own rule decides: a held page
 * stays still, and a list inside the pop-up still scrolls.
 */

/** As much of an element's inline style as a lock writes. */
interface Overflow {
  overflowX: string
  overflowY: string
}

/** As much of the page as these helpers touch. A browser's `document` satisfies it. */
export interface HoldablePage {
  readonly documentElement: {
    readonly style: Overflow & { scrollbarGutter: string }
    readonly clientWidth: number
  }
  readonly body: { readonly style: Overflow } | null
  readonly defaultView: {
    readonly innerWidth: number
    readonly CSS?: { supports(property: string, value: string): boolean }
    getComputedStyle(element: unknown): { readonly overflowX: string; readonly overflowY: string }
  } | null
}

const HELD = /^(?:hidden|clip)$/
/** An overflow that makes <html> its own scroll container (floating-ui's `isOverflowElement`). */
const OWN_SCROLLER = /auto|scroll|overlay|hidden|clip/

/**
 * Is a lock holding the page? Both locks here write it inline: base-ui's (on <html>, or on <body>
 * when <body> is the page's scroller) and `holdPage`'s. Read inline rather than computed, because
 * Lenis asks on every wheel event and a computed read can force the browser to restyle the page.
 */
export function pageHeld(page: HoldablePage): boolean {
  return (
    HELD.test(page.documentElement.style.overflowY) || HELD.test(page.body?.style.overflowY ?? '')
  )
}

/**
 * Hold the page still; returns the release. The same lock base-ui uses (@base-ui/utils,
 * useScrollLock):
 *
 * - `overflow: hidden`, BOTH axes, on the element the page's scrolling comes from: <html> when it
 *   has an overflow of its own, and <body> otherwise, because the page takes its overflow from
 *   <body> then. ⚠️ WebKit scrolls a page held any other way. Measured 2026-10-04, a wheel the
 *   smooth scroll had handed back moved the page 900px with only `overflow-y` hidden, on <html>
 *   (inline and computed `hidden`) and on <body> alike (apps/cms/e2e/siteBar.spec.ts): one axis
 *   hidden turns the other from `visible` into `auto`, and the page is still a scroller. This
 *   site's <html> has no overflow, so it is <body>.
 * - when a classic scrollbar is showing (Windows, Linux, a Mac set to always show them),
 *   `scrollbar-gutter: stable` on <html>, where the page reads it, keeps the bar's space, so
 *   nothing moves sideways. Overlay scrollbars (phones, most Macs) take no space.
 *
 * Where the space cannot be kept (a browser without `scrollbar-gutter`), it does not hold the
 * page: a page that jumps sideways as the menu opens is worse than one that can scroll behind
 * it. The page keeps its place either way.
 */
export function holdPage(page: HoldablePage): () => void {
  const html = page.documentElement
  const win = page.defaultView
  if (!win || !page.body) return () => {}
  const classicScrollbar = win.innerWidth - html.clientWidth > 0
  if (classicScrollbar && !win.CSS?.supports('scrollbar-gutter', 'stable')) return () => {}
  const own = win.getComputedStyle(html)
  const scroller = OWN_SCROLLER.test(own.overflowX + own.overflowY) ? html : page.body
  const before = {
    overflowX: scroller.style.overflowX,
    overflowY: scroller.style.overflowY,
    gutter: html.style.scrollbarGutter,
  }
  if (classicScrollbar) html.style.scrollbarGutter = 'stable'
  scroller.style.overflowX = 'hidden'
  scroller.style.overflowY = 'hidden'
  return () => {
    scroller.style.overflowX = before.overflowX
    scroller.style.overflowY = before.overflowY
    html.style.scrollbarGutter = before.gutter
  }
}
