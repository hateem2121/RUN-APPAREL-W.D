import { LOOM_MARK_BANDS, LOOM_MARK_PATHS, LOOM_MARK_VIEWBOX } from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'
import type { LoadPhase } from '../lib/loadProgress'
import { formatMb, showsIndeterminateSweep } from '../lib/loadProgress'
import { createTimeLeft, ESTIMATING } from '../lib/timeLeft'

/**
 * S4, the woven mark: five picks laid, held, passed through. `id` is fixed by the caller so the
 * markup of index.html's copy can equal the component's. No inline style: the CSP has no room for
 * one in index.html, so each band's order is its class.
 */
export function LoomMark({ id }: { id: string }) {
  return (
    <svg className="loom-mark" viewBox={LOOM_MARK_VIEWBOX} aria-hidden="true">
      <defs>
        <g id={`${id}-m`}>
          {LOOM_MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {LOOM_MARK_BANDS.map(([y, h], i) => (
          <clipPath id={`${id}-${i}`} key={y}>
            <rect
              className={`loom-mark__pick loom-mark__pick--${i}`}
              x="0"
              y={y}
              width="8000"
              height={h + 40}
            />
          </clipPath>
        ))}
      </defs>
      <use className="loom-mark__bed" href={`#${id}-m`} />
      {LOOM_MARK_BANDS.map(([y], i) => (
        <g clipPath={`url(#${id}-${i})`} key={y}>
          <use href={`#${id}-m`} />
        </g>
      ))}
    </svg>
  )
}

interface WorkingBlockProps {
  phase: LoadPhase
  percent: number | null
  bytesLoaded: number
  bytesTotal: number
  reduceMotion: boolean
  /** The garment's name, until the first byte. */
  name: string
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
  name,
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
            ? name
              ? `Preparing ${name}…`
              : 'Preparing…'
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
