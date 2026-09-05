import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, SERVICE_WORKER_URL } from './registerServiceWorker'

function harness(overrides: { register?: () => Promise<unknown> } = {}) {
  const register = overrides.register ?? vi.fn(() => Promise.resolve({}))
  const listeners: Record<string, (() => void)[]> = {}
  const windowLike = {
    addEventListener: (type: string, listener: () => void) => {
      const forType = listeners[type] ?? []
      forType.push(listener)
      listeners[type] = forType
    },
  } as unknown as Window
  return {
    register,
    windowLike,
    navigatorLike: { serviceWorker: { register } } as unknown as Navigator,
    fireLoad: () => {
      for (const listener of listeners.load ?? []) listener()
    },
  }
}

describe('registerServiceWorker', () => {
  it('registers /sw.js once the page has loaded', () => {
    const h = harness()
    const attempted = registerServiceWorker({
      production: true,
      navigatorLike: h.navigatorLike,
      windowLike: h.windowLike,
    })
    expect(attempted).toBe(true)
    // NOT before load — registration competes for the connection the shell is on.
    expect(h.register).not.toHaveBeenCalled()
    h.fireLoad()
    expect(h.register).toHaveBeenCalledWith(SERVICE_WORKER_URL)
  })

  /**
   * ⚠️ The dev guard is not tidiness.
   *
   * The emitting plugin is `apply: 'build'`, so `dev` produces no `sw.js`. Vite's
   * SPA fallback would answer that request with `index.html`, and a browser refuses
   * to install a worker served as `text/html` — so every dev page load would carry a
   * registration error in the console. Permanent console noise is how a real error
   * stops being noticed.
   */
  it('does nothing in development, where no sw.js is emitted at all', () => {
    const h = harness()
    expect(
      registerServiceWorker({
        production: false,
        navigatorLike: h.navigatorLike,
        windowLike: h.windowLike,
      }),
    ).toBe(false)
    h.fireLoad()
    expect(h.register).not.toHaveBeenCalled()
  })

  it('does nothing where the API is absent — an old engine, or an insecure origin', () => {
    const h = harness()
    expect(
      registerServiceWorker({
        production: true,
        navigatorLike: {} as Navigator,
        windowLike: h.windowLike,
      }),
    ).toBe(false)
    expect(
      registerServiceWorker({
        production: true,
        navigatorLike: null,
        windowLike: h.windowLike,
      }),
    ).toBe(false)
  })

  it('does nothing with no window — the module must be safe to import anywhere', () => {
    const h = harness()
    expect(
      registerServiceWorker({
        production: true,
        navigatorLike: h.navigatorLike,
        windowLike: null,
      }),
    ).toBe(false)
  })

  /**
   * A rejected registration must not reach the ErrorBoundary.
   *
   * Offline caching is an enhancement. A visitor whose browser refuses the worker —
   * Firefox in a private window does exactly this — must still see the garment, not
   * the branded unavailable screen. An unhandled rejection here would be a total
   * page failure caused by an optional feature.
   */
  it('swallows a rejected registration', async () => {
    const h = harness({ register: vi.fn(() => Promise.reject(new Error('refused'))) })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    registerServiceWorker({
      production: true,
      navigatorLike: h.navigatorLike,
      windowLike: h.windowLike,
    })
    expect(() => h.fireLoad()).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
