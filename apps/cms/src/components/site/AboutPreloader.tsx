import { PRELOADER_BOOT_SCRIPT } from '../../lib/preloader'
import { PreloaderCounter } from './PreloaderCounter'

/**
 * The /about preloader (lib/preloader.ts has who sees it and why nothing is stored).
 *
 * ⚠️ ORDER IS THE MECHANISM. The constant script comes first and marks <html> before the overlay
 * below is parsed, so the overlay is never painted for a visitor who should not see it: it is
 * hidden in CSS unless <html> carries `data-preload`. Without JavaScript, or under reduced motion,
 * nothing marks it and nothing shows.
 *
 * The overlay is decoration, so it is out of the accessibility tree and `inert`, and the skip link
 * sits above it (`--z-skip-link` beats `--z-preloader`). If the counter's script never runs, CSS
 * lifts the curtain on its own at 2.2 s (about-factory.css, "the /about preloader").
 */
export function AboutPreloader() {
  return (
    <>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built in lib/preloader.ts; nothing a visitor or the CMS sends reaches it.
        dangerouslySetInnerHTML={{ __html: PRELOADER_BOOT_SCRIPT }}
      />
      <div className="preloader" aria-hidden="true" inert>
        <PreloaderCounter />
      </div>
    </>
  )
}
