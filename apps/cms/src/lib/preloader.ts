/**
 * The /about preloader (BUILD 8.4, the about-factory build, 2026-10-09): a counter from 1889 to this
 * year on the page's ground, lifted like a curtain once the hero photo is ready.
 *
 * ⚠️ WHO SEES IT, DECIDED BEFORE THE FIRST PAINT, AND NOTHING IS STORED (owner, 2026-10-09: "No
 * saving: arriving from outside"). The brief said to remember "already shown" in sessionStorage;
 * the privacy page promises a plain visit stores nothing (e2e/headers.spec.ts, FA-O-13), so it
 * remembers nothing. It shows on a fresh navigation from outside the site (a search, another site,
 * a typed address); not on a reload or a step back, not from the site's own pages, never under
 * reduced motion or automation. A move between the site's pages is a client navigation that never
 * runs this script, so it never shows then either.
 *
 * ⚠️ A CONSTANT, BUILT LIKE themeBoot.ts. No template holes: nothing a visitor or the CMS sends
 * reaches it, and preloader.test.ts fails if one appears. worker.mjs stamps it with the page's
 * nonce at the edge (e2e/csp-nonce-edge.mjs proves it).
 */
import { FAMILY_SINCE } from './press'

export const PRELOADER_BOOT_SCRIPT =
  "(()=>{try{if(navigator.webdriver)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var n=performance.getEntriesByType('navigation')[0];if(n&&n.type!=='navigate')return;var r=document.referrer;if(r){try{if(new URL(r).host===location.host)return}catch(e){}}document.documentElement.setAttribute('data-preload','on')}catch(e){}})()"

/** The curtain never lifts before this, so the counter is seen, not flashed (BUILD 8.4). */
export const PRELOADER_FLOOR_MS = 800

/** And never later than this, however slow the photo (BUILD 8.4); the CSS fallback lifts here too. */
export const PRELOADER_CEILING_MS = 2200

/**
 * When the curtain lifts, in ms from the start: the count-up's own length (`--showpiece`) when the
 * photo is ready early, the photo's moment when it is later, and never outside the floor and the
 * ceiling. `decodedAt` is null until the photo has decoded.
 */
export function preloaderLiftAt({
  decodedAt,
  showpiece,
}: {
  decodedAt: number | null
  showpiece: number
}): number {
  const ready = decodedAt ?? PRELOADER_CEILING_MS
  return Math.min(PRELOADER_CEILING_MS, Math.max(PRELOADER_FLOOR_MS, showpiece, ready))
}

/** Where the counter starts: the year in `LINEAGE`, never typed here (BUILD 5: facts from constants). */
const FROM_YEAR = Number(FAMILY_SINCE)

/**
 * The year the counter shows `elapsed` ms in, landing on `to` exactly when the curtain lifts, so it
 * never stalls on the final year while it waits (BUILD 8.4). Ease-out (fast, then settling into
 * the year), the shape of the site's `--ease-out-expo`, as the count-up rolls.
 */
export function counterYear({
  elapsed,
  liftAt,
  to,
}: {
  elapsed: number
  liftAt: number
  to: number
}): number {
  const progress = liftAt <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / liftAt))
  const eased = progress >= 1 ? 1 : 1 - 2 ** (-10 * progress)
  return Math.round(FROM_YEAR + (to - FROM_YEAR) * eased)
}
