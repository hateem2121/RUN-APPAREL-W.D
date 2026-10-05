'use client'

import { useEffect } from 'react'
import { CARD_OPENING_NAME } from '../../lib/cardOpening'

/** The part of the browser's `pageswap` event this reads; typed here, not from a DOM library. */
type PageSwap = Event & {
  viewTransition?: { skipTransition(): void; ready?: Promise<unknown> } | null
}

/**
 * A product card's picture grows into the garment page (polish MO3; the owner's choice of
 * 5 Oct 2026, "grow into the loading screen"): tap a card and its picture spreads from the card
 * to the whole screen while the garment page's loading screen fades in over it, which then wipes
 * away to the garment as it always has. The garment page always opens on that full-screen loading
 * screen (apps/viewer index.html, RO-08), so the 3D window is not there yet to grow into.
 *
 * ⚠️ A CROSS-DOCUMENT VIEW TRANSITION, SO BOTH PAGES OPT IN (web.dev, "cross-document-transitions",
 * read 2026-10-05): site.css here, apps/viewer's page.css there, each under
 * `prefers-reduced-motion: no-preference`. The two share one name, `CARD_OPENING_NAME`: on this
 * page it is put on the tapped card's showing picture only, at the moment of the tap, because two
 * elements with one name cancel the whole transition; there it is the loading screen's.
 *
 * ⚠️ AND EVERY OTHER NAVIGATION IS CANCELLED HERE. Every website page opts in, so without this a
 * plain link would cross-fade the whole page too, which nobody asked for: `pageswap` fires on the
 * page being left, and unless a card was tapped its transition is skipped and the next page simply
 * loads, as it did before. That is also why this runs under automation, unlike the site's motion
 * islands: switched off there, every same-site link in the browser tests would cross-fade.
 *
 * A Back to this page from the bfcache brings the name back with it; `pageshow` clears it, so a
 * second tap never finds two pictures with the one name. Firefox has no cross-document
 * transitions yet (5 Oct 2026): there the name is set and nothing reads it.
 */
export function CardOpening() {
  useEffect(() => {
    let picked: HTMLElement | null = null
    const forget = () => {
      picked?.style.removeProperty('view-transition-name')
      picked = null
    }
    const onClick = (event: MouseEvent) => {
      forget()
      // A new tab or window leaves this page where it is: nothing to grow.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      const card = link?.closest('.product-card')
      if (!card) return
      // The colour showing: the one slide in the tab order (CardGallery.tsx, the roving tabIndex).
      const picture =
        card.querySelector<HTMLElement>('.card-gallery__slide[tabindex="0"]') ??
        card.querySelector<HTMLElement>('.card-gallery__slide')
      if (!picture) return
      picture.style.setProperty('view-transition-name', CARD_OPENING_NAME)
      picked = picture
    }
    const onSwap = (event: Event) => {
      const transition = (event as PageSwap).viewTransition
      if (transition && !picked) {
        transition.skipTransition()
        // Skipping rejects `ready`, which nobody else holds: caught, or it reaches the browser as an
        // unhandled rejection (the garment page's twin reported one to Sentry, VIEWER-E).
        transition.ready?.catch(() => {})
      }
    }
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) forget()
    }
    document.addEventListener('click', onClick)
    window.addEventListener('pageswap', onSwap)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('pageswap', onSwap)
      window.removeEventListener('pageshow', onShow)
      forget()
    }
  }, [])
  return null
}
