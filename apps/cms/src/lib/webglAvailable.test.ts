import { afterEach, describe, expect, it, vi } from 'vitest'
import { webglAvailable } from './webglAvailable'

/*
 * What would have to break: a browser with no WebGL reported as one that draws (CI's Firefox has
 * none, and model-viewer 4.4.0 then swallows the wheel of a zoomed garment that shows nothing),
 * a probe context left alive, or a browser that throws on the probe taking the page down.
 */
function withCanvas(contexts: Record<string, unknown>) {
  const loseContext = vi.fn()
  const getContext = vi.fn((kind: string) => {
    const gl = contexts[kind]
    return gl ? { ...gl, getExtension: () => ({ loseContext }) } : null
  })
  vi.stubGlobal('document', { createElement: () => ({ getContext }) })
  return { getContext, loseContext }
}

afterEach(() => vi.unstubAllGlobals())

describe('webglAvailable', () => {
  it('is true where WebGL 2 draws, and releases the probe context at once', () => {
    const { getContext, loseContext } = withCanvas({ webgl2: {} })
    expect(webglAvailable()).toBe(true)
    expect(getContext).toHaveBeenCalledWith('webgl2')
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it('falls back to WebGL 1', () => {
    const { loseContext } = withCanvas({ webgl: {} })
    expect(webglAvailable()).toBe(true)
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it('is false where neither generation draws (CI’s Firefox)', () => {
    withCanvas({})
    expect(webglAvailable()).toBe(false)
  })

  it('is false, not an error, where the probe throws', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('blocked')
      },
    })
    expect(webglAvailable()).toBe(false)
  })
})
