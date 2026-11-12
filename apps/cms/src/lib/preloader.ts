/**
 * The first-arrival curtain on every website page (P2 + N1, D51; /about only from 2026-10-09 until
 * 31 Oct): the RUN mark woven by the page's real files, with the year counting 1889 to this year.
 * A covered hero picture still counts as the largest paint: measured live on Home, Slow 4G, 1,268 ms
 * with and without a curtain, and 4,104 ms when the page itself is hidden (control); re-measured
 * 12 Nov 2026, 2,884 ms median both ways (4 runs each).
 *
 * ⚠️ WHO SEES IT, DECIDED BEFORE THE FIRST PAINT, AND NOTHING IS STORED (owner, 2026-10-09: "No
 * saving: arriving from outside"). The brief said to remember "already shown" in sessionStorage;
 * the privacy page promises a plain visit stores nothing (e2e/headers.spec.ts, FA-O-13), so it
 * remembers nothing. It shows on a fresh navigation from outside the site (a search, another site,
 * a typed address); not on a reload or a step back, not from the site's own pages, never under
 * reduced motion or automation, and not in a tab opened in the background (12 Nov 2026: it would
 * have played out unseen and then flashed). A move between the site's pages is a client navigation
 * that never runs this script, so it never shows then either.
 *
 * ⚠️ THE CLOCK STARTS WHEN THE CURTAIN FIRST PAINTS, NOT AT THE CLICK (12 Nov 2026, A1). It used
 * `performance.now()`, which counts from the request: live, the curtain painted 0.15–0.5 s in on a
 * fast line and 1.2–1.4 s in on Slow 4G, and that time came off its show (on screen 0.10–0.74 s;
 * the Factory page flashed for 0.1 s). And the year followed finished files in steps, so it jumped
 * (1889 → 1973 → 2026) and on Slow 4G froze at 1954–1971 when the ceiling lifted it (0 of 6 pages
 * reached this year). Now the shown value rolls toward real progress, never faster than the whole
 * roll in `--showpiece`, and the curtain lifts only on this year.
 *
 * ⚠️ A CONSTANT, BUILT LIKE themeBoot.ts. No template holes: nothing a visitor or the CMS sends
 * reaches it, and preloader.test.ts fails if one appears. worker.mjs stamps it with the page's
 * nonce at the edge (e2e/csp-nonce-edge.mjs proves it). The timing rules below are real functions
 * the tests call AND the script inlines with `String(fn)`, so the two cannot drift apart again:
 * until 12 Nov the tests checked two functions the page never ran. So each rule takes everything it
 * needs as parameters and uses no template literal (`${` would trip the constant check).
 */
import { FAMILY_SINCE } from './press'

/** The whole roll, 1889 to this year: `--showpiece` in tokens.css, the count-up's length (D26). */
export const PRELOADER_SHOWPIECE_MS = 1400

/** The longest the curtain waits for the page, from its first paint. */
export const PRELOADER_CEILING_MS = 3000

/** At the ceiling, or when the visitor acts, what is left of the roll plays in `--ui`. */
export const PRELOADER_FINISH_MS = 220

/** This year stays on screen this long before the lift, so the last number is seen, not flashed. */
export const PRELOADER_HOLD_MS = 150

/** The CSS fallback, if the script stalls: after the ceiling, the finish and a margin. */
export const PRELOADER_FALLBACK_MS = PRELOADER_CEILING_MS + PRELOADER_FINISH_MS + 600

export interface CurtainTiming {
  showpiece: number
  ceiling: number
  finish: number
  hold: number
  fallback: number
}

export const CURTAIN_TIMING: CurtainTiming = {
  showpiece: PRELOADER_SHOWPIECE_MS,
  ceiling: PRELOADER_CEILING_MS,
  finish: PRELOADER_FINISH_MS,
  hold: PRELOADER_HOLD_MS,
  fallback: PRELOADER_FALLBACK_MS,
}

/**
 * The shown share of the roll, 0 to 1, one frame on: toward `target`, never back, never faster than
 * the whole roll in `showpiece` (or in `finish` once `capped`). Rolling toward real progress rather
 * than drawing it is what stops the year jumping when several files land in one moment.
 */
export function stepShown(
  shown: number,
  target: number,
  dtMs: number,
  capped: boolean,
  timing: CurtainTiming,
): number {
  if (target <= shown) return shown
  const rate = dtMs / (capped ? timing.finish : timing.showpiece)
  return Math.min(target, shown + rate, 1)
}

