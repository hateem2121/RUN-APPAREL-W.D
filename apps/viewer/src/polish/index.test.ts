import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * VA-20 (visual audit, 2026-10-02). The refined-motion layer — smooth scrolling and the custom
 * cursor — decides ONCE, at startup, whether to run. A visitor who turned reduced motion on during
 * the visit therefore kept both until the next page, which is the opposite of what asking for less
 * motion means. `startPolish` now stops what moves the moment the setting turns on.
 *
 * Turning it back OFF mid-visit does not restart them, on purpose: stopping motion is the half that
 * matters, and the next page picks the setting up from the start.
 *
 * The three modules `startPolish` loads are stood in for, so this is about the wiring and not
 * about Lenis or Motion; `e2e/reduced-motion-live.spec.ts` does it with the real ones.
 */

const mocks = vi.hoisted(() => {
  const stopScroll = vi.fn()
  const stopCursor = vi.fn()
  return {
    stopScroll,
    stopCursor,
    startSmoothScroll: vi.fn(() => stopScroll),
    mountCursor: vi.fn(() => stopCursor),
    startReveals: vi.fn(() => () => {}),
  }
})

vi.mock('./smooth-scroll', () => ({ startSmoothScroll: mocks.startSmoothScroll }))
vi.mock('./Cursor', () => ({ mountCursor: mocks.mountCursor }))
vi.mock('./reveal', () => ({ startReveals: mocks.startReveals }))

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

beforeEach(() => {
  vi.resetModules() // `startPolish` is idempotent through module state; each test starts fresh
  for (const spy of Object.values(mocks)) spy.mockClear()
  reduced = new FakeMediaQueryList(false)
  window.matchMedia = ((query: string) =>
    query.includes('prefers-reduced-motion')
      ? reduced
      : // a fine pointer, so the cursor is wanted
        new FakeMediaQueryList(
          query.includes('any-pointer: fine'),
        )) as unknown as typeof window.matchMedia
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
})

async function start() {
  const { startPolish, stopPolish } = await import('./index')
  startPolish()
  await vi.waitFor(() => {
    expect(mocks.startSmoothScroll).toHaveBeenCalled()
    expect(mocks.mountCursor).toHaveBeenCalled()
  })
  return stopPolish
}

describe('startPolish and a reduced-motion change mid-visit', () => {
  it('starts both layers when motion is allowed (the instrument works)', async () => {
    await start()
    expect(mocks.startSmoothScroll).toHaveBeenCalledTimes(1)
    expect(mocks.mountCursor).toHaveBeenCalledTimes(1)
    expect(mocks.stopScroll).not.toHaveBeenCalled()
    expect(mocks.stopCursor).not.toHaveBeenCalled()
  })

  it('stops the smooth scroll and the cursor when reduced motion is turned on', async () => {
    await start()
    reduced.set(true)
    expect(mocks.stopScroll, 'smooth scrolling is still running').toHaveBeenCalledTimes(1)
    expect(mocks.stopCursor, 'the cursor is still on screen').toHaveBeenCalledTimes(1)
  })

  it('does not bring them back when it is turned off again mid-visit', async () => {
    await start()
    reduced.set(true)
    reduced.set(false)
    expect(mocks.startSmoothScroll).toHaveBeenCalledTimes(1)
    expect(mocks.mountCursor).toHaveBeenCalledTimes(1)
    expect(mocks.stopScroll).toHaveBeenCalledTimes(1)
  })

  it('stops listening once polish is stopped, so nothing leaks', async () => {
    const stopPolish = await start()
    expect(reduced.listenerCount).toBe(1)
    stopPolish()
    expect(reduced.listenerCount).toBe(0)
    reduced.set(true)
    expect(mocks.stopScroll).toHaveBeenCalledTimes(1) // from stopPolish itself, not a second time
  })

  it('does not start either layer for a visitor who already asked for reduced motion', async () => {
    reduced.matches = true
    const { startPolish } = await import('./index')
    startPolish()
    // Long enough for a wrongly scheduled dynamic import to have run.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(mocks.mountCursor).not.toHaveBeenCalled()
    expect(mocks.startSmoothScroll).not.toHaveBeenCalled()
  })
})
