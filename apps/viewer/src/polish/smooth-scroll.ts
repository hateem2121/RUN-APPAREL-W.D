import Lenis from 'lenis'
import { prefersReducedMotion } from '../lib/capabilities'
import { SCROLL_DURATION_S } from '../lib/motion'

/**
 * Buttery editorial smooth-scroll. Disabled entirely under reduced-motion and
 * automation. `data-lenis-prevent` on the 3D stage keeps model-viewer's
 * scroll-to-zoom working. Returns a teardown.
 */
let instance: Lenis | null = null

export function startSmoothScroll(): () => void {
  if (instance || typeof window === 'undefined') return () => {}
  if (navigator.webdriver || prefersReducedMotion()) return () => {}

  const lenis = new Lenis({
    autoRaf: true,
    duration: SCROLL_DURATION_S,
    // Gentle ease-out — calm, not springy.
    easing: (t: number) => 1 - (1 - t) ** 3,
  })
  instance = lenis

  return () => {
    lenis.destroy()
    instance = null
  }
}
