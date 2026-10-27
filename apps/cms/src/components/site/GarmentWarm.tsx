'use client'

import { useEffect } from 'react'
import { garmentWarmPath } from '../../lib/garmentWarm'

/**
 * Warms a garment's data the moment a visitor shows intent on its card (faster-taps spec, Part 3):
 * the mouse over it, keyboard focus, the start of a touch, a press. One request per garment per
 * page view, to the site's own `/__warm/garment/<product>/<colour>` (worker.mjs answers 204 and
 * asks the shared store). The garment page asks for the same data only once its HTML has arrived,
 * about 1.2 s after a tap (26 Oct), so a cold drawing gets that head start.
 *
 * A document-level listener, like CardOpening.tsx, so no card has to know about it. `pointerover`
 * rather than `pointerenter`, because only the first reaches a listener on the document.
 * `siteOrigin` comes from the server layout (seo.ts SITE_ORIGIN), so seo.ts stays out of the
 * browser's bundle.
 */
export function GarmentWarm({ siteOrigin }: { siteOrigin: string }) {
  useEffect(() => {
    const warmed = new Set<string>()
    const intent = (event: Event) => {
      if (
        event instanceof PointerEvent &&
        event.type === 'pointerover' &&
        event.pointerType !== 'mouse'
      ) {
        return
      }
      const link =
        event.target instanceof Element ? event.target.closest('.product-card a[href]') : null
      if (!(link instanceof HTMLAnchorElement)) return
      const saveData = Boolean(
        (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
      )
      const path = garmentWarmPath(link.href, new URL(window.location.href), saveData, siteOrigin)
      if (!path || warmed.has(path)) return
      warmed.add(path)
      // Fire and forget: a warm request that fails changes nothing for the visitor.
      fetch(path, { keepalive: true, priority: 'low' } as RequestInit).catch(() => {})
    }
    const kinds = ['pointerover', 'focusin', 'touchstart', 'pointerdown'] as const
    for (const kind of kinds) document.addEventListener(kind, intent, { passive: true })
    return () => {
      for (const kind of kinds) document.removeEventListener(kind, intent)
    }
  }, [siteOrigin])
  return null
}
