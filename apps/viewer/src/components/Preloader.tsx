import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/capabilities'
import { PRELOADER_MIN_DWELL_MS, PRELOADER_WIPE_MS } from '../lib/motion'

interface PreloaderProps {
  /** Data is ready — begin the exit. */
  done: boolean
  /** Called once the preloader has fully left the screen. */
  onExited: () => void
}

/**
 * The branded entrance, covering the CMS data fetch only — measured at
 * 1.77–2.27 s.
 *
 * ⚠️ IT DELIBERATELY SHOWS NO NUMBER. Until 2026-08-13 it displayed a large
 * `N°XXX` counter driven by `p + (90 - p) * 0.05` per animation frame: a curve
 * unrelated to any real work, which reached 90 and stopped while the 27 MB
 * garment had not begun to arrive. It was the most prominent thing on screen and
 * it was fiction. The real figures are counted byte by byte and shown by
 * `<Stage>`, which is still mounted for the ~23 s that actually matter.
 *
 * ⚠️ AND IT RENDERS UNDER REDUCED MOTION. It used to `return null` there, and
 * `App` pairs it with `<div className="page" aria-hidden="true" />` during
 * loading — so a visitor who asked for less motion got one empty div hidden from
 * assistive technology, i.e. a blank page and total silence. `docs/DESIGN.md` §5
 * says the preference removes the MOTION, not the CONTENT; that rule was written
 * about CSS and this inversion was in JS. What reduced motion removes here is the
 * sweep and the wipe, not the words.
 */
export function Preloader({ done, onExited }: PreloaderProps) {
  const reduce = typeof window !== 'undefined' && (prefersReducedMotion() || navigator.webdriver)
  const [exiting, setExiting] = useState(false)
  const startRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0)

  useEffect(() => {
    if (!done) return
    if (reduce) {
      // No wipe to wait for. Hand back immediately so the page is never held
      // behind an animation that is not going to play.
      onExited()
      return
    }
    const wait = Math.max(0, PRELOADER_MIN_DWELL_MS - (performance.now() - startRef.current))
    const toExit = window.setTimeout(() => setExiting(true), wait)
    return () => clearTimeout(toExit)
  }, [done, reduce, onExited])

  /*
   * The hand-off waits for the wipe FROM THE MOMENT THE WIPE BEGINS (MO-10).
   *
   * It was scheduled beside the exit, at `wait + PRELOADER_WIPE_MS` from the same instant,
   * and a busy main thread fired both overdue timers back to back. Measured 2026-09-25 in
   * Chromium: one 913ms long task right after the page appears (the 3D engine loading), the
   * exit landing at 1028ms instead of ~440, and the unmount at 1221 — a 193ms wipe, or 1ms
   * in five test runs out of five. A phone decoding a large model can do the same. Timing
   * the hand-off from `exiting` keeps the whole 800ms whatever the thread was doing.
   * 760 until 2026-08-14, against a wipe CSS runs for --slow (800ms): derived, so the two
   * cannot disagree again.
   */
  useEffect(() => {
    if (!exiting) return
    const toDone = window.setTimeout(onExited, PRELOADER_WIPE_MS)
    return () => clearTimeout(toDone)
  }, [exiting, onExited])

  return (
    /*
     * NO `role="status"` HERE, and that is a fix rather than an omission.
     *
     * It carried `role="status"` plus `aria-label="Loading product reference"`,
     * which does not do what it reads like. `aria-label` NAMES a region; it is
     * not an announcement. And a live region announces its CONTENTS when they
     * CHANGE — nothing inside this overlay ever changes, so the region had
     * nothing to say and the label was never spoken. Meanwhile the whole
     * document behind it is `aria-hidden` (App.tsx), so a screen-reader user got
     * silence for the 1.77–2.27s the CMS fetch takes.
     *
     * One real sentence, in the normal reading order, is what actually reaches
     * them. The live region belongs to <Stage>, where the text genuinely mutates.
     */
    <div className={`preloader${exiting ? ' preloader--exit' : ''}`}>
      <div className="preloader__grid blueprint" aria-hidden="true" />
      <div className="preloader__inner">
        <span className="visually-hidden">Loading the product reference.</span>
        <span className="label" aria-hidden="true">
          [ 3D PRODUCT REFERENCE ]
        </span>
        {/*
          Indeterminate, not a percentage: a sweep says "working" without claiming
          an amount nobody has measured. Omitted entirely under reduced motion —
          a sweep that cannot sweep is a bar frozen at one width, which reads as
          a stalled download. The sentence below carries the meaning either way.
        */}
        {!reduce && (
          <span className="preloader__rule preloader__rule--indeterminate" aria-hidden="true">
            <span />
          </span>
        )}
        {/* "PREPARING…" — this covers the CMS data fetch, and naming nothing is
            the honest option. It said "PREPARING REFERENCE…" while <Stage> said
            "LOADING REFERENCE" for a different, longer event, so one noun stood
            for two operations seconds apart. Stage now says "3D MODEL"; this
            names the only thing it can truthfully name, which is nothing. */}
        <span className="mono preloader__status" aria-hidden="true">
          PREPARING…
        </span>
      </div>
    </div>
  )
}
