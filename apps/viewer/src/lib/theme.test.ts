import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appliedTheme, setTheme, storedTheme, toggleTheme } from './theme'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockMatchMedia(false)
})

describe('storedTheme', () => {
  it('returns a stored valid choice', () => {
    localStorage.setItem('run-theme', 'dark')
    expect(storedTheme()).toBe('dark')
  })
  it('returns null when unset or invalid', () => {
    expect(storedTheme()).toBeNull()
    localStorage.setItem('run-theme', 'chartreuse')
    expect(storedTheme()).toBeNull()
  })
})

describe('appliedTheme', () => {
  it('prefers the stored choice over the system preference', () => {
    localStorage.setItem('run-theme', 'light')
    mockMatchMedia(true) // system says dark
    expect(appliedTheme()).toBe('light')
  })
  it('falls back to the system preference', () => {
    mockMatchMedia(true)
    expect(appliedTheme()).toBe('dark')
    mockMatchMedia(false)
    expect(appliedTheme()).toBe('light')
  })
})

describe('setTheme / toggleTheme', () => {
  it('persists the choice and applies data-theme', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('run-theme')).toBe('dark')
  })
  it('toggles from the currently applied theme', () => {
    setTheme('light')
    expect(toggleTheme()).toBe('dark')
    expect(toggleTheme()).toBe('light')
  })
})

describe('setTheme + the View Transitions API', () => {
  // Sentry VIEWER-9, 2026-09-04. `startViewTransition().ready` REJECTS whenever the
  // browser skips the transition — a second tap inside the 500ms cross-fade, or
  // toggling while the tab is hidden. The rejection was unhandled, so it surfaced as
  // an uncaught `InvalidStateError` on the live page.
  //
  // ⚠️ NEGATIVE CONTROL: delete the `.catch()` in theme.ts and this test MUST fail.
  // Verified by doing exactly that on 2026-09-04 — it reported
  // `unhandled: ["InvalidStateError: Transition was aborted because of invalid state"]`.
  // Without that check this test passes against the broken code, because the theme
  // still applies either way and every other assertion here would stay green.
  function withViewTransition(ready: Promise<unknown>) {
    // Cast through Record rather than intersecting Document: the DOM lib declares
    // startViewTransition as REQUIRED, so an intersection leaves it non-optional
    // and `delete` is then a type error (TS2790).
    const doc = document as unknown as Record<string, unknown>
    const original = doc.startViewTransition
    doc.startViewTransition = (cb: () => void) => {
      cb()
      return { ready, finished: Promise.resolve(), updateCallbackDone: Promise.resolve() }
    }
    return () => {
      doc.startViewTransition = original
    }
  }

  async function unhandledRejectionsDuring(run: () => void): Promise<string[]> {
    const seen: string[] = []
    const onUnhandled = (reason: unknown) => seen.push(String(reason))
    process.on('unhandledRejection', onUnhandled)
    try {
      run()
      // Node decides "unhandled" at the end of a turn, so a macrotask is required;
      // a bare `await Promise.resolve()` is not enough and passes vacuously.
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    return seen
  }

  it('does not leak an unhandled rejection when the browser skips the transition', async () => {
    const skipped = Promise.reject(
      new DOMException('Transition was aborted because of invalid state', 'InvalidStateError'),
    )
    const restore = withViewTransition(skipped)
    try {
      const unhandled = await unhandledRejectionsDuring(() => setTheme('dark'))
      expect(unhandled).toEqual([])
      // and the theme still applied — a skipped transition must not lose the change
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(localStorage.getItem('run-theme')).toBe('dark')
    } finally {
      restore()
    }
  })

  it('still applies the theme when the transition resolves normally', async () => {
    const restore = withViewTransition(Promise.resolve())
    try {
      const unhandled = await unhandledRejectionsDuring(() => setTheme('light'))
      expect(unhandled).toEqual([])
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    } finally {
      restore()
    }
  })
})
