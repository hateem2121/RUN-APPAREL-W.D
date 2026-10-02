import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canRender3D,
  isCoarsePointer,
  onReducedMotionChange,
  prefersReducedMotion,
} from './capabilities'

const mockMatchMedia = (matches: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

const setConnection = (value: unknown) => {
  Object.defineProperty(navigator, 'connection', { value, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  setConnection(undefined)
})

describe('canRender3D', () => {
  it('is false under Save-Data mode', () => {
    setConnection({ saveData: true })
    expect(canRender3D()).toBe(false)
  })
  it('is true when a WebGL context is available', () => {
    setConnection(undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
    expect(canRender3D()).toBe(true)
  })
  it('is false when no WebGL context exists', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
    expect(canRender3D()).toBe(false)
  })
  it('is false when getContext throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no gl')
    })
    expect(canRender3D()).toBe(false)
  })
})

describe('media-query helpers', () => {
  it('prefersReducedMotion reflects the query result', () => {
    mockMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
    mockMatchMedia(false)
    expect(prefersReducedMotion()).toBe(false)
  })
  /**
   * ⚠️ WHY THESE ARE PER-QUERY. `isCoarsePointer` gates the colourway hover
   * preview (`canPreview = !isCoarsePointer()` in ColourwayTabs). It asked
   * `(pointer: coarse)`, which describes only the PRIMARY pointer — so a
   * touchscreen laptop, where the primary pointer can be reported as coarse
   * while a real mouse is attached, had the hover preview switched off entirely
   * and permanently. The owner's report was "hover on colour selector does not
   * do anything", and the mechanism was measured working on a plain desktop.
   *
   * The old test mocked matchMedia to return one value for EVERY query, so it
   * could not have distinguished the two and passed either way.
   */
  const mockPointerQueries = (result: Record<string, boolean>) => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: Object.entries(result).find(([q]) => query.includes(q))?.[1] ?? false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  }

  it('treats a phone as coarse — no fine pointer exists at all', () => {
    mockPointerQueries({ 'pointer: coarse': true, 'any-pointer: fine': false })
    expect(isCoarsePointer()).toBe(true)
  })

  it('does NOT treat a touchscreen laptop as coarse — it has a mouse too', () => {
    // The regression. Primary pointer coarse, but a fine pointer is available,
    // so hover is real and the preview must stay on.
    mockPointerQueries({ 'pointer: coarse': true, 'any-pointer: fine': true })
    expect(isCoarsePointer()).toBe(false)
  })

  it('does not treat a plain desktop as coarse', () => {
    mockPointerQueries({ 'pointer: coarse': false, 'any-pointer: fine': true })
    expect(isCoarsePointer()).toBe(false)
  })
})

/**
 * VA-20 (visual audit, 2026-10-02). Code that decides once, or reads while rendering, cannot see a
 * change that lands between its reads; this is how it hears one. The fake list below can really
 * fire `change`, carrying `matches` the way the browser's own event does.
 */
describe('onReducedMotionChange', () => {
  function reducedMotionList() {
    const listeners = new Set<(event: { matches: boolean }) => void>()
    const queries: string[] = []
    const list = {
      matches: false,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.delete(listener)
      },
    }
    window.matchMedia = vi.fn((query: string) => {
      queries.push(query)
      return list
    }) as unknown as typeof window.matchMedia
    return {
      listeners,
      queries,
      change(matches: boolean) {
        list.matches = matches
        for (const listener of [...listeners]) listener({ matches })
      },
    }
  }

  it('tells the listener the new answer each time the setting changes', () => {
    const fake = reducedMotionList()
    const heard: boolean[] = []
    onReducedMotionChange((reduce) => heard.push(reduce))
    fake.change(true)
    fake.change(false)
    fake.change(true)
    expect(heard).toEqual([true, false, true])
  })

  it('stops telling it once it is removed, and leaves no listener behind', () => {
    const fake = reducedMotionList()
    const heard: boolean[] = []
    const stop = onReducedMotionChange((reduce) => heard.push(reduce))
    expect(fake.listeners.size).toBe(1)
    stop()
    expect(fake.listeners.size).toBe(0)
    fake.change(true)
    expect(heard).toEqual([])
  })

  it('listens for the reduced-motion query and no other', () => {
    const fake = reducedMotionList()
    onReducedMotionChange(() => {})
    expect(fake.queries).toEqual(['(prefers-reduced-motion: reduce)'])
  })
})
