/**
 * May a website link fetch its whole page ahead now that the visitor has shown intent (faster-taps
 * spec, Part 2)? A pure function, so vitest reaches every case; IntentLink.tsx asks it.
 *
 * ⚠️ ONLY PAGES NEXT DRAWS. `/products/<family>` and `/products/<garment>/<colour>` are drawn by
 * the viewer Worker (apps/cms/viewerForward.mjs), so a Next prefetch of them fetches nothing useful.
 * The garment cards have their own warming (faster-taps spec, Part 3).
 *
 * ⚠️ NEVER WHEN THE BROWSER ASKS TO SAVE DATA (`navigator.connection.saveData`): a buyer on a
 * metered phone plan pays for every byte fetched ahead.
 */
export interface IntentTarget {
  /** The link's resolved href. */
  href: string
  /** The page the visitor is on. */
  here: URL
  saveData: boolean
  /** The link carries a `download` attribute. */
  download: boolean
  /** The link's `target` attribute, if any. */
  target: string | null
}

const VIEWER_PAGES = /^\/products\/[^/]+/

export function shouldPrefetchOnIntent({
  href,
  here,
  saveData,
  download,
  target,
}: IntentTarget): boolean {
  if (saveData || download) return false
  if (target && target !== '_self') return false
  let to: URL
  try {
    to = new URL(href, here)
  } catch {
    return false
  }
  if (to.origin !== here.origin) return false
  if (VIEWER_PAGES.test(to.pathname)) return false
  // The same page, or only its #fragment: nothing would load.
  return !(to.pathname === here.pathname && to.search === here.search)
}

/**
 * The `prefetch` IntentLink hands `next/link`: the whole page once intent is shown, Next's own
 * default before. A link set to `prefetch={false}` stays unfetched either way (review of 27 Oct:
 * intent overrode it, which no caller relied on yet but any later one would have been surprised by).
 */
export function intentPrefetchProp<P>(intent: boolean, prefetch: P): P | boolean {
  if (prefetch === false) return false
  return intent ? true : prefetch
}
