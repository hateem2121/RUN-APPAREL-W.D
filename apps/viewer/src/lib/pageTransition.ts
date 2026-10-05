/** The part of the browser's `pageswap` event this reads; typed here, not from a DOM library. */
type PageSwap = Event & {
  viewTransition?: { skipTransition(): void; ready?: Promise<unknown> } | null
}

/**
 * Leaving a garment page stays instant (polish MO3, 2026-10-05).
 *
 * page.css opts this page in to cross-document view transitions so that a website card's picture
 * can grow into its loading screen. The opt-in covers both directions, and the website opts in
 * too, so without this every link OUT of a garment page — to the website, or to another garment —
 * would cross-fade the whole page, which nobody asked for. `pageswap` fires on the page being
 * left, before the browser takes its picture of it; skipping there means the next page simply
 * loads, as it always has (web.dev, "cross-document-transitions", read 2026-10-05).
 *
 * ⚠️ SKIPPING REJECTS THE TRANSITION'S `ready` PROMISE, so it is caught here. Nobody else holds it,
 * so the rejection went unhandled and Sentry's global handler reported it: VIEWER-E, "AbortError:
 * Transition was skipped. skipTransition() called", twice in the first half hour after #130
 * deployed (5 Oct 2026, r-wzu, a visitor in Pakistan leaving the page). The page itself left
 * normally; only the report was wrong.
 */
export function keepLeavingInstant(target: Window = window): void {
  target.addEventListener('pageswap', (event) => {
    const transition = (event as PageSwap).viewTransition
    if (!transition) return
    transition.skipTransition()
    transition.ready?.catch(() => {})
  })
}
