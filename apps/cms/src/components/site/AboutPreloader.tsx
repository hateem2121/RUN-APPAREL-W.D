import { LOOM_MARK_BANDS, LOOM_MARK_PATHS, LOOM_MARK_VIEWBOX } from '@run-apparel/shared'
import { FAMILY_SINCE } from '../../lib/press'
import { PRELOADER_BOOT_SCRIPT } from '../../lib/preloader'

/**
 * The first-arrival curtain, every website page (lib/preloader.ts has who sees it and why nothing is
 * stored).
 *
 * ⚠️ ORDER IS THE MECHANISM. The constant script comes first and marks <html> before the overlay
 * below is parsed, so the overlay is never painted for a visitor who should not see it: it is
 * hidden in CSS unless <html> carries `data-preload`. Without JavaScript, or under reduced motion,
 * nothing marks it and nothing shows.
 *
 * The overlay is decoration, so it is out of the accessibility tree and `inert`, and the skip link
 * sits above it (`--z-skip-link` beats `--z-preloader`). If the driver stalls, CSS lifts the curtain
 * on its own at the ceiling. suppressHydrationWarning: the driver writes these numbers before React.
 */
export function AboutPreloader() {
  return (
    <>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built in lib/preloader.ts; nothing a visitor or the CMS sends reaches it.
        dangerouslySetInnerHTML={{ __html: PRELOADER_BOOT_SCRIPT }}
      />
      <div className="preloader" aria-hidden="true" inert>
        <i className="preloader__paper preloader__paper--a" />
        <i className="preloader__paper preloader__paper--b" />
        <div className="preloader__lockup">
          <span className="preloader__count">
            <span className="preloader__year display display--hero" suppressHydrationWarning>
              {FAMILY_SINCE}
            </span>
            <span className="preloader__meta mono">
              Loading ·{' '}
              <span className="preloader__pct" suppressHydrationWarning>
                0%
              </span>
            </span>
          </span>
          <svg className="preloader__mark" viewBox={LOOM_MARK_VIEWBOX} aria-hidden="true">
            <defs>
              {LOOM_MARK_BANDS.map(([y, h], i) => (
                <clipPath id={`arrive-${i}`} key={y}>
                  <rect
                    className={`loom-mark__pick loom-mark__pick--${i % 2 ? 'r' : 'l'}`}
                    x="0"
                    y={y}
                    width="8000"
                    height={h + 40}
                  />
                </clipPath>
              ))}
            </defs>
            {LOOM_MARK_BANDS.map(([y], i) => (
              <g clipPath={`url(#arrive-${i})`} key={y}>
                {LOOM_MARK_PATHS.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </>
  )
}
