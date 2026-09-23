import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diagnostic } from './diagnostic'
import { initTelemetry } from './telemetry'
import { initWebVitals, resetWebVitalsForTest } from './webVitals'

// telemetry reads VITE_API_BASE_URL at import time. This used to say the endpoint
// was deterministic "with none set in tests", which was FALSE on any machine
// carrying apps/viewer/.env.local — a gitignored file Vite loads automatically. CI
// never has one and passed forever; a machine that had run the CMS locally failed
// forever. vitest.config.ts now PINS the value, the same way playwright.config.ts
// pins PORT, so the environment cannot move it. Found 2026-08-26.
const ENDPOINT = 'https://cms.wear-run.help/api/public/events'

let stop: () => void = () => {}
let beacon: ReturnType<typeof vi.fn>

function setNav(prop: string, value: unknown) {
  Object.defineProperty(navigator, prop, { value, configurable: true, writable: true })
}

beforeEach(() => {
  beacon = vi.fn().mockReturnValue(true)
  setNav('sendBeacon', beacon)
  setNav('webdriver', false)
  setNav('doNotTrack', null)
})

afterEach(() => {
  stop()
  stop = () => {}
  vi.restoreAllMocks()
})

const analytics = (detail: Record<string, string>) =>
  document.dispatchEvent(new CustomEvent('run:analytics', { detail }))

// jsdom's Blob has no .text(); read it via FileReader, which jsdom implements.
const readText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
const batchOf = async (call: unknown[]) => JSON.parse(await readText(call[1] as Blob))

describe('initTelemetry', () => {
  it('no-ops under automation (webdriver)', () => {
    setNav('webdriver', true)
    stop = initTelemetry()
    for (let i = 0; i < 12; i += 1) analytics({ event: 'model_loaded' })
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).not.toHaveBeenCalled()
  })

  it('batches analytics and flushes on the threshold via sendBeacon', async () => {
    stop = initTelemetry()
    for (let i = 0; i < 10; i += 1) analytics({ event: 'colourway_selected', product: 'N001' })
    expect(beacon).toHaveBeenCalledTimes(1)
    const [url] = beacon.mock.calls[0]!
    expect(url).toBe(ENDPOINT)
    const arr = await batchOf(beacon.mock.calls[0]!)
    expect(arr).toHaveLength(10)
    expect(arr[0]).toMatchObject({
      type: 'analytics',
      event: 'colourway_selected',
      product: 'N001',
    })
  })

  it('drops analytics under Do-Not-Track but still sends errors', async () => {
    setNav('doNotTrack', '1')
    stop = initTelemetry()
    analytics({ event: 'model_loaded' })
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).toHaveBeenCalledTimes(1)
    const arr = await batchOf(beacon.mock.calls[0]!)
    expect(arr).toEqual([
      expect.objectContaining({ type: 'error', event: 'client_error', message: 'boom' }),
    ])
  })

  it('caps and de-duplicates client errors', async () => {
    stop = initTelemetry()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })) // duplicate
    for (const m of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      window.dispatchEvent(new ErrorEvent('error', { message: m }))
    }
    window.dispatchEvent(new Event('pagehide'))
    const arr = await batchOf(beacon.mock.calls[0]!)
    const errors = arr.filter((e: { type: string }) => e.type === 'error')
    expect(errors).toHaveLength(5) // MAX_ERRORS, deduped
    expect(errors.map((e: { message: string }) => e.message)).toEqual([
      'boom',
      'e1',
      'e2',
      'e3',
      'e4',
    ])
  })

  /**
   * The seam between `diagnostic()` and this file, where a report lost its name.
   *
   * Both use `kind` for the event NAME, and `diagnostic()` spread its detail after it —
   * so `viewer-load-failed`, reported by App.tsx with its failure class in a `kind`
   * field, was stored as an event called `server`. The 2026-09-11 weekly digest then
   * listed `server` and `network` rows that nothing emits under those names. Each file
   * was right on its own; only a test that runs both can see it.
   */
  it('stores a diagnostic under its own name even when its detail carries `kind`', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stop = initTelemetry()
    diagnostic('viewer-load-failed', {
      product: 'rxps',
      variant: 'wine',
      kind: 'server',
      reason: 'Viewer API responded 500',
    })
    window.dispatchEvent(new Event('pagehide'))
    const arr = await batchOf(beacon.mock.calls[0]!)
    expect(arr).toEqual([
      {
        type: 'diagnostic',
        event: 'viewer-load-failed',
        product: 'rxps',
        variant: 'wine',
        message: 'Viewer API responded 500',
      },
    ])
  })
})

