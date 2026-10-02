import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initWebVitals, resetWebVitalsForTest } from './webVitals'

/**
 * VA-14 (visual audit, 2026-10-02), the browser half: the speed report now carries INP and the
 * garment's product code. `webVitals.test.ts` keeps the LCP and layout-shift cases (its engine
 * lists no `event` entry type, so it never sees an INP observer); this file's engine lists all
 * three.
 *
 * What would have to break for these to fail: the `event` observer made without the entry type
 * being listed, or without asking for the shorter taps; the last tap before the visitor leaves
 * (still queued in the observer when the page is hidden) left out; a visit with no tap reporting
 * a 0 that reads as a perfect score; the garment's code never reaching the report (the visible
 * symptom was an empty garment on every row); or the listener that learns the code outliving the
 * module's teardown.
 */

type Entry = { interactionId?: number; duration: number }
type Cb = (list: { getEntries: () => unknown[] }) => void

let callbacks: Record<string, Cb>
let observed: Array<Record<string, unknown>>
let queued: Entry[]
let disconnected: string[]

/** `takeRecords` is part of the real interface: it hands over what the browser has not delivered. */
class FakeObserver {
  static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift', 'event']
  private cb: Cb
  private type = ''
  constructor(cb: Cb) {
    this.cb = cb
  }
  observe(init: { type: string }) {
    this.type = init.type
    observed.push(init)
    callbacks[init.type] = this.cb
  }
  takeRecords() {
    if (this.type !== 'event') return []
    return queued.splice(0)
  }
  disconnect() {
    disconnected.push(this.type)
  }
}

/** Every `initWebVitals()` must be torn down: see the note on `started` in webVitals.test.ts. */
const started: Array<() => void> = []
function start() {
  const stop = initWebVitals()
  started.push(stop)
  return stop
}

const reports: Array<Record<string, unknown>> = []
const collect = (event: Event) => {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail
  if (detail.event === 'web_vitals') reports.push(detail)
}

beforeEach(() => {
  callbacks = {}
  observed = []
  queued = []
  disconnected = []
  reports.length = 0
  resetWebVitalsForTest()
  vi.stubGlobal('PerformanceObserver', FakeObserver)
  document.addEventListener('run:analytics', collect)
})

