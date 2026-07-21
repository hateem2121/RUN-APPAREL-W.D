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
  it('isCoarsePointer reflects the query result', () => {
    mockMatchMedia(true)
    expect(isCoarsePointer()).toBe(true)
  })
})