/**
 * PAGE SPEED (audit PF-05b, 2026-09-17). webVitals.ts has measured LCP and CLS since
 * 2026-09-04, and this file dropped both on every visit: `onAnalytics` forwarded only the
 * name, product, variant and placement. The CMS stores them only as numbers.
 */
describe('initTelemetry — the page-speed numbers (PF-05b)', () => {
  it('sends a web_vitals report with its two numbers, as numbers', async () => {
    stop = initTelemetry()
    analytics({ event: 'web_vitals', lcpMs: '2400', cls: '0.012', product: 'rxps' })
    window.dispatchEvent(new Event('pagehide'))
    expect(await batchOf(beacon.mock.calls[0]!)).toEqual([
      { type: 'analytics', event: 'web_vitals', product: 'rxps', lcpMs: 2400, cls: 0.012 },
    ])
  })

  it('sends no number it cannot read, and still sends the visit', async () => {
    stop = initTelemetry()
    analytics({ event: 'web_vitals', lcpMs: 'soon', cls: '' })
    window.dispatchEvent(new Event('pagehide'))
    expect(await batchOf(beacon.mock.calls[0]!)).toEqual([
      { type: 'analytics', event: 'web_vitals' },
    ])
  })

  // webVitals.ts sets `lcpMs` only when an LCP entry actually fired, so a real visit
  // can report `cls` with the `lcpMs` key entirely absent, not just blank or invalid.
  it('sends the steadiness number alone when the engine measured no loading time', async () => {
    stop = initTelemetry()
    analytics({ event: 'web_vitals', cls: '0.012' })
    window.dispatchEvent(new Event('pagehide'))
    expect(await batchOf(beacon.mock.calls[0]!)).toEqual([
      { type: 'analytics', event: 'web_vitals', cls: 0.012 },
    ])
  })

  it('never attaches the numbers to another event', async () => {
    stop = initTelemetry()
    analytics({ event: 'model_loaded', lcpMs: '2400', cls: '0.012' })
    window.dispatchEvent(new Event('pagehide'))
    expect(await batchOf(beacon.mock.calls[0]!)).toEqual([
      { type: 'analytics', event: 'model_loaded' },
    ])
  })

  /**
   * The seam, end to end, in main.tsx's order: telemetry first, then the reporter. Each
   * file passed its own tests while the numbers never left the page; only a test that
   * runs both can see that.
   */
  it('carries what webVitals.ts measured all the way into the beacon', async () => {
    type Cb = (list: { getEntries: () => unknown[] }) => void
    const callbacks: Record<string, Cb> = {}
    class FakeObserver {
      // I1 (2026-09-23): webVitals.ts now checks this static before ever attaching
      // a cls to the report — without it every visit here would silently lose cls,
      // exactly the bug I1 fixes.
      static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift']
      private cb: Cb
      constructor(cb: Cb) {
        this.cb = cb
      }
      observe({ type }: { type: string; buffered?: boolean }) {
        callbacks[type] = this.cb
      }
      disconnect() {}
    }
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.stubGlobal('PerformanceObserver', FakeObserver)
    resetWebVitalsForTest()
    stop = initTelemetry()
    const stopVitals = initWebVitals()
    try {
      callbacks['largest-contentful-paint']?.({ getEntries: () => [{ startTime: 2399.6 }] })
      callbacks['layout-shift']?.({
        getEntries: () => [{ value: 0.012, hadRecentInput: false }],
      })
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pagehide'))
      expect(beacon).toHaveBeenCalledTimes(1)
      expect(await batchOf(beacon.mock.calls[0]!)).toContainEqual({
        type: 'analytics',
        event: 'web_vitals',
        lcpMs: 2400,
        cls: 0.012,
      })
    } finally {
      stopVitals()
      resetWebVitalsForTest()
      Reflect.deleteProperty(document, 'visibilityState')
      vi.unstubAllGlobals()
    }
  })
})
