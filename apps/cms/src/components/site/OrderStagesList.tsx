'use client'

import { type ReactNode, useEffect, useRef } from 'react'

/**
 * The stage cards' list, which tells the stack how tall each card really is (home page audit,
 * 2026-10-17; the owner's "scroll, then stop").
 *
 * ⚠️ A CARD TALLER THAN THE SCREEN SCROLLS UNTIL ITS LAST LINE SHOWS, THEN STOPS. A sticky card
 * stops where its `top` says, so one taller than the screen under the bar stopped with its foot
 * below the screen, and the next card covered those words for good. Until this, the stack was
 * switched off below an 800px screen to avoid it, so no iPhone in Safari stacked (an iPhone 15 shows
 * 393 × 659 there). CSS cannot read an element's own height into its `top`, so this
 * writes each card's height to `--stage-fit`, and site.css stops it at `100svh − --stage-fit`
 * whenever that is higher than its place under the bar. A card that fits is untouched.
 *
 * On a phone each STEP is a card of its own (OrderSteps.tsx, owner 2026-10-19), so every step's
 * height is written too, on the step; there its own value wins over its stage's.
 *
 * `data-stage-fit` says the heights are written: the e2e tests wait for it. Without scripting the
 * cards still stop under the bar, as they did before.
 */
export function OrderStagesList({ children }: { children: ReactNode }) {
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const element = list.current
    if (!element) return
    const cards = [
      ...element.querySelectorAll<HTMLElement>(
        ':scope > .order-stage, .order-stage__steps > .order-step',
      ),
    ]
    // Its border box: the card's own height, which `top` does not change, so nothing loops.
    // ⚠️ ROUNDED DOWN, NEVER UP: the stop is the screen less this, so a height rounded up stopped
    // the card up to 1px high and left the page's last pixel row pale under it (393 × 659,
    // 2026-10-17; the owner's "no blank space"). Down, the part of a pixel goes past the edge.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height =
          entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height
        ;(entry.target as HTMLElement).style.setProperty('--stage-fit', `${Math.floor(height)}px`)
      }
      element.dataset.stageFit = ''
    })
    for (const card of cards) observer.observe(card)
    return () => observer.disconnect()
  }, [])

  return (
    // biome-ignore lint/a11y/noRedundantRoles: iOS VoiceOver reads a list with `list-style: none` as plain text (WebKit bug 304137, December 2025), so the role is said again.
    <ol className="order-stages" ref={list} role="list">
      {children}
    </ol>
  )
}
