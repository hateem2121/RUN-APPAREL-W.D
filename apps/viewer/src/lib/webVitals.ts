import { track } from './analytics'
import { INP_DURATION_THRESHOLD_MS, createInpTracker } from './inp'

/**
 * Core Web Vitals, reported once per visit through the existing telemetry seam.
 *
 * ⚠️ NOTHING MEASURED THIS PAGE'S SPEED FOR REAL VISITORS UNTIL 2026-09-04. A grep
 * for `web-vitals`, `PerformanceObserver`, `largest-contentful-paint`,
 * `layout-shift`, `LCP` and `CLS` across `src/` and `worker/` returned zero hits.
 * The only automated statement about weight was `check-bundle-budget.mjs`, which
 * reads files off disk and by its own docblock "says nothing about how heavy a
 * production page is" — and `lighthouserc.json`, which runs against a 10 kB
 * placeholder GLB on a CI runner. Neither is a visitor.
 *
 * That matters more here than on an ordinary site: every visit is a QR scan on a
 * phone, on whatever connection the person is standing in, and the thing they wait
 * for is measured in megabytes. "Is it fast?" was answerable only for whoever
 * happened to open it on their own laptop.
 *
 * ⚠️ HAND-ROLLED, NOT THE `web-vitals` LIBRARY, AND THE BUDGET IS THE REASON. That
 * package is ~2 kB gz, which is not the objection; the objection is that this file
 * needs three metrics and the library brings the machinery for six, and
 * `check-bundle-budget.mjs` gates the shell at a deliberately small headroom. Three
 * PerformanceObservers, with INP's arithmetic kept apart in `inp.ts`, are a small file and
 * no dependency.
 *
 * ⚠️ INP JOINED ON 2026-10-02 (visual audit VA-14), AND THIS NOTE USED TO FORBID IT. It read "INP is
 * deliberately absent" and "If INP is ever wanted, take the library — do not hand-roll it from this
 * file's example." The 181 readings of the last 30 days held LCP and layout shift only, so how fast
 * the page answers a tap — a Core Web Vital since March 2024 — was not recorded. It is hand-rolled
 * after all: `inp.ts` has the algorithm (the library's own, rule for rule, each rule pinned by a
 * test) and the reasons it is not the library. It reports `inpMs` and, like `cls`, ONLY where the
 * engine can say so: a browser that lists no `event` entry type reports no INP, never a 0 (the
 * iPhone-CLS lesson, I1).
 *
 * ⚠️ THE PRODUCT CODE RIDES WITH THE REPORT, and it never did before (VA-14). The garment field was
 * EMPTY on all 48 rows that had a value, so a slow model could not be named. The cause was HERE, not
 * in `telemetry.ts` or the endpoint: this module is started from main.tsx before the garment is
 * known and reported `{ lcpMs, cls }` only; `telemetry.ts` forwards a `product` only if the detail
 * carries one, and `events.ts` stores what arrives. So this listens for the page's own load events
 * (`viewer_page_loaded`, `retired_colourway_fallback` and `model_loaded`, each of which carries
 * `product: productCode`) and puts that code on the report. App.tsx needs no change: a garment
 * page is one product per load.
 *
 * ⚠️ REPORTED AT THE END OF THE VISIT, NOT AT LOAD, and that is not an optimisation.
 * LCP is not final until the page is backgrounded or the user interacts, and CLS
 * accumulates for the whole session. Sending either on `load` reports a number that
 * is still moving. `visibilitychange -> hidden` is the documented moment both
 * settle, and `pagehide` is the fallback for browsers that skip it — the same pair
 * `telemetry.ts` already flushes on, so this rides a flush that was going to happen
 * anyway rather than adding a request.
 */

/** Sent once. A second report would double-count a single visit. */
let reported = false

/**
 * `durationThreshold` is in the Event Timing spec and in MDN's `PerformanceObserver.observe()`, and is
 * missing from the installed TypeScript's `PerformanceObserverInit` (tsc 7.0.2 refused the literal
 * on 2026-10-02: "'durationThreshold' does not exist in type 'PerformanceObserverInit'"). An
 * engine that does not know the member ignores it; `apps/viewer/e2e/perfBudgets.spec.ts` casts for
 * the same reason.
 */
type EventObserverInit = PerformanceObserverInit & { durationThreshold?: number }

