import '@run-apparel/ui/footer-prompt.css'
import {
  type FooterHours,
  type FooterSettings,
  isOpenAt,
  opensLabel,
  SITE_FOOTER_WORDS,
  splitLastWord,
  worksClock,
} from '@run-apparel/shared'
import { useEffect, useState } from 'react'
import { SITE_ORIGIN } from '../lib/siteLinks'

/**
 * The footer's prompt on the garment pages: the tab on the slab's edge, the question and the works'
 * live clock, as the website draws them (apps/cms/src/components/site/SiteFooter.tsx, FooterTab.tsx
 * and FooterClock.tsx carry the reasons). The owner asked for the footer to be the same on every
 * page (2026-10-17, home page audit Q11), so the garment pages show it too, beside their own
 * "Ask about this garment".
 *
 * ⚠️ LOADED AFTER THE PAGE HAS PAINTED, WITH ITS OWN STYLESHEET. `Footer.tsx` imports this file
 * lazily, so `footer-prompt.css` arrives with it and never joins the stylesheet that holds a garment
 * page's first paint (2,400 ms on slow 3G, apps/viewer/e2e/firstPaint.spec.ts; 37 more compressed
 * bytes there once cost a whole 150 ms step). The footer is far below the first screen, so the
 * prompt is in place long before anyone scrolls to it.
 */

/** The volt tab on the slab's edge, to the website's Contact page (this page is never Contact). */
export function FooterTab({ label }: { label: string }) {
  return (
    <a className="site-footer__tab" href={`${SITE_ORIGIN}/contact`}>
      <span className="site-footer__tab-label">{label}</span>
      <span className="site-footer__tab-arrow" aria-hidden="true">
        →
      </span>
    </a>
  )
}

/** The question, its two lines and the clock, then the band that holds the slab one screen tall. */
export function FooterQuestion({ footer }: { footer: FooterSettings }) {
  const q = splitLastWord(footer.ctaQuestion)
  return (
    <>
      <div className="footer-cta">
        <div>
          <p className="footer-eyebrow">{SITE_FOOTER_WORDS.eyebrow}</p>
          <h2 className="footer-q">
            {q.head}
            <em>{q.last}</em>
            {q.tail}
          </h2>
          <p className="footer-derisk">{footer.ctaSubline}</p>
          <p className="footer-dim">{footer.ctaPromise}</p>
        </div>
        <div className="footer-side">
          <FooterClock hours={footer.capacity.hours} />
        </div>
      </div>
      <div className="footer-grow" />
    </>
  )
}

/** The works' time, and open or closed when the owner has set hours: the website's FooterClock. */
function FooterClock({ hours }: { hours: FooterHours | null }) {
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
      {open === null || !hours || !now ? null : (
        <span className="footer-status" data-state={open ? 'open' : 'closed'}>
          {open ? SITE_FOOTER_WORDS.openNow : opensLabel(hours, now)}
        </span>
      )}
    </>
  )
}
