import { afterEach, describe, expect, it, vi } from 'vitest'
import { canRender3D, isCoarsePointer, prefersReducedMotion } from './capabilities'

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
