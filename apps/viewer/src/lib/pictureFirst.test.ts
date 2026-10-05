import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PICTURE_HEAD_START_MAX_MS, pictureHeadStart } from './pictureFirst'

/** Records when the wait ends without awaiting it, so "still waiting" can be asserted too. */
function watch(wait: Promise<void>) {
  const state = { over: false }
  void wait.then(() => {
    state.over = true
  })
  return state
}

/** A picture on its way: jsdom fetches no images, so `complete` stays false until an event. */
function pictureOnItsWay(): HTMLImageElement {
  const img = document.createElement('img')
  img.src = 'https://media.example/garment-poster.webp'
  return img
}

describe('pictureHeadStart (polish F13)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds the model while the picture is on its way', async () => {
    const state = watch(pictureHeadStart(pictureOnItsWay(), new AbortController().signal))
    await vi.advanceTimersByTimeAsync(PICTURE_HEAD_START_MAX_MS - 1)
    expect(state.over).toBe(false)
  })

  it.each(['load', 'error'])(
    'lets the model start the moment the picture ends with %s',
    async (type) => {
      const img = pictureOnItsWay()
      const { signal } = new AbortController()
      const unhooked = vi.spyOn(signal, 'removeEventListener')
      const state = watch(pictureHeadStart(img, signal))
      img.dispatchEvent(new Event(type))
      await vi.advanceTimersByTimeAsync(0)
      expect(state.over).toBe(true)
      // Nothing is left listening: not the timer, and not the download's own signal.
      expect(vi.getTimerCount()).toBe(0)
      expect(unhooked).toHaveBeenCalledWith('abort', expect.any(Function))
    },
  )

  it('holds it no longer than the head start for a picture that never arrives', async () => {
    const state = watch(pictureHeadStart(pictureOnItsWay(), new AbortController().signal))
    await vi.advanceTimersByTimeAsync(PICTURE_HEAD_START_MAX_MS)
    expect(state.over).toBe(true)
  })

  it('does not hold it at all with no picture, or one already in from the cache', async () => {
    const cached = pictureOnItsWay()
    Object.defineProperty(cached, 'complete', { value: true })
    for (const picture of [null, cached]) {
      const state = watch(pictureHeadStart(picture, new AbortController().signal))
      await vi.advanceTimersByTimeAsync(0)
      expect(state.over).toBe(true)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops when the download is called off, leaving no listener or timer behind', async () => {
    const img = pictureOnItsWay()
    const removed = vi.spyOn(img, 'removeEventListener')
    const controller = new AbortController()
    const state = watch(pictureHeadStart(img, controller.signal))
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.over).toBe(true)
    expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(['error', 'load'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not wait on a download that was already called off', async () => {
    const controller = new AbortController()
    controller.abort()
    const state = watch(pictureHeadStart(pictureOnItsWay(), controller.signal))
    await vi.advanceTimersByTimeAsync(0)
    expect(state.over).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
