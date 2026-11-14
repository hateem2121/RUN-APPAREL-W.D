import type { ViewerApiResponse } from '@run-apparel/shared'

/**
 * Read the payload the Worker put in the page, instead of fetching it again.
 *
 * Robots got one first (`worker/embeddedPayload.ts` has the 2026-10-21 Search Console
 * finding: Google's renderer sometimes fails the API request, the app then draws the
 * unreachable screen, and that screen's noindex kept eight garments out of Google). A person's page
 * carries one when the edge had the data within its budget (2026-11-15); otherwise the element is
 * absent and this returns null on the first line.
 *
 * Used ONCE: the element is removed when read, so a retry or a colourway change fetches
 * fresh, exactly as it did before. A payload for a different request (`data-path` is the
 * `viewerApiPath` the Worker asked the CMS for) or one that does not parse is ignored, and
 * the app fetches as it always has: the worst case is yesterday's behaviour.
 */

/** Must equal the Worker's `EMBEDDED_PAYLOAD_ID`; `embeddedPayload.test.ts` holds them together. */
export const EMBEDDED_PAYLOAD_ID = 'viewer-payload'

/**
 * The payload, and whether the page is a robot's copy. Since 2026-11-15 a person's page can carry
 * the data too (`worker/personPayload.ts`), marked `data-for="person"`, and it must still load
 * the 3D. Only that mark makes a person: an unmarked copy is a robot's, as every copy was before.
 */
export interface EmbeddedPayload {
  payload: ViewerApiResponse
  forRobot: boolean
}

export function takeEmbeddedPayload(apiPath: string): EmbeddedPayload | null {
  const el = document.getElementById(EMBEDDED_PAYLOAD_ID)
  if (!el) return null
  el.remove()
  if (el.getAttribute('data-path') !== apiPath) return null
  try {
    const payload = JSON.parse(el.textContent ?? '') as ViewerApiResponse
    if (!payload || typeof payload !== 'object') return null
    return { payload, forRobot: el.getAttribute('data-for') !== 'person' }
  } catch {
    return null
  }
}
