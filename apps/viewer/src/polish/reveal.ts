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
    /**
     * A SLIVER counts, and the bottom margin is what stages the effect.
     *
     * The threshold was 0.12, which is a fraction of the ELEMENT, not of the
     * screen — so the taller the section, the further you had to scroll before
     * it stopped being invisible. `.product-info` is 528px on a 375x812 phone,
     * making 12% equal to 63px. When the mobile layout was rebuilt to let that
     * panel peek above the fold as a scroll affordance, the peek measured 32px —
     * 6.1% — so the space opened up specifically to signal "there is more below"
     * rendered blank. The affordance and the reveal were fighting each other.
     *
     * `rootMargin`'s -8% is what still holds content back until it genuinely
     * reaches the fold, so lowering the threshold does not flatten the effect.
     */
    { threshold: 0.01, rootMargin: '0px 0px -8% 0px' },
  )
  for (const el of els) observer.observe(el)
  return () => observer.disconnect()
}
