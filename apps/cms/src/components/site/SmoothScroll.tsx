'use client'

import { pageHeld } from '@run-apparel/shared'
import type Lenis from 'lenis'
import { useEffect } from 'react'

/**
 * The viewer's smooth scroll, on the site too (owner decision 5; XS-06, OI-2). This reverses
 * the 2026-08-21 / 2026-09-07 "the site scrolls natively" record — see the dated amendment in
 * docs/DECISIONS-BETA-WEBSITE.md.
 *
 * The SAME guards as `apps/viewer/src/polish/smooth-scroll.ts`, each with its own browser
 * test in `e2e/smoothScroll.spec.ts`:
 *   - gated BEFORE the import: automation, reduced motion and a screen with no fine pointer (a
 *     phone) never download the library;
 *   - `virtualScroll` accepts only a trusted wheel (the viewer's FA-F-12 predicate), and none
 *     while a pop-up holds the page (polish F2/F3: packages/shared/src/pageHold.ts);
 *   - keyboard, touch and the scrollbar stay the browser's — Lenis binds no key listener
 *     and `syncTouch` is off by default;
 *   - the glide lasts the viewer's 0.8 s (1.1 s until 2026-10-17, owner) with the viewer's ease-out, so one wheel tick
 *     feels the same on both hosts. `src/auditGuards.test.ts` (FA-F-06 / XS-06) pins the pair.
 */
export const SITE_SCROLL_DURATION_S = 0.8
export const siteScrollEasing = (t: number) => 1 - (1 - t) ** 3

/**
 * The attribute that keeps the wheel from the glide inside one element, so the element's own wheel
 * use wins: №03's garment while its zoom is on (LiveGarment.tsx; owner, 2026-10-17). It is the
 * library's own name for it, kept here so the library is named in this file only (auditGuards).
 */
export const KEEP_WHEEL_ATTRIBUTE = 'data-lenis-prevent-wheel'

/**
 * Keys whose default action scrolls the page. The browser performs it, never Lenis — which
 * binds no key listener — so a glide still running would overwrite it on its next frame.
 */
const SCROLL_KEYS = new Set(['End', 'Home', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '])

export function SmoothScroll() {
  useEffect(() => {
    if (navigator.webdriver) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    /*
     * Only a wheel glides, and a phone has none (home page audit, 2026-10-17): Lenis's frame loop
     * (`autoRaf`) ran on every phone for nothing. `any-pointer`, not `pointer`: a touch laptop
     * with a trackpad or mouse keeps its glide (MDN, "any-pointer", modified 20 April 2026).
     */
    if (!window.matchMedia('(any-pointer: fine)').matches) return
    let lenis: Lenis | null = null
    let cancelled = false

    /*
     * ⚠️ ANY OTHER WAY OF MOVING THE PAGE ENDS THE GLIDE, AT THE MOMENT OF INTENT.
     * Lenis ignores native scroll while it is gliding and writes its own position on every
     * frame, so without this (measured 2026-09-25, e2e/smoothScroll.spec.ts, Chromium and
     * Firefox): End pressed mid-glide was pulled back up by the glide, and a link clicked
     * mid-glide left the NEW page scrolled to the old page's target — Next had put it at
     * the top, then the next frame put it back. A reset after navigation is too late for
     * the same reason: one Lenis frame runs between Next's scroll and a React effect.
     * So the glide stops BEFORE the page moves: on a pointer press (a link, the scrollbar),
     * a scrolling key, and Back/Forward. stop() + start() is Lenis's public reset: it snaps
     * its target to wherever the page really is, and a touch on a moving page stopping it
     * is what a person expects anyway.
     */
    const endGlide = () => {
      if (lenis?.isScrolling !== 'smooth') return
      lenis.stop()
      lenis.start()
    }
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) endGlide()
    }

    import('lenis')
      .then(({ default: LenisClass }) => {
        if (cancelled) return
        lenis = new LenisClass({
          autoRaf: true,
          duration: SITE_SCROLL_DURATION_S,
          easing: siteScrollEasing,
          virtualScroll: ({ event }) => event.isTrusted && !pageHeld(document),
        })
        window.addEventListener('pointerdown', endGlide, { capture: true })
        window.addEventListener('keydown', onKey, { capture: true })
        window.addEventListener('popstate', endGlide)
      })
      .catch(() => {
        // Decorative: the page scrolls natively without it.
      })
    return () => {
      cancelled = true
      window.removeEventListener('pointerdown', endGlide, { capture: true })
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('popstate', endGlide)
      lenis?.destroy()
      lenis = null
    }
  }, [])

  return null
}