export function initWebVitals(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}

  let lcp: number | null = null
  let cls = 0
  let productCode: string | undefined
  const observers: PerformanceObserver[] = []

  /**
   * The product this visit is about, from the page's own load events — see the note at the top.
   * A report that carries no product (an unavailable reference, a visit that ended before the
   * garment arrived) simply has none; the endpoint stores that as empty, as it always did.
   * Never read from a `web_vitals` event itself: this module's own report must not feed it.
   */
  const onAnalytics = (event: Event) => {
    const detail = (event as CustomEvent<Record<string, string> | undefined>).detail
    if (detail?.product && detail.event !== 'web_vitals') productCode = detail.product
  }
  document.addEventListener('run:analytics', onAnalytics)

  /**
   * `buffered: true` is load-bearing on both. This module is imported after first
   * paint, so the entries that matter have already been emitted; without it the
   * observer only sees what happens from here on and LCP reads as null on exactly
   * the fast loads it is supposed to praise.
   *
   * Returns whether `observe()` itself succeeded, so a caller can tell "nothing
   * shifted" from "this engine cannot tell me" (I1, 2026-09-23) — see `canReportCls`.
   */
  const observe = (type: string, cb: (entries: PerformanceEntryList) => void): boolean => {
    try {
      const observer = new PerformanceObserver((list) => cb(list.getEntries()))
      observer.observe({ type, buffered: true })
      observers.push(observer)
      return true
    } catch {
      // An engine that does not support this entry type throws on observe(). The
      // metric is simply absent from the report rather than the page breaking.
      return false
    }
  }

  observe('largest-contentful-paint', (entries) => {
    // Last entry wins: the browser emits a new one each time a larger element
    // paints, and only the final one is the LCP.
    const last = entries.at(-1)
    if (last) lcp = last.startTime
  })

  const layoutShiftObserved = observe('layout-shift', (entries) => {
    for (const entry of entries as Array<
      PerformanceEntry & { value: number; hadRecentInput: boolean }
    >) {
      // Shifts within 500ms of a real interaction are the user's own doing —
      // opening the accordion moves content on purpose. Excluding them is what
      // the metric's own definition requires, not a way of flattering the number.
      if (!entry.hadRecentInput) cls += entry.value
    }
  })
  /**
   * I1 (2026-09-23): `observe()` not throwing is not enough. The spec lets an engine
   * accept `observe({ type: 'layout-shift' })` without error and simply never emit an
   * entry — a silent "I do not have this", not "nothing shifted". Before this, every
   * such visit — every iPhone, since Safari has no Layout Instability API at all —
   * stored and reported a CLS of 0.000, which is indistinguishable from a genuinely
   * steady page and pulls the whole catalogue's p75 toward a number nobody measured.
   * `supportedEntryTypes` is the one place an engine says so honestly.
   */
  const canReportCls =
    layoutShiftObserved &&
    (PerformanceObserver.supportedEntryTypes?.includes('layout-shift') ?? false)

  /**
   * INP (VA-14). Only where the engine LISTS the `event` entry type — the same honesty as CLS above:
   * a browser that cannot say reports no INP at all, never a 0 that reads as a perfect score.
   * `durationThreshold` asks the browser to record every interaction of 40ms or more, not only the
   * 104ms it keeps by default, so a fast page is not left with nothing; and this observer is made
   * HERE, at startup, because the browser's buffer keeps only entries of 104ms or longer (W3C Event
   * Timing, working draft of 19 March 2026): a shorter tap is seen only by an observer already
   * watching when it happens.
   * The count of interactions behind the "one in 50 is ignored" rule is the browser's own
   * `performance.interactionCount`; without it the distinct ids seen stand in for it, which is a
   * lower bound and makes the estimate err high.
   */
  const seenInteractions = new Set<number>()
  const inp = createInpTracker(() => {
    const native = (performance as Performance & { interactionCount?: number }).interactionCount
    return typeof native === 'number' ? native : seenInteractions.size
  })
  const feedInp = (entries: PerformanceEntryList) => {
    for (const entry of entries as Array<PerformanceEntry & { interactionId?: number }>) {
      if (entry.interactionId) seenInteractions.add(entry.interactionId)
      inp.add({ interactionId: entry.interactionId, duration: entry.duration })
    }
  }
  let inpObserver: PerformanceObserver | null = null
  if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
    try {
      inpObserver = new PerformanceObserver((list) => feedInp(list.getEntries()))
      // A variable, not a literal at the call: a literal is checked against the narrower lib type.
      const watch: EventObserverInit = {
        type: 'event',
        buffered: true,
        durationThreshold: INP_DURATION_THRESHOLD_MS,
      }
      inpObserver.observe(watch)
      observers.push(inpObserver)
    } catch {
      inpObserver = null
    }
  }

  const report = () => {
    if (reported) return
    reported = true
    const detail: Record<string, string> = {}
    // Rounded: sub-millisecond LCP and four-decimal CLS are false precision from a
    // single visitor on a single connection.
    if (lcp !== null) detail.lcpMs = String(Math.round(lcp))
    if (canReportCls) detail.cls = cls.toFixed(3)
    // The entries the browser has queued but not yet handed to the callback: on a page that is being
    // hidden they can include the visitor's last tap, which waiting for delivery would miss.
    if (inpObserver && typeof inpObserver.takeRecords === 'function') {
      feedInp(inpObserver.takeRecords())
    }
    const interaction = inp.value()
    if (interaction !== null) detail.inpMs = String(Math.round(interaction))
    // Only send something. A report with no metric says nothing and still costs a row in the
    // events table; the product code is not a metric, so it never makes a report on its own.
    if (Object.keys(detail).length === 0) return
    if (productCode) detail.product = productCode
    track('web_vitals', detail)
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') report()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', report)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', report)
    document.removeEventListener('run:analytics', onAnalytics)
    for (const observer of observers) observer.disconnect()
  }
}

/** Test seam: the module-level guard would otherwise leak between cases. */
export function resetWebVitalsForTest(): void {
  reported = false
}
