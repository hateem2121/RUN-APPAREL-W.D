/**
 * Marks the page while its footer is on screen, so a phone's colour beyond the page can follow what
 * is at the screen's foot (home page audit, 2026-10-17; packages/ui/src/footer.css says why).
 *
 * iOS 26 Safari tints the strip behind its bottom bar from the page's root background (Ben Frain,
 * "iOS26 Safari theme-color tab tinting with fixed position elements"; Apple Developer Forums thread
 * 801239). Since 2026-10-03 that background was the footer's dark colour on phones all the time, so
 * a pale page read with a dark bar under it. The footer is the last thing on every page, so while
 * any of it is on screen it is what lies at the screen's foot: dark then, the page's paper before.
 *
 * Seen in Safari on the iOS 26.5 simulator (iPhone 17 Pro, 2026-10-17), with test pages built the
 * same way (a pale page, a see-through body): a dark root put a dark band under the bottom bar and
 * behind the status bar; a paper one did not; and a root switched to dark as the footer came on
 * screen turned the bar dark with it. Not yet on a real iPhone.
 *
 * Both footers call this (the website's SiteFooter, the garment pages' Footer). Without scripting
 * nothing is marked and the strip stays the page's paper. Returns the clean-up for a React effect.
 */
export const FOOTER_IN_VIEW = 'data-footer-in-view'

/** Only what this uses of the page, as `siteBar.ts` does: this package has no browser types. */
interface Seen {
  readonly isIntersecting: boolean
}

interface Watcher {
  observe(target: unknown): void
  disconnect(): void
}

export interface WatchablePage {
  querySelector(selector: string): unknown
  readonly documentElement: {
    toggleAttribute(name: string, force: boolean): boolean
    removeAttribute(name: string): void
  }
  readonly defaultView: {
    readonly IntersectionObserver?: new (report: (entries: readonly Seen[]) => void) => Watcher
  } | null
}

export function watchFooterInView(page: WatchablePage): () => void {
  const footer = page.querySelector('.site-footer')
  const root = page.documentElement
  const View = page.defaultView?.IntersectionObserver
  if (!footer || !View) return () => {}
  const observer = new View((entries) => {
    root.toggleAttribute(
      FOOTER_IN_VIEW,
      entries.some((entry) => entry.isIntersecting),
    )
  })
  observer.observe(footer)
  return () => {
    observer.disconnect()
    root.removeAttribute(FOOTER_IN_VIEW)
  }
}
