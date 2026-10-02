import {
  type CursorPoint,
  type FooterHours,
  fitScale,
  isOpenAt,
  opensAt,
  SITE_FOOTER_WORDS,
  subscribeToCursor,
  worksClock,
} from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'

/**
 * The footer's three live parts on the garment pages: the clock, the wordmark's fit and the
 * light. The website has the same three as separate client islands
 * (apps/cms/src/components/site/FooterClock.tsx, FooterWordmark.tsx, FooterGlow.tsx), and these
 * follow them line for line; the reasoning lives there. Two implementations, the arrangement the
 * custom cursor already uses (FA-Q-03): the rules they compute from are shared
 * (@run-apparel/shared footerHours, wordmarkFit, cursorBus), and so is the stylesheet.
 */

/** A live Sialkot clock, and the open/closed light when hours are set. `--:--` until mounted. */
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
        <span className="footer-status" data-state={open ? 'open' : 'closed'}>
          {open ? SITE_FOOTER_WORDS.openNow : opensAt(hours.open)}
        </span>
      )}
    </>
  )
}

/** The company's name at the slab's width, fitted after the fonts arrive and on every resize. */
export function FooterWordmark({ text }: { text: string }) {
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const base = el.querySelector<HTMLElement>('.footer-mark__layer')
    if (!base) return

    const fit = () => {
      el.style.fontSize = ''
      const scale = fitScale(el.clientWidth, base.scrollWidth)
      el.style.fontSize = `${Number.parseFloat(getComputedStyle(el).fontSize) * scale}px`
    }
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.then(fit)
    // No ResizeObserver (jsdom, a pre-2020 browser): fit once, as the bar does (Header.tsx).
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="footer-mark" ref={wrap} data-lit="false">
      <div className="footer-mark__layer" aria-hidden="true">
        {text}
      </div>
      <div className="footer-mark__layer footer-mark__layer--lit" aria-hidden="true">
        {text}
      </div>
    </div>
  )
}

/** Anything under the light that should carry it instead of the halo. */
const CONTENT =
  'a, .footer-q, .footer-eyebrow, .footer-derisk, .footer-dim, .footer-block, .footer-clock, .footer-status, .footer-legal, .footer-mark'

/** How long the content keeps the light after the point leaves it. */
const LINGER_MS = 180

/**
 * ONE light for the whole slab, from the cursor ring's TRAILED point (the cursor bus), never the
 * raw pointer. It runs only while the cursor publishes — fine pointers, motion allowed, outside
 * automation — so it is exactly as present as the cursor, which polish/Cursor.tsx mounts under
 * the same three conditions.
 */
export function FooterGlow() {
  const first = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const slab = first.current?.parentElement
    if (!slab) return
    const mark = slab.querySelector<HTMLElement>('.footer-mark')
    const lit = slab.querySelector<HTMLElement>('.footer-mark__layer--lit')
    const inside = (r: DOMRect, x: number, y: number) =>
      x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    let glowOn = false
    let lastOverAt = Number.NEGATIVE_INFINITY
    let lastPoint: CursorPoint | null = null
    let settle = 0

    const light = (point: CursorPoint) => {
      lastPoint = point
      window.clearTimeout(settle)
      const r = slab.getBoundingClientRect()
      const on = point.placed && inside(r, point.x, point.y)
      if (on !== glowOn) {
        glowOn = on
        slab.dataset.glow = String(on)
      }
      if (!on) {
        if (mark?.dataset.lit === 'true') mark.dataset.lit = 'false'
        return
      }
      slab.style.setProperty('--gx', `${point.x - r.left}px`)
      slab.style.setProperty('--gy', `${point.y - r.top}px`)

      const under = document.elementFromPoint(point.x, point.y)
      const overNow = Boolean(under && slab.contains(under) && under.closest(CONTENT))
      if (overNow) lastOverAt = point.now
      const lingering = !overNow && point.now - lastOverAt < LINGER_MS
      slab.dataset.over = String(overNow || lingering)
      // The linger needs its own tick: the bus publishes only while the ring moves.
      if (lingering) {
        settle = window.setTimeout(
          () => {
            if (lastPoint) light({ ...lastPoint, now: performance.now() })
          },
          LINGER_MS - (point.now - lastOverAt) + 1,
        )
      }

      if (mark && lit) {
        const m = mark.getBoundingClientRect()
        if (inside(m, point.x, point.y)) {
          lit.style.setProperty('--mx', `${point.x - m.left}px`)
          lit.style.setProperty('--my', `${point.y - m.top}px`)
          mark.dataset.lit = 'true'
        } else if (mark.dataset.lit === 'true') {
          mark.dataset.lit = 'false'
        }
      }
    }
    const unsubscribe = subscribeToCursor(light)
    return () => {
      window.clearTimeout(settle)
      unsubscribe()
    }
  }, [])

  return (
    <>
      <div className="footer-glow footer-glow--grid" aria-hidden="true" ref={first} />
      <div className="footer-glow footer-glow--transfer" aria-hidden="true" />
      <div className="footer-glow footer-glow--halo" aria-hidden="true" />
    </>
  )
}
