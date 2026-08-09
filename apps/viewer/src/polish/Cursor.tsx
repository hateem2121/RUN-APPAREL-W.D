import { motion, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useState } from 'react'
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
      if (hidden) setHidden(false)
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
      const move = (event: MouseEvent) => {
        const rect = el.getBoundingClientRect()
        const dx = event.clientX - (rect.left + rect.width / 2)
        const dy = event.clientY - (rect.top + rect.height / 2)
        el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.18}px)`
      }
      const reset = () => {
        el.style.transform = ''
      }
      el.addEventListener('mousemove', move)
      el.addEventListener('mouseleave', reset)
      return () => {
        el.removeEventListener('mousemove', move)
        el.removeEventListener('mouseleave', reset)
        el.style.transform = ''
      }
    })

    return () => {
      root.classList.remove('has-custom-cursor')
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      for (const cleanup of cleanups) cleanup()
    }
  }, [enabled, hidden, x, y])

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
