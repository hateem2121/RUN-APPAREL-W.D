import { track } from './analytics'

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
 * needs two metrics and the library brings the machinery for six, and
 * `check-bundle-budget.mjs` gates the shell at a deliberately small headroom. Two
 * PerformanceObservers are forty lines and no dependency.
 *
 * ⚠️ LCP AND CLS ONLY. INP is deliberately absent: measuring it properly means
 * grouping event-timing entries per interaction and tracking the worst, which is
 * exactly the machinery `web-vitals` exists for and is not worth reimplementing
 * from a specification. If INP is ever wanted, take the library — do not hand-roll
 * it from this file's example.
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

export function initWebVitals(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}

  let lcp: number | null = null
  let cls = 0
  const observers: PerformanceObserver[] = []

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

  const report = () => {
    if (reported) return
    reported = true
    const detail: Record<string, string> = {}
    // Rounded: sub-millisecond LCP and four-decimal CLS are false precision from a
    // single visitor on a single connection.
    if (lcp !== null) detail.lcpMs = String(Math.round(lcp))
    if (canReportCls) detail.cls = cls.toFixed(3)
    // Only send something. A report with neither metric says nothing and still
    // costs a row in the events table.
    if (Object.keys(detail).length > 0) track('web_vitals', detail)
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') report()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', report)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', report)
    for (const observer of observers) observer.disconnect()
  }
}

/** Test seam: the module-level guard would otherwise leak between cases. */
export function resetWebVitalsForTest(): void {
  reported = false
}