afterEach(() => {
  for (const stop of started.splice(0)) stop()
  document.removeEventListener('run:analytics', collect)
  Reflect.deleteProperty(performance, 'interactionCount')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const emit = (type: string, entries: unknown[]) => callbacks[type]?.({ getEntries: () => entries })
const leave = () => window.dispatchEvent(new Event('pagehide'))
const track = (detail: Record<string, string>) =>
  document.dispatchEvent(new CustomEvent('run:analytics', { detail }))

describe('INP in the speed report (VA-14)', () => {
  it('watches taps of 40ms and longer, from the start, only where the engine lists them', () => {
    start()
    const watch = observed.find((init) => init.type === 'event')
    expect(watch, 'no observer for the `event` entry type').toBeDefined()
    // Without `durationThreshold` the browser keeps only 104ms and longer: a fast page would
    // report nothing, and the buffer holds nothing shorter for an observer made later.
    expect(watch).toMatchObject({ buffered: true, durationThreshold: 40 })
  })

  it('does not ask an engine that does not list `event` to watch it', () => {
    class NoEvents extends FakeObserver {
      static override supportedEntryTypes = ['largest-contentful-paint', 'layout-shift']
    }
    vi.stubGlobal('PerformanceObserver', NoEvents)
    start()
    expect(observed.map((init) => init.type)).not.toContain('event')
    emit('largest-contentful-paint', [{ startTime: 900 }])
    leave()
    expect(reports[0]?.lcpMs).toBe('900')
    expect(reports[0]?.inpMs, 'a browser that cannot say reports no INP, never a 0').toBeUndefined()
  })

  it('reports the slowest tap of the visit, rounded, as inpMs', () => {
    start()
    emit('event', [
      { interactionId: 1, duration: 48 },
      { interactionId: 2, duration: 216 },
      { interactionId: 3, duration: 96 },
    ])
    emit('largest-contentful-paint', [{ startTime: 1200 }])
    leave()
    expect(reports).toHaveLength(1)
    expect(reports[0]?.inpMs).toBe('216')
    expect(reports[0]?.lcpMs, 'the other numbers still travel with it').toBe('1200')
  })

  it('counts an entry that is not part of an interaction for nothing', () => {
    start()
    emit('event', [{ duration: 800 }, { interactionId: 0, duration: 800 }])
    emit('largest-contentful-paint', [{ startTime: 700 }])
    leave()
    expect(reports[0]?.inpMs).toBeUndefined()
  })

  it('reports NO inpMs for a visit with no tap, though the engine could have measured one', () => {
    start()
    emit('largest-contentful-paint', [{ startTime: 700 }])
    leave()
    expect(reports[0]).not.toHaveProperty('inpMs')
  })

  it('takes in the tap the browser has not delivered yet when the visitor leaves', () => {
    // On a page being hidden the observer's queue can still hold the visitor's last tap, which the
    // browser has not yet handed to the callback.
    start()
    emit('event', [{ interactionId: 1, duration: 64 }])
    queued.push({ interactionId: 2, duration: 328 })
    emit('largest-contentful-paint', [{ startTime: 700 }])
    leave()
    expect(reports[0]?.inpMs).toBe('328')
    expect(queued, 'the queue was taken, not just read').toHaveLength(0)
  })

  it("lets the browser's own interaction count decide how many taps are ignored", () => {
    // 100 interactions with only three slow enough to be seen: the two worst are ignored.
    Object.defineProperty(performance, 'interactionCount', { value: 100, configurable: true })
    start()
    emit('event', [
      { interactionId: 11, duration: 600 },
      { interactionId: 12, duration: 400 },
      { interactionId: 13, duration: 200 },
    ])
    emit('largest-contentful-paint', [{ startTime: 700 }])
    leave()
    expect(reports[0]?.inpMs).toBe('200')
  })

  it('without that count, takes the slowest tap it saw', () => {
    start()
    emit('event', [
      { interactionId: 11, duration: 600 },
      { interactionId: 12, duration: 400 },
    ])
    leave()
    expect(reports[0]?.inpMs).toBe('600')
  })

  it('keeps the other numbers when watching taps is refused by the engine', () => {
    class RefusesEvents extends FakeObserver {
      override observe(init: { type: string }) {
        if (init.type === 'event') throw new TypeError('unsupported')
        super.observe(init)
      }
    }
    vi.stubGlobal('PerformanceObserver', RefusesEvents)
    expect(() => start()).not.toThrow()
    emit('largest-contentful-paint', [{ startTime: 900 }])
    leave()
    expect(reports[0]?.lcpMs).toBe('900')
    expect(reports[0]?.inpMs).toBeUndefined()
  })
})

describe("the garment's product code on the speed report (VA-14)", () => {
  it('carries the code the page was loaded with', () => {
    // The visible symptom was an EMPTY garment on every row: this module starts before the garment
    // is known, and the report had never named one.
    start()
    track({ event: 'viewer_page_loaded', product: 'R-XPS' })
    emit('largest-contentful-paint', [{ startTime: 900 }])
    leave()
    expect(reports[0]?.product).toBe('R-XPS')
  })

  it.each(['viewer_page_loaded', 'retired_colourway_fallback', 'model_loaded'])(
    'learns it from %s, which carries it',
    (event) => {
      start()
      track({ event, product: 'R-MM' })
      emit('largest-contentful-paint', [{ startTime: 900 }])
      leave()
      expect(reports[0]?.product).toBe('R-MM')
    },
  )

  it('names no garment when the page never learned one', () => {
    start()
    emit('largest-contentful-paint', [{ startTime: 900 }])
    leave()
    expect(reports[0]).not.toHaveProperty('product')
  })

  it('does not take a code from an event that carries none, or from a report of its own kind', () => {
    start()
    track({ event: 'colourway_selected', variant: 'wine' })
    // Something else posting a `web_vitals` event with a product must not name this visit's garment.
    track({ event: 'web_vitals', product: 'NOT-OURS' })
    reports.length = 0
    emit('largest-contentful-paint', [{ startTime: 900 }])
    leave()
    expect(reports, 'exactly the report this module sent').toHaveLength(1)
    expect(reports[0]).not.toHaveProperty('product')
  })

  it('sends no report at all for a visit that measured nothing, product or not', () => {
    // A row with only a garment says nothing about speed and still costs a row in the table. An
    // engine that lists no entry types can measure nothing, which is the case that leaves it empty
    // (one that lists layout-shift always has a steadiness number, a measured 0 included).
    class ListsNothing extends FakeObserver {
      static override supportedEntryTypes: string[] = []
    }
    vi.stubGlobal('PerformanceObserver', ListsNothing)
    start()
    track({ event: 'viewer_page_loaded', product: 'R-XPS' })
    leave()
    expect(reports).toHaveLength(0)
  })
})

describe('what teardown takes away (VA-14)', () => {
  it('disconnects all three observers', () => {
    start()()
    expect([...disconnected].sort()).toEqual(['event', 'largest-contentful-paint', 'layout-shift'])
  })

  it('stops listening for the garment: every listener it adds on the document is removed', () => {
    // A listener left behind would keep a closed module alive and, on a later start, count twice.
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const stop = start()
    const added = add.mock.calls.filter(([type]) => type === 'run:analytics').map(([, fn]) => fn)
    expect(added, 'the module listens for the page load events').not.toHaveLength(0)
    stop()
    const removed = remove.mock.calls
      .filter(([type]) => type === 'run:analytics')
      .map(([, fn]) => fn)
    for (const listener of added) expect(removed).toContain(listener)
  })
})
