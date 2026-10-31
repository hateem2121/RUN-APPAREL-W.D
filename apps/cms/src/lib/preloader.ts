/**
 * The first-arrival curtain on every website page (P2 + N1, D51; /about only from 2026-10-09 until
 * 31 Oct): the RUN mark woven by the page's real files, with the year counting 1889 to this year.
 * A covered hero picture still counts as the largest paint: measured live on Home, Slow 4G, 1,268 ms
 * with and without a curtain, and 4,104 ms when the page itself is hidden (control).
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

/** The curtain never lifts before this, so the counter is seen, not flashed. */
export const PRELOADER_FLOOR_MS = 800

/** And never later than this, however slow the photo; the CSS fallback lifts here too. */
export const PRELOADER_CEILING_MS = 3000

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

/** Where the counter starts: the year in `LINEAGE`, never typed here (facts come from constants). */
const FROM_YEAR = Number(FAMILY_SINCE)

/**
 * The first-arrival driver (P2 + N1, D51). It runs inline because the page's scripts are the very
 * thing being counted: one value, the share of first-screen files finished (stylesheets, scripts,
 * pictures on the first screen), drives the year, the percent and the mark's five bands. Finished
 * files, because counting bytes in a script downloaded everything twice (measured 29 Oct).
 */
const DRIVER =
  "var H=document.documentElement,F=0,Y=new Date().getFullYear(),S=__FROM__,q=function(s){return document.querySelector(s)},tick=function(){var t=performance.now(),a=document.querySelectorAll('link[rel=stylesheet],script[src]'),n=0,d=0,i;for(i=0;i<a.length;i++){n++;if(performance.getEntriesByName(a[i].href||a[i].src).length)d++}var m=document.images;for(i=0;i<m.length;i++){if(m[i].getBoundingClientRect().top<innerHeight){n++;if(m[i].complete)d++}}var f=document.readyState==='complete'?1:n?Math.min(.95,d/n):0;F=Math.max(F,f);var y=q('.preloader__year'),p=q('.preloader__pct'),r=document.querySelectorAll('.preloader .loom-mark__pick');if(y)y.textContent=String(Math.floor(S+(Y-S)*F));if(p)p.textContent=Math.floor(F*100)+'%';for(i=0;i<r.length;i++)r[i].style.transform='scaleX('+Math.min(1,Math.max(0,5*F-i))+')';if((F>=1&&t>=FLOOR)||t>=CEIL){if(y)y.textContent=String(Y);H.setAttribute('data-preload','lifting');setTimeout(function(){H.removeAttribute('data-preload')},600);return}setTimeout(tick,100)};requestAnimationFrame(tick)"
    .replace('__FROM__', String(FROM_YEAR))
    .replace('FLOOR', String(PRELOADER_FLOOR_MS))
    .replace('CEIL', String(PRELOADER_CEILING_MS))

export const PRELOADER_BOOT_SCRIPT =
  "(()=>{try{if(navigator.webdriver)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var n=performance.getEntriesByType('navigation')[0];if(n&&n.type!=='navigate')return;var r=document.referrer;if(r){try{if(new URL(r).host===location.host)return}catch(e){}}document.documentElement.setAttribute('data-preload','on');" +
  DRIVER +
  '}catch(e){}})()'

/**
 * The year the counter shows `elapsed` ms in, landing on `to` exactly when the curtain lifts, so it
 * never stalls on the final year while it waits. Ease-out (fast, then settling into
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
