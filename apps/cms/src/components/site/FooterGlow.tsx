'use client'

import { useEffect, useRef } from 'react'
import { type CursorPoint, subscribeToCursor } from '../../lib/cursorBus'

/** Anything under the light that should carry it instead of the halo. */
const CONTENT =
  'a, .footer-q, .footer-eyebrow, .footer-derisk, .footer-dim, .footer-block, .footer-clock, .footer-status, .footer-legal, .footer-mark'

/** How long the content keeps the light after the point leaves it. */
const LINGER_MS = 180

/**
 * ONE light for the whole slab, positioned from the cursor ring's TRAILED point via
 * the cursor bus — never from the raw pointer. Three layers ride with it: a soft volt
 * halo on the ground (`screen`), a transfer disc in full volt through `multiply` — so
 * anything lighter than the slab under it takes the colour and the ground barely
 * changes — and the blueprint grid drawn again in volt, masked to the point and to the
 * base grid's own bottom fade. The wordmark's spotlight is driven from here too.
 *
 * Over content the halo drops to a third and the content carries the light. Entering
 * content is immediate; LEAVING it waits LINGER_MS, so crossing the gap between two
 * rows of the 2×2 does not dim-and-relight the halo — measured 2026-09-05: four toggles
 * per crossing without it, one with it.
 *
 * Attaches to its PARENT (the slab) so the footer stays server-rendered. Runs only
 * while the cursor publishes, which is only on fine pointers with motion allowed and
 * outside automation — so the glow is exactly as present as the cursor it belongs to.
 * The CSS hides the layers in the same cases.
 */
export function FooterGlow() {
  const first = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const slab = first.current?.parentElement
    if (!slab) return
    const mark = slab.querySelector<HTMLElement>('.footer-mark')
    const lit = slab.querySelector<HTMLElement>('.footer-mark__layer--lit')
    const inside = (r: DOMRect, x: number, y: number) =>
      x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    let glowOn = false
    let lastOverAt = Number.NEGATIVE_INFINITY
    let lastPoint: CursorPoint | null = null
    let settle = 0

    const light = (point: CursorPoint) => {
      lastPoint = point
      window.clearTimeout(settle)
      const r = slab.getBoundingClientRect()
      const on = point.placed && inside(r, point.x, point.y)
      if (on !== glowOn) {
        glowOn = on
        slab.dataset.glow = String(on)
      }
      if (!on) {
        if (mark?.dataset.lit === 'true') mark.dataset.lit = 'false'
        return
      }
      slab.style.setProperty('--gx', `${point.x - r.left}px`)
      slab.style.setProperty('--gy', `${point.y - r.top}px`)

      // The cursor spans and the glow layers are pointer-events:none, so the element
      // under the point is real content or the slab itself.
      const under = document.elementFromPoint(point.x, point.y)
      const overNow = Boolean(under && slab.contains(under) && under.closest(CONTENT))
      if (overNow) lastOverAt = point.now
      const lingering = !overNow && point.now - lastOverAt < LINGER_MS
      slab.dataset.over = String(overNow || lingering)
      /*
       * ⚠️ THE LINGER NEEDS ITS OWN TICK. The bus publishes only while the ring moves;
       * once it lands, nothing calls this again — so a hand-off that was still inside
       * the linger window at the last frame stayed `data-over="true"` over empty ground
       * for good. Caught by the browser suite on the first run (one engine, one hover).
       * Re-evaluate once, at the same point, the moment the window closes.
       */
      if (lingering) {
        settle = window.setTimeout(
          () => {
            if (lastPoint) light({ ...lastPoint, now: performance.now() })
          },
          LINGER_MS - (point.now - lastOverAt) + 1,
        )
      }

      if (mark && lit) {
        const m = mark.getBoundingClientRect()
        if (inside(m, point.x, point.y)) {
          lit.style.setProperty('--mx', `${point.x - m.left}px`)
          lit.style.setProperty('--my', `${point.y - m.top}px`)
          mark.dataset.lit = 'true'
        } else if (mark.dataset.lit === 'true') {
          mark.dataset.lit = 'false'
        }
      }
    }
    const unsubscribe = subscribeToCursor(light)
    return () => {
      window.clearTimeout(settle)
      unsubscribe()
    }
  }, [])

  return (
    <>
      <div className="footer-glow footer-glow--grid" aria-hidden="true" ref={first} />
      <div className="footer-glow footer-glow--transfer" aria-hidden="true" />
      <div className="footer-glow footer-glow--halo" aria-hidden="true" />
    </>
  )
}
