/**
 * The cursor ring's trailed position, published once per painted frame by Cursor.tsx
 * and consumed by anything that must be lit FROM the ring rather than from the raw
 * pointer. Measured 2026-09-05 on the design artifact: lit from the pointer, the
 * footer's halo sat at x=738 while the ring was still gliding through x=348, so the
 * glow visibly detached from the cursor on every fast move.
 *
 * A module-level singleton, which is correct here: there is one cursor per document
 * and every subscriber wants the same point.
 */
export interface CursorPoint {
  x: number
  y: number
  /** false once the pointer has left the window; subscribers switch off */
  placed: boolean
  now: number
}

const listeners = new Set<(point: CursorPoint) => void>()
let last: CursorPoint | null = null

export function subscribeToCursor(fn: (point: CursorPoint) => void): () => void {
  listeners.add(fn)
  if (last) fn(last)
  return () => {
    listeners.delete(fn)
  }
}

export function publishCursor(point: CursorPoint): void {
  last = point
  for (const fn of listeners) fn(point)
}

/** Test seam. */
export function resetCursorBus(): void {
  listeners.clear()
  last = null
}
