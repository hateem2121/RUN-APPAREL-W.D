import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/capabilities'

interface PreloaderProps {
  /** Data is ready — begin the exit. */
  done: boolean
  /** Called once the preloader has fully left the screen. */
  onExited: () => void
}

/**
 * Branded, on-brand loading overlay: blueprint grid, a mono N°-counter climbing
 * while data loads, a volt rule that draws across on completion, then a
 * clip-path wipe up to reveal the stage. Under reduced motion or automation it
 * renders nothing and signals exit immediately — so it never overlays e2e or
 * disturbs motion-sensitive visitors.
 */
export function Preloader({ done, onExited }: PreloaderProps) {
  const reduce = typeof window !== 'undefined' && (prefersReducedMotion() || navigator.webdriver)
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)
  const startRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0)

  // Climb toward ~90% while loading.
  useEffect(() => {
    if (reduce || done) return
    let raf = 0
    const tick = () => {
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.05 : p))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, done])

  // On completion: finish the counter, draw the rule, wipe out.
  useEffect(() => {
    if (!done) return
    if (reduce) {
      onExited()
      return
    }
    setProgress(100)
    const wait = Math.max(0, 400 - (performance.now() - startRef.current))
    const toExit = window.setTimeout(() => setExiting(true), wait)
    const toDone = window.setTimeout(onExited, wait + 760)
    return () => {
      clearTimeout(toExit)
      clearTimeout(toDone)
    }
  }, [done, reduce, onExited])

  if (reduce) return null

  return (
    <div
      className={`preloader${exiting ? ' preloader--exit' : ''}`}
      role="status"
      aria-label="Loading product reference"
    >
      <div className="preloader__grid blueprint" aria-hidden="true" />
      <div className="preloader__inner">
        <span className="label">[ 3D PRODUCT REFERENCE ]</span>
        <span className="preloader__count mono">
          N°{String(Math.round(progress)).padStart(3, '0')}
        </span>
        <span className="preloader__rule" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </span>
        <span className="mono preloader__status">PREPARING REFERENCE…</span>
      </div>
    </div>
  )
}
