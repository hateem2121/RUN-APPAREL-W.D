'use client'

import { useEffect } from 'react'
import { publishCursor } from '../../lib/cursorBus'
import { FRAME_MS, isInteractive, ringTransform, trail } from '../../lib/cursorMath'

/**
 * The viewer's precision cursor — a dot that tracks the pointer exactly and a ring that
 * trails it — on the public site, without Motion. The CSS is the shared one in
 * packages/ui/src/base.css (`.cursor-dot`, `.cursor-ring`, `.has-custom-cursor`); only
 * this file is new. Fine pointers only; never under reduced motion or automation.
 *
 * `has-custom-cursor` (which hides the real cursor) is applied ONLY once the replacement
 * is placed, and removed when the pointer leaves the window — the viewer shipped a
 * "no cursor at all" window between mount and first move, and this keeps that fix.
 *
 * The ring's TRAILED point is published on the cursor bus once per painted frame, so
 * the footer's light rides with the ring rather than snapping to the raw pointer.
 */
export function Cursor() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced || navigator.webdriver) return

    const dot = document.createElement('span')
    dot.className = 'cursor-dot'
    dot.setAttribute('aria-hidden', 'true')
    dot.dataset.hidden = 'true'
    const ring = document.createElement('span')
    ring.className = 'cursor-ring'
    ring.setAttribute('aria-hidden', 'true')
    ring.dataset.hidden = 'true'
    ring.dataset.pointer = 'false'
    // appendChild, not append: with workers-types in this package's tsconfig, `append`
    // resolves to a string/Blob overload and the typecheck refuses an element.
    document.body.appendChild(dot)
    document.body.appendChild(ring)

    const root = document.documentElement
    let px = -100
    let py = -100
    let rx = -100
    let ry = -100
    let scale = 1
    let target = 1
    let last = 0
    let placed = false
    let frame = 0

    const paint = (now: number) => {
      frame = 0
      /*
       * ⚠️ REAL ELAPSED TIME, NOT AN ASSUMED FRAME. `trail`'s 0.22 is defined per 60Hz
       * frame; feeding it the frame that actually happened is what stops this being a
       * different cursor on a 120Hz display (arrives in half the time) or after a
       * dropped frame (falls behind). Audit FA-H-03. `last = 0` below resets it when
       * the loop parks, so a restart after an idle second does not see a 1000ms dt and
       * teleport the ring on the next small movement.
       */
      const dt = last === 0 ? FRAME_MS : now - last
      last = now
      rx = trail(rx, px, 0.22, dt)
      ry = trail(ry, py, 0.22, dt)
      /*
       * The inflation over a link was a hard cut — 34px to 52px between one frame and
       * the next, the one piece of this cursor that did not ease (audit FA-H-02). It is
       * trailed on the same curve as the position rather than given a CSS transition,
       * because `transform` is rewritten here every frame and a transition on it would
       * interpolate the POSITION too, smearing the ring behind the pointer.
       */
      scale = trail(scale, target, 0.22, dt)
      const moving =
        Math.abs(px - rx) > 0.3 || Math.abs(py - ry) > 0.3 || Math.abs(target - scale) > 0.004
      if (!moving) {
        // land exactly, so the ring and everything lit from it stop on the pointer
        rx = px
        ry = py
        scale = target
      }
      dot.style.transform = ringTransform(px, py, 1)
      ring.style.transform = ringTransform(rx, ry, scale)
      publishCursor({ x: rx, y: ry, placed, now })
      if (moving) frame = requestAnimationFrame(paint)
      else last = 0
    }
    const onMove = (event: MouseEvent) => {
      px = event.clientX
      py = event.clientY
      if (!placed) {
        placed = true
        rx = px
        ry = py
        last = 0
        root.classList.add('has-custom-cursor')
        dot.dataset.hidden = 'false'
        ring.dataset.hidden = 'false'
      }
      target = isInteractive(event.target as Element | null) ? 1.53 : 1
      ring.dataset.pointer = String(target > 1)
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onLeave = () => {
      placed = false
      root.classList.remove('has-custom-cursor')
      dot.dataset.hidden = 'true'
      ring.dataset.hidden = 'true'
      publishCursor({ x: rx, y: ry, placed: false, now: performance.now() })
    }
    // scrolling moves the page under a still pointer; re-publish from the same point
    const onScroll = () => {
      if (placed && !frame) frame = requestAnimationFrame(paint)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('mouseleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      root.classList.remove('has-custom-cursor')
      dot.remove()
      ring.remove()
    }
  }, [])

  return null
}
