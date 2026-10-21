import type { ViewerApiResponse } from '@run-apparel/shared'

/**
 * Read the payload the Worker put in a search robot's page, instead of fetching it again.
 *
 * Only robots ever get one (`worker/embeddedPayload.ts` has the 2026-10-21 Search Console
 * finding: Google's renderer sometimes fails the API request, the app then draws the
 * unreachable screen, and that screen's noindex kept eight garments out of Google). For a
 * person the element is absent and this returns null on the first line.
 *
 * Used ONCE: the element is removed when read, so a retry or a colourway change fetches
 * fresh, exactly as it did before. A payload for a different request (`data-path` is the
 * `viewerApiPath` the Worker asked the CMS for) or one that does not parse is ignored, and
 * the app fetches as it always has: the worst case is yesterday's behaviour.
 */

/** Must equal the Worker's `EMBEDDED_PAYLOAD_ID`; `embeddedPayload.test.ts` holds them together. */
export const EMBEDDED_PAYLOAD_ID = 'viewer-payload'

export function takeEmbeddedPayload(apiPath: string): ViewerApiResponse | null {
  const el = document.getElementById(EMBEDDED_PAYLOAD_ID)
  if (!el) return null
  el.remove()
  if (el.getAttribute('data-path') !== apiPath) return null
  try {
    const payload = JSON.parse(el.textContent ?? '') as ViewerApiResponse
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}
