import { prefersReducedMotion } from '../lib/capabilities'

/**
 * Scroll-reveal choreography: adds `.is-inview` to `[data-reveal]` elements as
 * they enter the viewport (once). Under reduced motion / automation / no
 * IntersectionObserver, everything is revealed immediately so content is never
 * stuck hidden. Returns a teardown.
 */
export function startReveals(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))

  if (prefersReducedMotion() || navigator.webdriver || !('IntersectionObserver' in window)) {
    for (const el of els) el.classList.add('is-inview')
    return () => {}
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-inview')
          observer.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  )
  for (const el of els) observer.observe(el)
  return () => observer.disconnect()
}
