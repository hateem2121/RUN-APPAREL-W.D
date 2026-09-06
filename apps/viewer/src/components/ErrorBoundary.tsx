import { Component, type ErrorInfo, type ReactNode } from 'react'
import { diagnostic } from '../lib/diagnostic'
import { UnavailableState } from './States'

/**
 * Catch a render-time throw and show the branded unavailable state instead of a
 * blank page.
 *
 * ⚠️ THIS MUST REPORT, OR IT MAKES THINGS WORSE. React re-throws an UNCAUGHT
 * render error to `window.onerror`, which `lib/telemetry.ts` already listens for —
 * that is how the uncaught React error found in the 2026-08-03 Events audit was
 * captured at all. The moment a boundary catches an error, React stops doing that
 * and routes it to `onCaughtError` (console only). So a silent boundary trades a
 * white screen for a white screen nobody hears about, which is a worse trade than
 * it looks. `componentDidCatch` below is not optional decoration; it is the thing
 * that keeps the existing telemetry path alive.
 *
 * It reports through the same `diagnostic()` seam as every other viewer failure
 * (`lib/diagnostic.ts`), which means it works with Sentry switched OFF — the
 * default. The Events table and the weekly digest pick it up with no further
 * configuration. When Sentry is enabled it also surfaces there, with a real
 * component stack, which `window.onerror` never carried.
 *
 * NO AUTO-RESET, deliberately. Retrying a render that just threw invites a loop
 * that burns the device's battery and fills the Events table with the same row;
 * `UnavailableState` offers both contact routes, so a visitor is never stranded.
 * Recovery is a page load.
 *
 * ⚠️ This said "already offers the catalogue and both contact routes" until
 * 2026-09-05, and the catalogue button was removed on 2026-09-04 — so the safety
 * argument for not auto-resetting cited an affordance that no longer existed. The
 * argument still holds on the two contact routes alone, which is why the decision
 * did not change; but a comment that justifies a behaviour with a deleted button is
 * how a later reader concludes the behaviour is now unsafe and "fixes" it.
 */

/** Component names only — no props, no state, no user data. Enough to locate the bug. */
const STACK_FRAMES = 8

function topOfStack(componentStack: string | null | undefined): string {
  if (!componentStack) return ''
  return componentStack.trim().split('\n').slice(0, STACK_FRAMES).join(' ← ').replace(/\s+/g, ' ')
}

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // `reason` is the field lib/telemetry.ts maps onto the Events row's `message`
    // (see its onDiagnostic handler); anything else here reaches the console only.
    diagnostic('react-render-error', {
      reason: error.message || String(error),
      // Named separately from `reason` so the console keeps the full picture even
      // though only `reason` is transmitted.
      componentStack: topOfStack(info.componentStack),
    })
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="page">
          <UnavailableState />
        </div>
      )
    }
    return this.props.children
  }
}
