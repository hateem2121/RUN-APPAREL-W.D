'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { followFootEdge } from '../../lib/footEdge'

/**
 * A full-width sticky box that tells iPhone Safari when it has left the screen's foot
 * (lib/footEdge.ts has the WebKit rule). It only marks `data-edge`; the page's CSS decides what
 * that hides, inside the same query that makes the box sticky. The About page's hero uses it since
 * the site check-up of 2026-10-22: in Safari's Compact layout its sticky stage left the strip under
 * the bar paper-coloured at the end of the page, under the dark footer.
 */
export function FootEdgeBox({ className, children }: { className: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = box.current
    return element ? followFootEdge([element]) : undefined
  }, [])
  return (
    <div className={className} ref={box}>
      {children}
    </div>
  )
}
