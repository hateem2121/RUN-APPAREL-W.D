'use client'

import { useEffect, useRef, useState } from 'react'
import { FAMILY_SINCE } from '../../lib/press'
import { counterYear, preloaderLiftAt } from '../../lib/preloader'

/** The count-up's length (`--showpiece`, D26), read from the tokens as CountUp.tsx reads it. */
function showpieceMs(): number {
  const ms = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--showpiece'),
  )
  return Number.isFinite(ms) && ms > 0 ? ms : 1400
}

/**
 * The preloader's year, rolling from 1889 to this year. It does nothing unless the
 * pre-paint script marked <html> (`data-preload="on"`), so reduced motion, automation and every
 * visit the owner's rule leaves out see only the server's "1889" inside a hidden overlay.
 *
 * The race (lib/preloader.ts): the curtain lifts at the count-up's length when the hero photo is
 * ready early, when it has decoded if later, and never later than 2.2 s; the year lands exactly at
 * the lift, so it never stalls. Then `data-preload="lifting"` runs the curtain (site.css) and its
 * end removes the mark, so a later visit to /about within the site shows nothing.
 */
export function PreloaderCounter() {
  const [year, setYear] = useState(Number(FAMILY_SINCE))
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const html = document.documentElement
    if (html.getAttribute('data-preload') !== 'on') return
    const overlay = ref.current?.closest<HTMLElement>('.preloader')
    const to = new Date().getFullYear()
    const showpiece = showpieceMs()
    let decodedAt: number | null = null
    const photo = document.querySelector<HTMLImageElement>('.about-hero .site-hero__img')
    const ready = () => {
      decodedAt ??= performance.now()
    }
    if (photo) photo.decode().then(ready, ready)
    else ready()

    let frame = 0
    const tick = () => {
      // performance.now() counts from the page's start, which is where the floor and ceiling count from.
      const now = performance.now()
      const liftAt = preloaderLiftAt({ decodedAt, showpiece })
      setYear(counterYear({ elapsed: now, liftAt, to }))
      if (now >= liftAt) {
        html.setAttribute('data-preload', 'lifting')
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const done = () => html.removeAttribute('data-preload')
    overlay?.addEventListener('animationend', done)
    return () => {
      cancelAnimationFrame(frame)
      overlay?.removeEventListener('animationend', done)
    }
  }, [])

  return (
    <span className="preloader__year display display--hero" ref={ref}>
      {year}
    </span>
  )
}