/** Why the curtain lifts now, or null to keep it. It lifts only once this year is on screen. */
export function liftReason(
  input: { sinceAppearMs: number; ready: boolean; shown: number; interacted: boolean },
  timing: CurtainTiming,
): 'ready' | 'cap' | 'interaction' | null {
  if (input.shown < 1) return null
  if (input.interacted) return 'interaction'
  if (input.ready && input.sinceAppearMs >= timing.showpiece) return 'ready'
  if (input.sinceAppearMs >= timing.ceiling) return 'cap'
  return null
}

/**
 * The year for a shown share. Straight, not eased (12 Nov 2026): eased like the count-up, 95% of
 * the roll already read as this year, so the curtain claimed the final year while it was still
 * waiting for the page.
 */
export function counterYear(shown: number, from: number, to: number): number {
  return Math.round(from + (to - from) * Math.min(1, Math.max(0, shown)))
}

/** The percent beside it, from the same share, so the two land together (owner, 12 Nov 2026). */
export function curtainPercent(shown: number): number {
  return Math.round(Math.min(1, Math.max(0, shown)) * 100)
}

/** Where the counter starts: the year in `LINEAGE`, never typed here (facts come from constants). */
const FROM_YEAR = Number(FAMILY_SINCE)

/**
 * The driver. Real progress is the share of first-screen files finished (stylesheets, scripts and
 * the pictures that are not lazy), read every 250 ms from the list itself: no geometry, because
 * reading each picture's position 10 times a second cost 100 ms of layout on a slowed phone (Chrome
 * trace, 12 Nov 2026, A6). A picture counts once it has loaded and decoded, or failed. Ready means
 * every one of those, the fonts, and the whole document parsed: the curtain lifted 0.73 s before
 * the hero painted on a slowed phone when it went by files alone (A3). It holds at 95% until then.
 */
const DRIVER = [
  'var H=document.documentElement,Y=new Date().getFullYear(),S=__FROM__,T=__TIMING__,',
  'q=function(s){return document.querySelector(s)},',
  'stepShown=__STEP__,liftReason=__LIFT__,counterYear=__YEAR__,curtainPercent=__PCT__,',
  'A=null,L=null,F=null,shown=0,target=0,ready=false,acted=false,scanned=-1e9,done=false,',
  // Which pictures are off the first screen, from the browser's own drawing pass: no layout read
  // (A6). On a phone, /products had an eager card picture at 970px on an 844px screen and the curtain
  // waited for it (review M3, 13 Nov 2026). A picture not yet reported still counts.
  'io=typeof IntersectionObserver==="function"?new IntersectionObserver(function(es){for(var k=0;k<es.length;k++)es[k].target.__below=!es[k].isIntersecting}):null;',
  // Not `nomodule` scripts: Next puts a polyfill on every page that a modern browser never fetches,
  // and waiting for it held every visitor on every page to the 3 s ceiling (measured locally, 12 Nov).
  'function scan(t){scanned=t;var a=document.querySelectorAll("link[rel=stylesheet],script[src]:not([nomodule])"),n=0,d=0,i,m,ok=true;',
  'for(i=0;i<a.length;i++){n++;if(performance.getEntriesByName(a[i].href||a[i].src).length)d++;else ok=false}',
  'var g=document.querySelectorAll("img");for(i=0;i<g.length;i++){m=g[i];if(m.getAttribute("loading")==="lazy")continue;',
  'if(io&&!m.__io){m.__io=1;io.observe(m)}if(m.__below)continue;n++;',
  'if(m.complete){if(!m.naturalWidth)m.__rd=2;else if(!m.__rd){m.__rd=1;m.decode().then(function(){this.__rd=2}.bind(m),function(){this.__rd=2}.bind(m))}}',
  'if(m.__rd===2)d++;else ok=false}',
  'var f=!document.fonts||document.fonts.status==="loaded";',
  'ready=ok&&f&&document.readyState!=="loading";target=ready?1:Math.min(.95,n?d/n:0)}',
  'function paint(){var y=q(".preloader__year"),p=q(".preloader__pct"),r=document.querySelectorAll(".preloader .loom-mark__pick"),i;',
  'if(y)y.textContent=String(counterYear(shown,S,Y));if(p)p.textContent=curtainPercent(shown)+"%";',
  'for(i=0;i<r.length;i++)r[i].style.transform="scaleX("+Math.min(1,Math.max(0,5*shown-i))+")"}',
  // A key, a tap, a wheel or a touch ends the show (12 Nov 2026, A5): Tab had focused links hidden under it.
  // The tap itself is kept from the page. The curtain is `inert`, so the tap lands on whatever is under
  // it, and stopping `pointerdown` stops only the mouse events, not the click: a link under the curtain
  // was followed (review I1, proved with a planted link). So the click a curtain tap makes is caught on
  // its way down and stopped, and only that one: a click made by a key after the lift still works.
  'var EV=["keydown","wheel","touchstart"],tapped=false,act=function(){acted=true},',
  'tap=function(e){acted=true;tapped=true;e.preventDefault()},',
  'nab=function(e){if(!tapped)return;tapped=false;e.preventDefault();e.stopImmediatePropagation()},i0;',
  'for(i0=0;i0<EV.length;i0++)document.addEventListener(EV[i0],act,{passive:true});',
  'document.addEventListener("pointerdown",tap);document.addEventListener("click",nab,true);',
  // The click comes on release, which can be after the lift, so the catcher stays for the 600 ms fade.
  'function end(t,why,quiet){done=true;if(io)io.disconnect();for(i0=0;i0<EV.length;i0++)document.removeEventListener(EV[i0],act);document.removeEventListener("pointerdown",tap);',
  'setTimeout(function(){document.removeEventListener("click",nab,true)},600);window.__runCurtain={appearedAt:A,liftedAt:t,reason:why};',
  'if(quiet){H.removeAttribute("data-preload");return}',
  'H.setAttribute("data-preload","lifting");setTimeout(function(){H.removeAttribute("data-preload")},600)}',
  // Any fault inside a frame ends the curtain quietly (review I2): an uncaught one stopped the loop with
  // `data-preload="on"` and every listener above still in place, so each later tap and key was eaten.
  'function frame(t){if(done)return;try{step(t)}catch(e){end(t,"error",true)}}',
  'function step(t){if(A===null){A=t;L=t}var since=t-A,capped=acted||since>=T.ceiling;',
  // A tab sent to the back mid-show: the CSS fallback has played meanwhile, so leave without a second
  // wipe, but only once its own 220 ms exit is over (review M7): from 3820 ms it was cut short.
  'if(since>=T.fallback+T.finish){end(t,"cap",true);return}',
  'if(t-scanned>=250)scan(t);if(capped)target=1;shown=stepShown(shown,target,t-L,capped,T);L=t;paint();if(shown>=1&&F===null)F=t;',
  // This year stays on screen for a beat before the lift: 2026 was otherwise drawn in the lifting frame only.
  'var why=acted||(F!==null&&t-F>=T.hold)?liftReason({sinceAppearMs:since,ready:ready,shown:shown,interacted:acted},T):null;',
  'if(why){end(t,why,false);return}requestAnimationFrame(frame)}',
  'requestAnimationFrame(frame)',
]

