import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitScale, watchWordmarkFit, type WordmarkElement } from './wordmarkFit'

describe('fitScale', () => {
  it('scales the font so the text spans the available width, with a hairline of safety', () => {
    expect(fitScale(1000, 500)).toBeCloseTo(1.99, 2) // 2 × 0.995
    expect(fitScale(500, 1000)).toBeCloseTo(0.4975, 4)
  })
  it('returns 1 when either measurement is missing, so a bad read never blanks the name', () => {
    expect(fitScale(0, 500)).toBe(1)
    expect(fitScale(500, 0)).toBe(1)
    expect(fitScale(Number.NaN, 500)).toBe(1)
  })
})

describe('watchWordmarkFit', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('coalesces writes, ignores its own height changes, and refits after fonts arrive', async () => {
    let resize = () => {}
    let callback: ((time: number) => void) | undefined
    let available = 1000
    const disconnect = vi.fn()
    const cancel = vi.fn()
    const fontListeners = new Map<string, () => void>()
    const el = {
      style: { fontSize: '' },
      get clientWidth() {
        return available
      },
      querySelector: () => ({ scrollWidth: 500 }),
      ownerDocument: {
        fonts: {
          ready: Promise.resolve(),
          addEventListener: (name: string, fn: () => void) => fontListeners.set(name, fn),
          removeEventListener: (name: string) => fontListeners.delete(name),
        },
      },
    } as unknown as WordmarkElement
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(fn: () => void) {
          resize = fn
        }
        observe() {}
        disconnect = disconnect
      },
    )
    const request = vi.fn((fn: (time: number) => void) => {
      callback = fn
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', cancel)
    vi.stubGlobal('getComputedStyle', () => ({ fontSize: '100px' }))
    const stop = watchWordmarkFit(el)
    await Promise.resolve()
    resize()
    resize()
    expect(request).toHaveBeenCalledTimes(1)
    expect(el.style.fontSize).toBe('')
    callback?.(0)
    expect(el.style.fontSize).toBe('199px')
    resize()
    expect(request).toHaveBeenCalledTimes(1)
    available = 500
    resize()
    expect(request).toHaveBeenCalledTimes(2)
    callback?.(0)
    expect(el.style.fontSize).toBe('99.5px')
    fontListeners.get('loadingdone')?.()
    expect(request).toHaveBeenCalledTimes(3)
    stop()
    callback?.(0)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(1)
    expect(fontListeners.size).toBe(0)
  })
  it('does not write after unmount while waiting for fonts', async () => {
    const request = vi.fn()
    vi.stubGlobal('ResizeObserver', undefined)
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const el = { querySelector: () => ({}), ownerDocument: {} } as unknown as WordmarkElement
    const stop = watchWordmarkFit(el)
    stop()
    await Promise.resolve()
    expect(request).not.toHaveBeenCalled()
  })
})
