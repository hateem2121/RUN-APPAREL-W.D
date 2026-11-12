'use client'

import { loaderTiming, type TrackerWindow } from '@run-apparel/shared'
import { useEffect } from 'react'
import { type CurtainRecord, curtainReport } from '../../lib/preloader'

/**
 * Sends how long the first-arrival curtain showed to PostHog, only after Accept (12 Nov 2026, F3).
 * The inline driver writes `window.__runCurtain` when it lifts; this waits up to six seconds for
 * it, then hands the number to `loaderTiming`, which drops it for a visitor who did not accept.
 */
export function CurtainTiming() {
  useEffect(() => {
    const w = window as unknown as { __runCurtain?: CurtainRecord }
    let tries = 24
    const look = window.setInterval(() => {
      const report = curtainReport(w.__runCurtain)
      tries -= 1
      if (report)
        loaderTiming(window as unknown as TrackerWindow, 'curtain', report.shownMs, report.reason)
      if (report || tries <= 0) window.clearInterval(look)
    }, 250)
    return () => window.clearInterval(look)
  }, [])
  return null
}