/**
 * Fill the driver's `__NAME__` slots word for word. A replacement STRING given to `replace` reads
 * `$&`, `$'` and `` $` `` as patterns, so a function body holding one (a minifier's `$`-names can)
 * would have been inlined wrong (review M1, 13 Nov 2026); a replacement FUNCTION is taken as is.
 */
export function fillDriver(template: string, parts: Record<string, string>): string {
  let filled = template
  for (const [slot, text] of Object.entries(parts)) filled = filled.replace(slot, () => text)
  return filled
}

const FILLED_DRIVER = fillDriver(DRIVER.join(''), {
  __FROM__: String(FROM_YEAR),
  __TIMING__: JSON.stringify(CURTAIN_TIMING),
  __STEP__: String(stepShown),
  __LIFT__: String(liftReason),
  __YEAR__: String(counterYear),
  __PCT__: String(curtainPercent),
})

export const PRELOADER_BOOT_SCRIPT =
  "(()=>{try{if(navigator.webdriver)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(document.visibilityState==='hidden')return;var n=performance.getEntriesByType('navigation')[0];if(n&&n.type!=='navigate')return;var r=document.referrer;if(r){try{if(new URL(r).host===location.host)return}catch(e){}}document.documentElement.setAttribute('data-preload','on');" +
  FILLED_DRIVER +
  '}catch(e){}})()'

/** What the driver leaves on `window.__runCurtain` when the curtain lifts (in memory only). */
export interface CurtainRecord {
  appearedAt: number | null
  liftedAt: number
  reason: string
}

/** How long the curtain covered the page and why it left, for PostHog after Accept (F3). */
export function curtainReport(
  record: CurtainRecord | undefined,
): { shownMs: number; reason: string } | null {
  if (!record || record.appearedAt === null) return null
  return { shownMs: record.liftedAt - record.appearedAt, reason: record.reason }
}
