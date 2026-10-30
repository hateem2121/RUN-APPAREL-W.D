/**
 * Which clicks start the loading line (NavProgress.tsx), as a pure function so vitest reaches it.
 *
 * ⚠️ WHY A LINE AT ALL (site check-up #3, 2026-10-22). A tap on a link inside the site is a client
 * navigation: the browser shows no progress for it, and the page answered it live (pageCache.mjs
 * never keeps an `rsc` request), 2.3 to 2.8 s in 4 of 5 FAQ → Home taps and 2 of 5 Home → Products
 * taps on the live site, with nothing moving. A buyer on an iPhone tapped the logo again and again.
 *
 * ⚠️ WHY NOT loading.js, the route-level fallback Next 16.3.8's docs prefer (useLinkStatus.md,
 * loading.md). A loading boundary starts the response before the page has run, so a page that
 * calls notFound() after it (journal and case-study slugs) would answer 200 with `noindex` instead
 * of its 404 (loading.md, "Status Codes"). This keeps every status code as it is.
 *
 * ⚠️ A CLICK COUNTS ONLY ONCE NEXT HAS CLAIMED IT. `<Link>` calls preventDefault() for a client
 * navigation; a plain link, a new tab or a download is left to the browser, which shows its own
 * progress. So this is read after the click has bubbled, and a click nobody prevented is never a
 * client navigation.
 */

export interface ClickLike {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** The `<a>` the click is inside, if any. */
  anchor: { href: string; target: string; hasDownload: boolean } | null
}

/** The address a click navigates to inside the site, or null when it starts nothing. */
export function clientNavigationTarget(click: ClickLike, here: URL): URL | null {
  if (!click.defaultPrevented || !click.anchor) return null
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey)
    return null
  if (click.anchor.hasDownload || (click.anchor.target && click.anchor.target !== '_self'))
    return null
  let to: URL
  try {
    to = new URL(click.anchor.href, here)
  } catch {
    return null
  }
  if (to.origin !== here.origin) return null
  // The same page, or only its #fragment: nothing will load.
  if (to.pathname === here.pathname && to.search === here.search) return null
  return to
}

/** Has the address bar reached the click's target? Only path and query count. */
export const arrived = (to: URL, now: URL) =>
  now.pathname === to.pathname && now.search === to.search

/**
 * Shown only after this, so a fast page never flashes it. 120 ms until 27 Oct (useLinkStatus.md
 * suggests ~100 ms); 400 ms since (faster-taps spec, Part 4, the owner's call), once taps were
 * answered from the shared store: Nielsen Norman Group shows no indicator for a wait under about
 * a second, and a tap that lands inside 0.4 s already feels immediate.
 */
export const NAV_PROGRESS_DELAY_MS = 400

/** Given up after this, so a navigation that was cancelled never leaves the line running. */
export const NAV_PROGRESS_GIVE_UP_MS = 15_000

/** One pick is 24 px tall, at least 3: the mark's own band at the preloader's size (D51). */
export const weavePicks = (height: number) => Math.max(3, Math.round(height / 24))

/** Picks start --stagger (40 ms) apart, spread over no more than --ui (220 ms); each lasts --ui. */
export function weaveSpread(picks: number) {
  const gap = picks > 1 ? Math.min(40, 220 / (picks - 1)) : 0
  return { gap, total: 220 + Math.round((picks - 1) * gap) }
}

/** The satin order: a pick's turn when stepping through by about 2n/5, as a 5-end satin steps by 2. */
export function satinOrder(picks: number): number[] {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  let step = Math.max(1, Math.round((picks * 2) / 5))
  while (gcd(step, picks) !== 1) step++
  const turn: number[] = []
  for (let k = 0; k < picks; k++) turn[(k * step) % picks] = k
  return turn
}
