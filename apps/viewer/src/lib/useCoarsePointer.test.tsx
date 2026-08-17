import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useCoarsePointer } from './useCoarsePointer'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ WHY THIS EXISTS. `isCoarsePointer()` is a plain function read DURING RENDER,
 * so whatever it returned when the component first mounted is what the page keeps
 * for the rest of the session. Its own comment in capabilities.ts has said "it is
 * also computed once per render, so it never re-checked" since 2026-08-13 — the
 * property was documented and never fixed.
 *
 * Reproduced 2026-08-17 in a real browser: after emulating a 375px touch viewport
 * and returning to 1440px, `matchMedia('(pointer: coarse)').matches` correctly
 * reported `false` and `navigator.maxTouchPoints` was 0, while the stage hint still
 * read "PINCH TO ZOOM". A reload fixed it, which is what proves the media query was
 * right and the cached render was wrong.
 *
 * The real-world trigger is an iPad with a Magic Keyboard attached or detached, or
 * a Windows 2-in-1 flipped between laptop and tablet mode. The hint is only
 * wording, but <ColourwayTabs> gates `canPreview` on the same value — and a hover
 * preview left enabled on a touch screen is the state its own comment calls "both
 * invisible and misleading", because the first tap fires mouseenter AND click.
 *
 * THE ASSERTION THAT MATTERS is the second one: the value changes WITHOUT a
 * remount. A test that only checked the initial value would pass against the old
 * plain-function implementation.
 */

/** One fake MediaQueryList per query, with a handle to fire a real `change`. */
class FakeMediaQueryList {
  matches: boolean
  private readonly listeners = new Set<() => void>()
  constructor(matches: boolean) {
    this.matches = matches
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener)
  }
  /** Change the answer and notify, the way a real query does on a device change. */
  set(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) listener()
  }
  get listenerCount() {
    return this.listeners.size
  }
}

let queries: Map<string, FakeMediaQueryList>
let host: HTMLDivElement
let root: Root

/** `pointer: coarse` AND no `any-pointer: fine` is the "touch only" combination. */
const setPointer = (kind: 'touch' | 'mouse') => {
  queries.get('(pointer: coarse)')?.set(kind === 'touch')
  queries.get('(any-pointer: fine)')?.set(kind === 'mouse')
}

beforeEach(() => {
  queries = new Map([
    ['(pointer: coarse)', new FakeMediaQueryList(false)],
    ['(any-pointer: fine)', new FakeMediaQueryList(true)],
  ])
  window.matchMedia = ((query: string) => {
    const existing = queries.get(query)
    if (existing) return existing
    const created = new FakeMediaQueryList(false)
    queries.set(query, created)
    return created
  }) as unknown as typeof window.matchMedia

  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function Probe() {
  return <span data-testid="probe">{String(useCoarsePointer())}</span>
}

const rendered = () => host.querySelector('[data-testid="probe"]')?.textContent

describe('useCoarsePointer', () => {
  it('reports a fine pointer as not coarse', () => {
    act(() => root.render(<Probe />))
    expect(rendered()).toBe('false')
  })

  it('re-renders when a keyboard is DETACHED mid-session, with no reload', () => {
    act(() => root.render(<Probe />))
    expect(rendered()).toBe('false')

    act(() => setPointer('touch'))

    // The whole point. Against the old `isCoarsePointer()` read-during-render this
    // still says 'false', because nothing tells React to look again.
    expect(rendered()).toBe('true')
  })

  it('re-renders when a keyboard is ATTACHED mid-session', () => {
    queries.get('(pointer: coarse)')!.matches = true
    queries.get('(any-pointer: fine)')!.matches = false
    act(() => root.render(<Probe />))
    expect(rendered()).toBe('true')

    act(() => setPointer('mouse'))
    expect(rendered()).toBe('false')
  })

  /**
   * A touchscreen laptop reports a coarse PRIMARY pointer while a mouse is
   * attached. capabilities.ts's own comment records that treating that as "touch"
   * switched the colourway preview off permanently on exactly the machines most
   * likely to be used to review a garment. The hook must not lose that rule.
   */
  it('treats a coarse primary pointer WITH a fine pointer available as fine', () => {
    queries.get('(pointer: coarse)')!.matches = true
    queries.get('(any-pointer: fine)')!.matches = true
    act(() => root.render(<Probe />))
    expect(rendered()).toBe('false')
  })

  it('unsubscribes on unmount, so a route change cannot leak listeners', () => {
    act(() => root.render(<Probe />))
    expect(queries.get('(pointer: coarse)')?.listenerCount).toBeGreaterThan(0)

    act(() => root.unmount())

    expect(queries.get('(pointer: coarse)')?.listenerCount).toBe(0)
    expect(queries.get('(any-pointer: fine)')?.listenerCount).toBe(0)
    root = createRoot(host) // afterEach unmounts again; give it a live root
  })
})
