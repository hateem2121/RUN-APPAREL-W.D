import { Component, type ErrorInfo, type ReactNode } from 'react'
import { diagnostic } from '../lib/diagnostic'

/**
 * A boundary for ONE lazily loaded piece of the page that nobody tapped for (the footer's tab and
 * question). If the piece's code never arrives it draws nothing, so the page around it stays.
 *
 * ⚠️ WITHOUT THIS, ONE MISSING FILE REPLACED THE WHOLE GARMENT PAGE (found 2026-10-22). A failed
 * `lazy()` import throws while React draws, `<Suspense fallback={null}>` does not catch a throw,
 * and the only boundary above was the page-wide one in main.tsx, which swaps the garment for
 * "This page ran into a problem". The footer is on every garment page, so a deploy that deleted
 * `FooterPrompt`'s chunk could blank any page that was already open.
 *
 * The one automatic reload is asked for where the `import()` fails (`reloadOnChunkFailure`, in
 * Footer.tsx), not here: this catches every throw from the piece, and only a missing file earns
 * a reload. React's `lazy()` also keeps a rejected promise (ReloadPageButton.tsx says so), so
 * drawing the piece again would throw again; hence no reset, and the page after the reload is a
 * fresh one.
 *
 * It reports, as ErrorBoundary does, because a boundary that catches stops React sending the
 * error to `window.onerror`, where the first-party telemetry would have seen it.
 */
export class LazyPieceBoundary extends Component<
  { piece: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    diagnostic('lazy-piece-failed', {
      module: this.props.piece,
      reason: (error.message || String(error)).slice(0, 200),
    })
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
