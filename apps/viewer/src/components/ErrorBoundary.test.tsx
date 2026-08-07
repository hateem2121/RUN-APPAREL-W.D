import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

// React's act() requires this global; without it every act call warns and the
// assertions below still pass, which would make the suite quieter than it is honest.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Boom(): never {
  throw new Error('kaboom in render')
}

function Fine() {
  return <p>rendered fine</p>
}

let host: HTMLDivElement
let root: Root
let diagnostics: CustomEvent[]
// Held so afterEach can remove it. Registering in beforeEach without removing
// leaks a listener per test, and because the handler closes over the `diagnostics`
// VARIABLE rather than its value, every stale listener keeps pushing into the
// current array — the third test then saw 3 events for 1 dispatch. Same teardown
// discipline as lib/telemetry.test.ts's `stop()`.
let onDiagnostic: (event: Event) => void

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  diagnostics = []
  onDiagnostic = (e) => diagnostics.push(e as CustomEvent)
  document.addEventListener('run:diagnostic', onDiagnostic)
  // React logs every caught error to console.error, and componentDidCatch mirrors
  // to console.warn via diagnostic(). Both are intended; silence them so a passing
  // run is not full of red.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root.unmount())
  document.removeEventListener('run:diagnostic', onDiagnostic)
  host.remove()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children untouched when nothing throws', () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <Fine />
        </ErrorBoundary>,
      )
    })
    expect(host.textContent).toContain('rendered fine')
    expect(diagnostics).toHaveLength(0)
  })

  it('shows the branded fallback instead of a blank page when a child throws', () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      )
    })
    // The specific copy matters less than the fact that SOMETHING branded rendered:
    // the failure this replaces is an empty <div id="root">.
    expect(host.textContent).not.toBe('')
    expect(host.textContent).toContain('REFERENCE UNAVAILABLE')
  })

  /**
   * THE LOAD-BEARING ASSERTION.
   *
   * React re-throws an UNCAUGHT render error to `window.onerror`, which
   * lib/telemetry.ts already listens for. A boundary stops that happening, so if
   * this boundary did not report, adding it would REDUCE visibility — trading a
   * white screen for a white screen nobody hears about. This test is what keeps
   * that from regressing silently.
   */
  it('reports through the diagnostic seam, so telemetry still sees the failure', () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      )
    })

    expect(diagnostics).toHaveLength(1)
    const detail = diagnostics[0]!.detail as Record<string, string>
    expect(detail.kind).toBe('react-render-error')
    // `reason` specifically: lib/telemetry.ts maps that field onto the Events row's
    // `message`. Renaming it would leave the event firing and the message empty.
    expect(detail.reason).toBe('kaboom in render')
    expect(detail.componentStack).toContain('Boom')
  })
})
