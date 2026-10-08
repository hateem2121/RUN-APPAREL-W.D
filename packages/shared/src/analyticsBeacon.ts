/**
 * The Cloudflare Web Analytics beacon, started only for a person (findability audit, 2026-10-08).
 *
 * WHY. Read from Cloudflare Web Analytics that day: about 605 of 2,310 visits in a week came from
 * headless browsers, so the visitor count the owner reads was a quarter test robots. The cookie
 * card, the cursor, the count-up and the globe already step aside under `navigator.webdriver`
 * (`ConsentBanner.tsx` and the rest); the visit counter now does too, and for the two automation
 * user agents that name themselves.
 *
 * HOW. A tiny inline script adds the beacon instead of a static `<script src>`. Cloudflare's own
 * FAQ (Web Analytics, read 2026-10-08) gives the form for a beacon added by a script: the token
 * in the address, `beacon.min.js?token=…`, not in a `data-cf-beacon` attribute. The website's
 * pages stamp a nonce on every script (`apps/cms/worker.mjs`) and the garment page hashes every
 * inline script at build (`apps/viewer/scripts/csp.mjs`), so the loader needs nothing new from
 * either policy; the beacon it adds is admitted by its host, as before.
 *
 * ⚠️ TWO COPIES, ONE SOURCE. The website renders `beaconLoader(token)`; the garment page's
 * `index.html` is static, so it carries the same string typed out, and
 * `apps/viewer/src/analyticsBeacon.test.ts` fails the moment the two differ.
 */

/** Where the beacon comes from (its host is in both sites' script-src). */
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

/**
 * User agents that announce automation. `navigator.webdriver` covers Playwright, Puppeteer and
 * Selenium; these two name themselves in the user agent as well (HeadlessChrome is Chrome's
 * headless mode, Chrome-Lighthouse older Lighthouse runs). A regex SOURCE, embedded in the loader.
 */
export const AUTOMATION_UA = 'HeadlessChrome|Chrome-Lighthouse'

/**
 * The inline loader's source: add the beacon unless the browser is automated. It contains no `<`,
 * so it cannot close its own `<script>`, and the token goes through `encodeURIComponent` and
 * `JSON.stringify`, so a malformed one cannot break out of the string either.
 */
export function beaconLoader(token: string): string {
  const src = `${BEACON_SRC}?token=${encodeURIComponent(token)}`
  return `if(!navigator.webdriver&&!/${AUTOMATION_UA}/.test(navigator.userAgent)){const b=document.createElement('script');b.type='module';b.src=${JSON.stringify(src)};document.head.append(b)}`
}
