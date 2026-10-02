import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prefersReducedMotion } from './capabilities'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * VA-20 (visual audit, 2026-10-02). `<Stage>` read `prefersReducedMotion()` while rendering, so a
 * visitor who turned reduced motion on during a visit kept the camera easing it was built with
 * until something else re-rendered the stage. This hook makes the change itself re-render it.
 *
 * THE ASSERTION THAT MATTERS is the second one: the value changes WITHOUT a remount. The
 * "plain function" case below is the negative control — the old way of reading it, in the same
 * harness, still says `false` after the change, so the harness can tell the two apart.
 */

/** A MediaQueryList that can really fire `change`, carrying `matches` as the real event does. */
class FakeMediaQueryList {
  matches: boolean
  private readonly listeners = new Set<(event: { matches: boolean }) => void>()
  constructor(matches: boolean) {
    this.matches = matches
  }
  addEventListener(_type: string, listener: (event: { matches: boolean }) => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: (event: { matches: boolean }) => void) {
    this.listeners.delete(listener)
  }
  set(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) listener({ matches })
  }
  get listenerCount() {
    return this.listeners.size
  }
}

let reduced: FakeMediaQueryList
let queries: string[]
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  reduced = new FakeMediaQueryList(false)
  queries = []
  window.matchMedia = ((query: string) => {
    queries.push(query)
    return query.includes('prefers-reduced-motion') ? reduced : new FakeMediaQueryList(false)
  }) as unknown as typeof window.matchMedia
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function Probe() {
  return <span data-testid="probe">{String(usePrefersReducedMotion())}</span>
}

/** The old way: read once during render, nothing to tell React to look again. */
function PlainProbe() {
  return <span data-testid="plain">{String(prefersReducedMotion())}</span>
}

const text = (id: string) => host.querySelector(`[data-testid="${id}"]`)?.textContent

describe('usePrefersReducedMotion', () => {
  it('starts as the browser says', () => {
    reduced.matches = true
    act(() => root.render(<Probe />))
    expect(text('probe')).toBe('true')
  })

  it('re-renders when the setting is turned ON mid-visit, with no remount', () => {
    act(() =>
      root.render(
        <>
          <Probe />
          <PlainProbe />
        </>,
      ),
    )
    expect(text('probe')).toBe('false')

    act(() => reduced.set(true))

    expect(text('probe'), 'the hook did not follow the change').toBe('true')
    // The negative control: the plain read, in the same tree, is exactly the old behaviour.
    expect(text('plain'), 'the harness cannot tell the hook from a plain read').toBe('false')
  })

  it('and back to false when it is turned OFF again', () => {
    reduced.matches = true
    act(() => root.render(<Probe />))
    expect(text('probe')).toBe('true')
    act(() => reduced.set(false))
    expect(text('probe')).toBe('false')
  })

  it('listens for the reduced-motion query and nothing else', () => {
    act(() => root.render(<Probe />))
    expect(queries.every((query) => query === '(prefers-reduced-motion: reduce)')).toBe(true)
  })

  it('unsubscribes on unmount, so a route change cannot leak a listener', () => {
    act(() => root.render(<Probe />))
    expect(reduced.listenerCount).toBeGreaterThan(0)
    act(() => root.unmount())
    expect(reduced.listenerCount).toBe(0)
    root = createRoot(host) // afterEach unmounts again; give it a live root
  })
})
