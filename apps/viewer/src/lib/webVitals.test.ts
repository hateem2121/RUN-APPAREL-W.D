import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initWebVitals, resetWebVitalsForTest } from './webVitals'

/**
 * Nothing measured this page's speed for real visitors before 2026-09-04, so every
 * assertion here is about a number that did not previously exist. The failure mode
 * these guard against is the quiet one: a reporter that installs cleanly, observes
 * nothing, and sends an empty row forever.
 */

type Cb = (list: { getEntries: () => unknown[] }) => void

let callbacks: Record<string, Cb>
let disconnected: number
/**
 * ⚠️ EVERY `initWebVitals()` MUST BE TORN DOWN, and forgetting cost three failing
 * tests that looked like bugs in the module. It registers listeners on the SHARED
 * jsdom `window`/`document`, and `reported` is module-level. A reporter left behind
 * by an earlier test therefore fires on the next test's `pagehide`, claims the
 * single-report flag with its own empty closure, and suppresses the reporter the
 * test is actually asserting on. The symptom is a report that arrives with no
 * metrics in it — which reads exactly like the module failing to observe anything.
 */
const started: Array<() => void> = []
function start() {
  const stop = initWebVitals()
  started.push(stop)
  return stop
}

class FakeObserver {
  // I1 (2026-09-23): a real engine's CLS gate checks this static, so a fake that
  // omits it silently fails every test in this file that expects a cls — this is
  // what the '0.070' case at :108 needs to keep passing.
  static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift']
  private cb: Cb
  constructor(cb: Cb) {
    this.cb = cb
  }
  observe({ type }: { type: string; buffered?: boolean }) {
    callbacks[type] = this.cb
  }
  disconnect() {
    disconnected++
  }
}

beforeEach(() => {
  callbacks = {}
  disconnected = 0
  resetWebVitalsForTest()
  vi.stubGlobal('PerformanceObserver', FakeObserver)
})

afterEach(() => {
  for (const stop of started.splice(0)) stop()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function emit(type: string, entries: unknown[]) {
  callbacks[type]?.({ getEntries: () => entries })
}

function trackedEvents() {
  const seen: Array<{ event: string; [k: string]: unknown }> = []
  document.addEventListener('run:analytics', (e) => {
    seen.push((e as CustomEvent).detail)
  })
  return seen
}

describe('initWebVitals', () => {
  it('observes the two metrics it claims to, with buffered entries', () => {
    // `buffered: true` is load-bearing: this module is imported after first paint,
    // so without it LCP reads as null on exactly the fast loads it should praise.
    const observed: Array<{ type: string; buffered?: boolean }> = []
    class Recording extends FakeObserver {
      override observe(init: { type: string; buffered?: boolean }) {
        observed.push(init)
        super.observe(init)
      }
    }
    vi.stubGlobal('PerformanceObserver', Recording)
    start()
    expect(observed.map((o) => o.type).sort()).toEqual(['largest-contentful-paint', 'layout-shift'])
    expect(observed.every((o) => o.buffered === true)).toBe(true)
  })

  it('reports the LAST LCP entry, not the first', () => {
    // The browser emits a new entry each time a larger element paints. Taking the
    // first would report the moment a placeholder appeared, not the garment.
    const seen = trackedEvents()
    start()
    emit('largest-contentful-paint', [{ startTime: 800 }, { startTime: 2400 }])
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.lcpMs).toBe('2400')
  })

  it('excludes layout shifts that follow a real interaction', () => {
    // Opening the accordion moves content on purpose. Counting it would report the
    // visitor's own action as instability — and the metric's definition excludes it.
    const seen = trackedEvents()
    start()
    emit('layout-shift', [
      { value: 0.05, hadRecentInput: false },
      { value: 0.4, hadRecentInput: true },
      { value: 0.02, hadRecentInput: false },
    ])
    window.dispatchEvent(new Event('pagehide'))
    expect(seen[0]?.cls).toBe('0.070')
  })

  it('reports once per visit, however many times the page is hidden', () => {
    const seen = trackedEvents()
    start()
    emit('largest-contentful-paint', [{ startTime: 1200 }])
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new Event('pagehide'))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(seen, 'a second report would double-count one visit').toHaveLength(1)
  })

  it('survives an engine that does not support an entry type', () => {
    // PerformanceObserver.observe() THROWS on an unknown type rather than no-oping.
    // The metric should be absent from the report, not take the page down.
    class Hostile extends FakeObserver {
      override observe(init: { type: string }) {
        if (init.type === 'layout-shift') throw new TypeError('unsupported')
        super.observe(init)
      }
    }
    vi.stubGlobal('PerformanceObserver', Hostile)
    const seen = trackedEvents()
    expect(() => start()).not.toThrow()
    emit('largest-contentful-paint', [{ startTime: 900 }])
    window.dispatchEvent(new Event('pagehide'))
    expect(seen[0]?.lcpMs).toBe('900')
    // I1: before the fix this was '0.000' — a throw was silently reported as a
    // perfectly steady page. cls must be ABSENT, not zero.
    expect(seen[0]?.cls).toBeUndefined()
  })

  it('reports no cls when the engine accepts observe() but silently has no such entries (I1)', () => {
    // The spec's OTHER failure shape: an engine may accept
    // observe({ type: 'layout-shift' }) without throwing and simply never emit an
    // entry for it — a silent "I do not have this", not "nothing shifted". Every
    // iPhone visit was exactly this case, since Safari has no Layout Instability
    // API at all, and it was indistinguishable from a real 0.000 before this fix.
    class SilentlyUnsupported extends FakeObserver {
      static override supportedEntryTypes = ['largest-contentful-paint']
    }
    vi.stubGlobal('PerformanceObserver', SilentlyUnsupported)
    const seen = trackedEvents()
    start()
    emit('largest-contentful-paint', [{ startTime: 900 }])
    // No layout-shift entry is ever emitted — the engine simply never calls back.
    window.dispatchEvent(new Event('pagehide'))
    expect(seen[0]?.lcpMs).toBe('900')
    expect(seen[0]?.cls).toBeUndefined()
  })

  it('does nothing at all where PerformanceObserver is absent', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    const seen = trackedEvents()
    const stop = start()
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toHaveLength(0)
    expect(() => stop()).not.toThrow()
  })

  it('disconnects its observers on teardown', () => {
    const stop = start()
    stop()
    expect(disconnected).toBe(2)
  })
})
