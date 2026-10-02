'use client'

import {
  type FooterHours,
  isOpenAt,
  opensAt,
  SITE_FOOTER_WORDS,
  worksClock,
} from '@run-apparel/shared'
import { useEffect, useState } from 'react'

/**
 * A live Sialkot clock and, when the owner has set hours, an open/closed light derived
 * from them. Renders `--:--` and no light on the server and on the first client render,
 * so the markup hydrates without a mismatch and JavaScript-off readers see an honest
 * placeholder rather than a frozen time.
 *
 * "HQ & works": the owner confirmed 2026-09-05 that HQ, office and factory are all at
 * the one Daska Road address.
 */
export function FooterClock({ hours }: { hours: FooterHours | null }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const open = now && hours ? isOpenAt(hours, now) : null

  return (
    <>
      <span className="footer-clock">
        <i aria-hidden="true" />
        <span className="footer-clock__city">{SITE_FOOTER_WORDS.clockCity}</span>
        <span className="footer-clock__time">
          <span>{now ? worksClock(now) : '--:--'}</span>
          <small>{SITE_FOOTER_WORDS.clockZone}</small>
        </span>
      </span>
      {open === null || !hours ? null : (
        // `data-state`, NOT `data-open`: publicSite.test.ts forbids `data-open` in the
        // site's CSS so a state attribute can never hide the nav links again. This is a
        // status light, not a disclosure, and it does not need that name.
        <span className="footer-status" data-state={open ? 'open' : 'closed'}>
          {open ? SITE_FOOTER_WORDS.openNow : opensAt(hours.open)}
        </span>
      )}
    </>
  )
}
