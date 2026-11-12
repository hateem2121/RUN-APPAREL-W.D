import { loaderTiming, type TrackerWindow } from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'
import type { LoadPhase } from '../lib/loadProgress'
import { formatMb, showsIndeterminateSweep } from '../lib/loadProgress'
import { MOTION_REST_AFTER_MS } from '../lib/motion'
import { createTimeLeft, ESTIMATING } from '../lib/timeLeft'
import { LoomMark } from './LoomMark'

interface WorkingBlockProps {
  phase: LoadPhase
  percent: number | null
  bytesLoaded: number
  bytesTotal: number
  reduceMotion: boolean
  /** "Download stopped, trying again", when it did. */
  retryNote: string | null
}

/**
 * The Working block (owner, 30 Oct 2026): S4 in a button, with %, MB done and left, and time left.
 *
 * ⚠️ NEVER SAYS "READY" WHILE THE MODEL IS STILL BEING DECODED. The approved demo had nothing after
 * the last byte. A real garment does: `preparing` is decode and shader compile, with no number to
 * show (lib/loadProgress.ts), so at 100% it says so and the line goes back to a moving pick.
 *
 * ⚠️ ONE STRING PER ELEMENT, always rendered: a translated page throws if React removes a text node
 * the browser has replaced (LoadingTitle's incident, 2026-10-08). `aria-hidden` for the reason
 * Stage's comment gives; the coarse live region there is what a screen reader hears.
 */
export function WorkingBlock({
  phase,
  percent,
  bytesLoaded,
  bytesTotal,
  reduceMotion,
  retryNote,
}: WorkingBlockProps) {
  const ref = useRef<HTMLDivElement>(null)
  const clock = useRef(createTimeLeft())
  const [waking, setWaking] = useState(false)
  const [resting, setResting] = useState(false)

  // How long the block showed, sent when the download is over (F3; PostHog after Accept only).
  useEffect(() => {
    const shownFrom = performance.now()
    return () =>
      loaderTiming(
        window as unknown as TrackerWindow,
        'model_3d',
        performance.now() - shownFrom,
        'ended',
      )
  }, [])

  // S4 starts after 1 s: a quick load never shows a loop it has no time to finish.
  useEffect(() => {
    const id = window.setTimeout(() => setWaking(true), 1000)
    return () => window.clearTimeout(id)
  }, [])

  // And rests after five seconds of weaving (C1, WCAG 2.2.2); the numbers keep moving.
  useEffect(() => {
    if (!waking) return
    const id = window.setTimeout(() => setResting(true), MOTION_REST_AFTER_MS)
    return () => window.clearTimeout(id)
  }, [waking])

  // The garment stands above the block, never under it: page.css reads this height.
  useEffect(() => {
    const el = ref.current
    const host = el?.parentElement
    if (!el || !host || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      host.style.setProperty('--working-h', `${el.offsetHeight}px`)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      host.style.removeProperty('--working-h')
    }
  }, [])

  const started = bytesLoaded > 0
  const preparing = phase === 'preparing'
  const fraction = bytesTotal > 0 ? Math.min(1, bytesLoaded / bytesTotal) : 0
  const pending = !started && !preparing
  const sweep = showsIndeterminateSweep(preparing ? 'preparing' : 'downloading', reduceMotion)
  const pick = (sweep || pending) && !reduceMotion
  const left = Math.max(0, bytesTotal - bytesLoaded)
  const when = preparing
    ? 'Almost ready'
    : pending || bytesTotal === 0
      ? ESTIMATING
      : clock.current.read(fraction, performance.now())

  return (
    <>
      {/* The browser's own bar, for assistive technology to ask at any moment (C2). The visible bar
          below stays a scaled stripe: a width-based bar costs a layout pass ten times a second (the
          2026-08-14 fix in page.css), so this one is not drawn. No value while preparing: working. */}
      <progress
        className="visually-hidden"
        aria-label="3D model download"
        max={100}
        {...(!preparing && percent !== null ? { value: percent } : {})}
      />
      <div
        ref={ref}
        className={`stage__loading working${waking && !resting && !reduceMotion ? '' : ' working--rest'}`}
        aria-hidden="true"
      >
        <span className="working__mark">
          <LoomMark id="stage-loom" />
        </span>
        <span className="stage__loading-title">
          <span>{preparing ? 'Preparing' : 'Working'}</span>
          <span> · 3D view</span>
        </span>
        <span className="working__pct">
          {preparing ? '100%' : started && percent === null ? '' : `${percent ?? 0}%`}
        </span>
        <span className={`stage__loading-bar${pick ? ' stage__loading-bar--indeterminate' : ''}`}>
          <span
            style={
              !pick && phase === 'downloading' && percent !== null
                ? { transform: `scaleX(${percent / 100})` }
                : undefined
            }
          />
        </span>
        <span className="working__meta">
          <span>
            {pending
              ? 'Preparing…'
              : preparing
                ? `${formatMb(bytesTotal)} MB downloaded`
                : `${formatMb(bytesLoaded)} MB done`}
          </span>
          <span>{started && !preparing && bytesTotal > 0 ? `${formatMb(left)} MB left` : ''}</span>
          <span>{when}</span>
        </span>
        {retryNote && <span className="stage__loading-detail">{retryNote}</span>}
      </div>
    </>
  )
}
