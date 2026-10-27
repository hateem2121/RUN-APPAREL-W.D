/**
 * The website's one speculation rule (faster-taps spec, Part 3), rendered by the site layout as
 * `<script type="speculationrules">`. When a finger or a mouse presses a garment card, Chrome
 * fetches that garment page's document, so the page the click opens is already in hand.
 *
 * WHY THESE THREE CHOICES (measured 27 Oct, Chromium, a throwaway local server):
 * - `conservative`: the fetch starts on the press itself, so only a garment the visitor is about
 *   to open is fetched. Chrome keeps two such fetches at a time, oldest dropped first.
 * - prefetch, never prerender: a prerender would run the garment page's scripts, which count a
 *   page view (apps/viewer/src/App.tsx, `viewer_page_loaded`) for a visit that may not happen. A
 *   prefetch fetches the document only.
 * - the garment page's own `Cache-Control: public, max-age=0, must-revalidate` does not stop the
 *   prefetched copy being used: the navigation reported `deliveryType: 'navigational-prefetch'`
 *   and the server saw one request, the one marked `Sec-Purpose: prefetch`.
 *
 * Other browsers ignore the script. A pattern starting with `/` is read against the page's own
 * address, so it matches the cards' full `https://wear-run.com/products/…` links on the live site.
 */
export const GARMENT_PREFETCH_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: '/products/*/*' }, eagerness: 'conservative' }],
})
