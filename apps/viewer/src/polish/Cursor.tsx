import { motion, useMotionValue, useSpring } from 'motion/react'
import { createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { isCoarsePointer, prefersReducedMotion } from '../lib/capabilities'

/**
 * A precision "crosshair" cursor: a crisp dot tracking the pointer exactly, and
 * a spring-trailed ring that expands over interactive targets. Fine-pointer
 * devices only; never mounts under touch, reduced-motion or automation, and
 * never interferes with keyboard focus.
 *
 * It also applies a subtle magnetic pull, to `.btn`, `.theme-toggle` and
 * `.camera-btn`. ⚠️ This said `[data-magnetic]` until 2026-08-15 — an attribute
 * that appears nowhere in this repo, so anyone adding it to a control got no
 * magnet and no error. The selector list below is the truth.
 *
 * `.colourway-tab` is deliberately NOT in it. Those five sit 8px apart and are
 * swept across in one motion; a pull of up to 0.18 of the pointer's offset would
 * let neighbouring tabs visibly lean into each other, and it would fight the
 * `HOVER_INTENT_MS` coalescing that exists precisely because that sweep is the
 * expected gesture. The ring still inflates over them — `[role="tab"]` is in the
 * interactive selector — which is the cue that matters.
 */
export function Cursor() {
  const enabled =
    typeof window !== 'undefined' &&
    !isCoarsePointer() &&
    !prefersReducedMotion() &&
    !navigator.webdriver

  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  /**
   * `skipInitialAnimation` is what stops the ring FLYING IN across the page.
   *
   * The springs are seeded at -100 because the pointer's position is unknowable
   * until it moves. Without this option the first `mousemove` set a target of, say,
   * (900, 400) and the ring animated there from the top-left corner — a visible
   * sweep across the whole viewport, once per page load, at exactly the moment the
   * cursor was also being revealed. Measured behaviour of Motion 13.1.0's
   * `attachFollow`: with the flag, the first change calls `value.jump(v, false)`
   * instead of `value.set(v)`, so the ring appears where the pointer already is and
   * every subsequent move springs normally.
   *
   * ⚠️ `jump()` calls `stopPassiveEffect()`, which reads like it would detach the
   * spring from its source permanently. It does not: `attachFollow` passes its
   * `stopAnimation` as that callback, which cancels the in-flight animation only —
   * the `value.attach(...)` passive effect stays. Verified in the installed build
   * before relying on it, because the manual `jump` in `onMove` below depends on
   * the same guarantee.
   */
  const spring = { stiffness: 320, damping: 28, mass: 0.6, skipInitialAnimation: true }
  const ringX = useSpring(x, spring)
  const ringY = useSpring(y, spring)
  const [pointer, setPointer] = useState(false)
  const [armed, setArmed] = useState(false)

  /**
   * ⚠️ `has-custom-cursor` IS APPLIED ONLY ONCE THE REPLACEMENT IS DRAWN, and that
   * ordering is the whole fix for "the cursor disappears".
   *
   * The class sets `cursor: none` on the root plus every link, button and tab
   * (base.css). It used to be added on mount, while the dot and ring started at
   * `data-hidden="true"` — i.e. `opacity: 0` — until the first `mousemove` set them
   * otherwise. So between mount and the first pointer movement the real cursor was
   * hidden and the fake one was invisible: NO CURSOR AT ALL, anywhere on the page.
   *
   * That window is not theoretical here. `startPolish()` runs after the ready
   * render, while the model downloads — precisely when a visitor has parked
   * the pointer over the viewer and is waiting. Park it, and the cursor vanished
   * until they moved; move it onto a colourway tab and it came back. Reported as
   * "the cursor seems broken on the buttons", which is where it was noticed rather
   * than where it happened.
   *
   * Gating on `armed` also restores the real cursor whenever the pointer leaves the
   * window, so the page never owns a cursor it is not currently drawing.
   */
  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    root.classList.toggle('has-custom-cursor', armed)
    return () => root.classList.remove('has-custom-cursor')
  }, [enabled, armed])

  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement

    // Whether the ring is currently parked at a known pointer position. Cleared on
    // exit so re-entry snaps instead of springing in from wherever the pointer left.
    let placed = false

    const isInteractive = (node: Element | null) =>
      Boolean(node?.closest('a, button, [role="tab"], [data-cursor="pointer"]'))

    const onMove = (event: MouseEvent) => {
      x.set(event.clientX)
      y.set(event.clientY)
      if (!placed) {
        placed = true
        // Re-entry after a `mouseleave`. `skipInitialAnimation` covers only the
        // very first change of the value's life, so without this the ring springs
        // across the page every time the pointer comes back from the browser
        // chrome or another window.
        ringX.jump(event.clientX)
        ringY.jump(event.clientY)
      }
      // Functional update, and `armed` is NOT in this effect's dependencies.
      // It used to be both read from the closure and written by this handler, so
      // every pointer entry and exit tore the effect down and re-subscribed it —
      // re-querying the DOM for magnets and rebinding two listeners per magnet,
      // on an event that fires continuously. A no-op when unchanged.
      setArmed((was) => (was ? was : true))
      setPointer(isInteractive(event.target as Element | null))
    }

    /**
     * The button state has to be re-read when the element under a STATIONARY
     * pointer changes, which `mousemove` alone cannot see.
     *
     * Two ways that happens on this page, both routine: Lenis smooth-scrolls the
     * document under a still pointer, and clicking a colourway re-renders the whole
     * tablist. In both cases the ring kept whatever inflated/deflated state the last
     * movement left it with. `pointerover` fires on every change of the hit-tested
     * element, movement or not.
     */
    const onOver = (event: PointerEvent) => {
      if (!placed) return
      setPointer(isInteractive(event.target as Element | null))
    }

    const onLeave = () => {
      placed = false
      setArmed(false)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('mouseleave', onLeave)

    // Subtle magnetic pull on the interactive controls.
    const magnets = Array.from(
      document.querySelectorAll<HTMLElement>('.btn, .theme-toggle, .camera-btn'),
    )
    const cleanups = magnets.map((el) => {
      /**
       * ⚠️ `translate`, NOT `transform`.
       *
       * An inline style beats a stylesheet rule that is not `!important`, so
       * writing `el.style.transform` here silently overwrote
       * `.btn--primary:hover { transform: translateY(-2px) }` for the entire
       * time the pointer was near the button — which is exactly when the hover
       * lift is supposed to be visible. The primary call-to-action's hover state
       * never rendered on a desktop, and nothing failed.
       *
       * `translate`, `scale` and `transform` are three INDEPENDENT properties
       * that compose. This owns `translate`; base.css's `:active` owns `scale`;
       * the hover lift keeps `transform`. All three can now apply at once.
       */
      let rect: DOMRect | null = null
      let frame = 0
      const enter = () => {
        // Read once on entry, not on every move. The button does not move while
        // it is being hovered, and a getBoundingClientRect() followed by a style
        // write on the same element, per mousemove, is a forced synchronous
        // layout on the hottest event on the page.
        rect = el.getBoundingClientRect()
      }
      const move = (event: MouseEvent) => {
        if (!rect) rect = el.getBoundingClientRect()
        const bounds = rect
        const dx = event.clientX - (bounds.left + bounds.width / 2)
        const dy = event.clientY - (bounds.top + bounds.height / 2)
        // Coalesce to one write per frame; a mousemove can fire several times
        // between paints and only the last position is ever seen.
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          el.style.translate = `${dx * 0.18}px ${dy * 0.18}px`
        })
      }
      const reset = () => {
        rect = null
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        el.style.translate = ''
      }
      el.addEventListener('mouseenter', enter)
      el.addEventListener('mousemove', move)
      el.addEventListener('mouseleave', reset)
      return () => {
        el.removeEventListener('mouseenter', enter)
        el.removeEventListener('mousemove', move)
        el.removeEventListener('mouseleave', reset)
        reset()
      }
    })

    return () => {
      root.classList.remove('has-custom-cursor')
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('mouseleave', onLeave)
      for (const cleanup of cleanups) cleanup()
    }
  }, [enabled, x, y, ringX, ringY])

  if (!enabled) return null

  return (
    <>
      <motion.span
        className="cursor-dot"
        aria-hidden="true"
        data-hidden={!armed}
        style={{ x, y }}
      />
      {/**
       * ⚠️ THE INFLATION IS ANIMATED HERE, NOT IN CSS, AND MOVING IT BACK BREAKS THE
       * CURSOR. Fixed 2026-08-15; it had been broken since `c133949`.
       *
       * `.cursor-ring[data-pointer="true"]` used to carry `scale: 1.53`. CSS applies
       * the standalone transform properties in a FIXED order — translate, rotate,
       * scale, transform — and Motion writes this element's POSITION into
       * `transform`, which is applied innermost. So the scale multiplied the
       * position instead of just the size: measured with the pointer at (800, 400),
       * the ring's centre landed at (1224, 612). It flew off-target the instant it
       * crossed any button, link or colourway tab — `data-pointer` is exactly the
       * over-a-control state — and sprang back on leaving. The error is
       * proportional to position, so it is nearly invisible near the top-left of the
       * screen and extreme near the bottom-right, which is what made it read as
       * intermittent rather than as a constant offset.
       *
       * `base.css:432` already warns that `translate`, `scale` and `transform` are
       * three INDEPENDENT properties that compose — treating that purely as a
       * benefit, since they cannot overwrite each other. The half it omits is that
       * composing has a fixed ORDER you do not control. Independence buys
       * non-overwriting and costs ordering.
       *
       * Passing `scale` through Motion puts it in the SAME transform string as
       * `x`/`y`. Motion's `transformPropOrder` lists x and y before scale, so it
       * emits `translateX(…) translateY(…) scale(…)` — the element scales about its
       * own centre and is then moved, which is the correct composition. Verified in
       * the browser against both alternatives before choosing this one; reverting to
       * the original `width`/`height` also measured correct but animates layout on
       * the most frequently-updated element on the page, which is the cost `c133949`
       * was right to want gone.
       *
       * The duration and easing mirror `--fast` (200ms) and `--ease` from
       * `tokens.css` so the feel is unchanged from the CSS transition this replaces.
       * `docs/DESIGN.md` §5 owns both values — see `apps/viewer/CLAUDE.md`, which
       * makes it outrank the vendored animation skills.
       *
       * `data-pointer` STAYS on the element: `base.css` still uses it for the fill
       * colour, which is a paint-only change and safe where it is.
       */}
      <motion.span
        className="cursor-ring"
        aria-hidden="true"
        data-hidden={!armed}
        data-pointer={pointer}
        style={{ x: ringX, y: ringY }}
        animate={{ scale: pointer ? 1.53 : 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </>
  )
}

/**
 * Mount the cursor into its own host element and return a teardown.
 *
 * Lives here rather than in polish/index.ts so that `react` and `react-dom` stay
 * out of the polish chunk's static graph. When they were imported there, the
 * bundler resolved `createElement` out of the MOTION chunk — giving the polish
 * chunk a static `import … from "./motion-*.js"`, so every visitor downloaded
 * Motion regardless of the pointer gate that exists to prevent exactly that.
 * See the comment in polish/index.ts.
 */
export function mountCursor(): () => void {
  const host = document.createElement('div')
  host.id = 'polish-cursor-root'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(createElement(Cursor))
  return () => {
    root.unmount()
    host.remove()
  }
}
