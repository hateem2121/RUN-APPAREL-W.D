import '@run-apparel/ui/footer-prompt.css'
import {
  type ChromeWords,
  type FooterHours,
  type FooterSettings,
  isOpenAt,
  nextOpening,
  splitLastWord,
  worksClock,
} from '@run-apparel/shared'
import { useEffect, useState } from 'react'

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
export function FooterTab({ label, href }: { label: string; href: string }) {
  return (
    <a className="site-footer__tab" href={href}>
      <span className="site-footer__tab-label">{label}</span>
      <span className="site-footer__tab-arrow" aria-hidden="true">
        →
      </span>
    </a>
  )
}

/** The question, its two lines and the clock, then the band that holds the slab one screen tall. */
export function FooterQuestion({ footer, words }: { footer: FooterSettings; words: ChromeWords }) {
  const q = splitLastWord(footer.ctaQuestion)
  return (
    <>
      <div className="footer-cta">
        <div>
          <p className="footer-eyebrow">{words.footer.eyebrow}</p>
          <h2 className="footer-q">
            {q.head}
            <em>{q.last}</em>
            {q.tail}
          </h2>
          <p className="footer-derisk">{footer.ctaSubline}</p>
          <p className="footer-dim">{footer.ctaPromise}</p>
        </div>
        <div className="footer-side">
          <FooterClock hours={footer.capacity.hours} words={words} />
        </div>
      </div>
      <div className="footer-grow" />
    </>
  )
}

/** The works' time, and open or closed when the owner has set hours: the website's FooterClock. */
function FooterClock({ hours, words }: { hours: FooterHours | null; words: ChromeWords }) {
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
        <span className="footer-clock__city">{words.footer.clockCity}</span>
        <span className="footer-clock__time">
          <span>{now ? worksClock(now) : '--:--'}</span>
          <small>{words.footer.clockZone}</small>
        </span>
      </span>
      {open === null || !hours || !now ? null : (
        <span className="footer-status" data-state={open ? 'open' : 'closed'}>
          {open
            ? words.footer.openNow
            : words.opensAt(
                hours.open,
                nextOpening(hours, now).daysAhead === 0 ? undefined : nextOpening(hours, now).day,
              )}
        </span>
      )}
    </>
  )
}
