import { motion, useMotionValue, useSpring } from 'motion/react'
import { createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { isCoarsePointer, prefersReducedMotion } from '../lib/capabilities'

/**
 * A precision "crosshair" cursor: a crisp dot tracking the pointer exactly, and
 * a spring-trailed ring that expands over interactive targets. Fine-pointer
 * devices only; never mounts under touch, reduced-motion or automation, and
 * never interferes with keyboard focus. Also applies a subtle magnetic pull to
 * `[data-magnetic]` elements.
 */
export function Cursor() {
  const enabled =
    typeof window !== 'undefined' &&
    !isCoarsePointer() &&
    !prefersReducedMotion() &&
    !navigator.webdriver

  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const ringX = useSpring(x, { stiffness: 320, damping: 28, mass: 0.6 })
  const ringY = useSpring(y, { stiffness: 320, damping: 28, mass: 0.6 })
  const [pointer, setPointer] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    root.classList.add('has-custom-cursor')

    const onMove = (event: MouseEvent) => {
      x.set(event.clientX)
      y.set(event.clientY)
      // Functional update, and `hidden` is NOT in this effect's dependencies.
      // It used to be both read from the closure and written by this handler, so
      // every pointer entry and exit tore the effect down and re-subscribed it —
      // re-querying the DOM for magnets and rebinding two listeners per magnet,
      // on an event that fires continuously. A no-op when unchanged.
      setHidden((was) => (was ? false : was))
      const target = event.target as Element | null
      setPointer(Boolean(target?.closest('a, button, [role="tab"], [data-cursor="pointer"]')))
    }
    const onLeave = () => setHidden(true)

    window.addEventListener('mousemove', onMove, { passive: true })
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
      document.removeEventListener('mouseleave', onLeave)
      for (const cleanup of cleanups) cleanup()
    }
  }, [enabled, x, y])

  if (!enabled) return null

  return (
    <>
      <motion.span
        className="cursor-dot"
        aria-hidden="true"
        data-hidden={hidden}
        style={{ x, y }}
      />
      <motion.span
        className="cursor-ring"
        aria-hidden="true"
        data-hidden={hidden}
        data-pointer={pointer}
        style={{ x: ringX, y: ringY }}
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
