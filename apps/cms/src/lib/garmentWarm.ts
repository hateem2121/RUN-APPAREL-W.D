/**
 * The address a touched garment card warms (faster-taps spec, Part 3), or null. A pure function, so
 * vitest reaches every case; GarmentWarm.tsx asks it.
 *
 * WHY. On 26 Oct a card's garment loading screen lifted 4.1 s after the tap: the garment's data was
 * a miss in the store and took 3.7 s to draw, and the garment page asks for it only once its HTML
 * has arrived (apps/viewer/worker/apiPreload.ts). Asking at the touch starts that drawing about a
 * second earlier, in the buyer's own region.
 */
const GARMENT = /^\/products\/([^/]+)\/([^/]+)$/

/**
 * `siteOrigin` is seo.ts SITE_ORIGIN: a card links to the address printed on the QR tags, always
 * the site's own origin, while the page may be served from another (`next start` in the browser
 * tests, a local preview). The warm request itself always goes to the page's own origin.
 */
export function garmentWarmPath(
  href: string,
  here: URL,
  saveData: boolean,
  siteOrigin: string,
): string | null {
  if (saveData) return null
  let to: URL
  try {
    to = new URL(href, here)
  } catch {
    return null
  }
  if (to.origin !== here.origin && to.origin !== siteOrigin) return null
  const match = GARMENT.exec(to.pathname)
  return match ? `/__warm/garment/${match[1]}/${match[2]}` : null
}
