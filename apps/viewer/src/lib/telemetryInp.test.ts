import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTelemetry } from './telemetry'
import { initWebVitals, resetWebVitalsForTest } from './webVitals'

/**
 * VA-14 (visual audit, 2026-10-02): the speed report now carries INP and the garment's product
 * code all the way to the beacon. `telemetry.test.ts` holds the LCP and layout-shift cases; this
 * file holds the third number, and the one test that walks the whole way from the page's own
 * load event to the beacon, which is the way the garment went missing: each of the three modules
 * did what it was written to do, and the product still arrived empty on every row.
 *
 * What would have to break for these to fail: `inpMs` not forwarded (or forwarded as the text the
 * browser module hands over), a number that cannot be read sent anyway, the INP attached to a
 * different event, or any of the three modules dropping the garment on the way out.
 */

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
  Reflect.deleteProperty(document, 'visibilityState')
  vi.unstubAllGlobals()
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

describe('initTelemetry — the INP number (VA-14)', () => {
  it('sends inpMs as a number, beside the other two', async () => {
    stop = initTelemetry()
    analytics({ event: 'web_vitals', lcpMs: '2400', cls: '0.012', inpMs: '216', product: 'R-XPS' })
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon.mock.calls[0]?.[0]).toBe(ENDPOINT)
    expect(await batchOf(beacon.mock.calls[0] as unknown[])).toEqual([
      {
        type: 'analytics',
        event: 'web_vitals',
        product: 'R-XPS',
        lcpMs: 2400,
        cls: 0.012,
        inpMs: 216,
      },
    ])
  })

  it('sends the response time alone when the engine measured nothing else', async () => {
    stop = initTelemetry()
    analytics({ event: 'web_vitals', inpMs: '104' })
    window.dispatchEvent(new Event('pagehide'))
    expect(await batchOf(beacon.mock.calls[0] as unknown[])).toEqual([
      { type: 'analytics', event: 'web_vitals', inpMs: 104 },
    ])
  })

  it('sends no inpMs it cannot read, and not a 0 for a blank one, and still sends the visit', async () => {
    // `Number('')` is 0: a perfect score nobody earned.
    stop = initTelemetry()
    analytics({ event: 'web_vitals', lcpMs: '900', inpMs: '' })
    analytics({ event: 'web_vitals', lcpMs: '900', inpMs: 'quick' })
    window.dispatchEvent(new Event('pagehide'))
    // A speed report is flushed the moment it is queued, so each left in a beacon of its own.
    const sent = (await Promise.all(beacon.mock.calls.map((call) => batchOf(call)))).flat()
    expect(sent).toEqual([
      { type: 'analytics', event: 'web_vitals', lcpMs: 900 },
      { type: 'analytics', event: 'web_vitals', lcpMs: 900 },
    ])
  })

  it('never attaches it to another event', async () => {
    stop = initTelemetry()
    analytics({ event: 'model_loaded', inpMs: '216' })
    window.dispatchEvent(new Event('pagehide'))
    expect(await batchOf(beacon.mock.calls[0] as unknown[])).toEqual([
      { type: 'analytics', event: 'model_loaded' },
    ])
  })
})

describe('from the page load to the beacon: one visit, three modules (VA-14)', () => {
  type Cb = (list: { getEntries: () => unknown[] }) => void

  /** A browser that lists all three entry types, and a tap still waiting in its queue. */
  function visit() {
    const callbacks: Record<string, Cb> = {}
    const queue: Array<{ interactionId: number; duration: number }> = []
    class FakeObserver {
      static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift', 'event']
      private cb: Cb
      private type = ''
      constructor(cb: Cb) {
        this.cb = cb
      }
      observe({ type }: { type: string }) {
        this.type = type
        callbacks[type] = this.cb
      }
      takeRecords() {
        return this.type === 'event' ? queue.splice(0) : []
      }
      disconnect() {}
    }
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.stubGlobal('PerformanceObserver', FakeObserver)
    resetWebVitalsForTest()
    return { callbacks, queue }
  }

  it('the beacon carries the garment, the loading time, the steadiness and the slowest tap', async () => {
    const { callbacks, queue } = visit()
    stop = initTelemetry()
    const stopVitals = initWebVitals()
    try {
      // The page starts, and learns its garment later: the order that left every row empty.
      analytics({ event: 'viewer_page_loaded', product: 'R-XPS' })
      callbacks['largest-contentful-paint']?.({ getEntries: () => [{ startTime: 2399.6 }] })
      callbacks['layout-shift']?.({ getEntries: () => [{ value: 0.012, hadRecentInput: false }] })
      callbacks.event?.({ getEntries: () => [{ interactionId: 1, duration: 72 }] })
      queue.push({ interactionId: 2, duration: 232 })
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      const sent = (await batchOf(beacon.mock.calls.at(-1) as unknown[])) as Array<{
        event: string
      }>
      expect(sent.find((row) => row.event === 'web_vitals')).toEqual({
        type: 'analytics',
        event: 'web_vitals',
        product: 'R-XPS',
        lcpMs: 2400,
        cls: 0.012,
        inpMs: 232,
      })
    } finally {
      stopVitals()
      resetWebVitalsForTest()
    }
  })

  it('a visit that never learned its garment still sends its numbers, with none named', async () => {
    const { callbacks } = visit()
    stop = initTelemetry()
    const stopVitals = initWebVitals()
    try {
      callbacks['largest-contentful-paint']?.({ getEntries: () => [{ startTime: 900 }] })
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      expect(await batchOf(beacon.mock.calls.at(-1) as unknown[])).toEqual([
        { type: 'analytics', event: 'web_vitals', lcpMs: 900, cls: 0 },
      ])
    } finally {
      stopVitals()
      resetWebVitalsForTest()
    }
  })
})
