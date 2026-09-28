import { SITE_HOST } from './siteHostRules.mjs'

/**
 * Which requests the website hands to the 3D viewer's Worker (domain move, 2026-09-28).
 *
 * Owner decisions that day: one site on one domain, the garment pages at
 * `/products/<product>/<colour>` inside the website's own address structure, and no
 * subdomain for the viewer. The viewer stays its own Worker (`run-apparel-viewer-site`,
 * Static Assets + the link-preview Worker); worker.mjs forwards these requests to it
 * through the `VIEWER` service binding BEFORE OpenNext sees them, so Next never renders
 * a garment page and the viewer's response — its own CSP from `_headers` included —
 * reaches the browser untouched.
 *
 * ⚠️ THE VIEWER'S FILES KEEP THEIR ROOT NAMES, and that is a choice, not an accident.
 * Moving them under a prefix would have touched the build, the service worker, the
 * `_headers` generator and every decoder path; the website shares none of these names
 * (checked by src/viewerForward.test.ts against both public folders, so a clash fails
 * CI rather than shadowing a file in production).
 */

/** Folders that only the viewer serves. */
export const VIEWER_FOLDERS = ['/assets/', '/basis/', '/draco/', '/env/', '/og/']

/** Single files that only the viewer serves. `sw.js` is emitted by its build, not public/. */
export const VIEWER_FILES = ['/meshopt_decoder.js', '/sw.js', '/favicon.svg', '/og-default.jpg']

/** `/products/<product>` or `/products/<product>/<colour>`, one optional trailing slash. */
const GARMENT_PAGE = /^\/products\/[^/]+(?:\/[^/]+)?\/?$/

/**
 * ⚠️ ONLY ON THE SITE'S OWN ADDRESS. The www. → apex redirect and the cms. host rules are
 * Next config (siteHostRules.mjs) and run INSIDE OpenNext; a forward from the wrapper
 * happens first, so forwarding on www. would serve the garment there instead of
 * redirecting, and cms. is the admin host.
 *
 * @param {URL} url
 * @returns {boolean}
 */
export function forwardsToViewer(url) {
  if (url.hostname !== SITE_HOST) return false
  const path = url.pathname
  return (
    GARMENT_PAGE.test(path) ||
    VIEWER_FOLDERS.some((folder) => path.startsWith(folder)) ||
    VIEWER_FILES.includes(path)
  )
}
