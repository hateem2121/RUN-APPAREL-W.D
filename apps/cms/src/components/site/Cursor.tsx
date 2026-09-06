'use client'

import { useEffect } from 'react'
import { publishCursor } from '../../lib/cursorBus'
import { isInteractive, ringTransform, trail } from '../../lib/cursorMath'

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
    let placed = false
    let frame = 0

    const paint = (now: number) => {
      frame = 0
      rx = trail(rx, px, 0.22)
      ry = trail(ry, py, 0.22)
      const moving = Math.abs(px - rx) > 0.3 || Math.abs(py - ry) > 0.3
      if (!moving) {
        // land exactly, so the ring and everything lit from it stop on the pointer
        rx = px
        ry = py
      }
      dot.style.transform = ringTransform(px, py, 1)
      ring.style.transform = ringTransform(rx, ry, scale)
      publishCursor({ x: rx, y: ry, placed, now })
      if (moving) frame = requestAnimationFrame(paint)
    }
    const onMove = (event: MouseEvent) => {
      px = event.clientX
      py = event.clientY
      if (!placed) {
        placed = true
        rx = px
        ry = py
        root.classList.add('has-custom-cursor')
        dot.dataset.hidden = 'false'
        ring.dataset.hidden = 'false'
      }
      scale = isInteractive(event.target as Element | null) ? 1.53 : 1
      ring.dataset.pointer = String(scale > 1)
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
