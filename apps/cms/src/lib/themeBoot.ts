/**
 * A returning visitor's light/dark choice, applied BEFORE the first paint (audit XS-05,
 * 2026-09-24).
 *
 * The site follows the phone's theme through `light-dark()` until the visitor presses the
 * switch in the bar; the press stores the choice under this key and sets `data-theme` on
 * <html>. Without this script the NEXT page would paint in the phone's theme and flip after
 * hydration — a flash on every page load, for exactly the visitor who asked for the other
 * theme. The viewer does the same in apps/viewer/index.html, under the same key.
 *
 * ⚠️ INLINE, AND SAFE HERE. The public pages' script guard (worker.mjs, SE-04) stamps a fresh
 * nonce on every <script> of the five public pages and the 404, so this runs under the strict
 * policy; apps/cms/e2e/csp-nonce-edge.mjs proves it on an OpenNext build.
 * ⚠️ READ-ONLY. It never writes: a plain visit must leave nothing on the device
 * (e2e/headers.spec.ts), which is why this site needs no consent banner.
 */
export const THEME_STORAGE_KEY = 'run-theme'

export const THEME_BOOT_SCRIPT = `(()=>{try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`
