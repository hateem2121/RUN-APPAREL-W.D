import { useEffect, useRef, useState } from 'react'
import type { LoadPhase } from '../lib/loadProgress'
import { formatMb, showsIndeterminateSweep } from '../lib/loadProgress'
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

  // S4 starts after 1 s: a quick load never shows a loop it has no time to finish.
  useEffect(() => {
    const id = window.setTimeout(() => setWaking(true), 1000)
    return () => window.clearTimeout(id)
  }, [])

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
    <div
      ref={ref}
      className={`stage__loading working${waking && !reduceMotion ? '' : ' working--rest'}`}
      aria-hidden="true"
    >
      <span className="working__mark">
        <LoomMark id="stage-loom" />
      </span>
      <span className="stage__loading-title">
        {preparing ? 'Preparing · 3D garment' : 'Working · 3D garment'}
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
  )
}
