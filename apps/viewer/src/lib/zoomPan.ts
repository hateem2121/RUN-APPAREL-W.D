/**
 * The zoom-and-pan arithmetic behind the HD image dialog, kept out of the component
 * so it can be tested without a browser (2026-09-27).
 *
 * A view is `translate(x, y) scale(scale)` with `transform-origin: 0 0`, applied to
 * a picture already fitted into a frame of `box` size. So a point `q` on the fitted
 * picture lands on screen at `(x + q.x * scale, y + q.y * scale)`, and every function
 * here keeps that one equation true.
 *
 * Why hand-written, not a library: the dialog needs four operations — zoom at a point,
 * pan, clamp, double-tap toggle — and the zoom libraries on npm each bring their own
 * gesture engine and styles for a few dozen lines of arithmetic.
 */

export interface View {
  scale: number
  x: number
  y: number
}

export interface Box {
  width: number
  height: number
}

export const IDENTITY: View = { scale: 1, x: 0, y: 0 }

/**
 * 4× the fitted size. A 1,816 × 2,751 render fitted into a 390-pixel phone frame is
 * shown at ~0.21× its pixels, so 4× still stays under the render's own resolution —
 * past that a buyer would be zooming into blur, not into detail.
 */
export const MAX_SCALE = 4

/** Where a double-tap lands: close enough to read a printed label on the chest. */
export const DOUBLE_TAP_SCALE = 2.5

/** Keep every edge of a zoomed picture outside the frame, so no empty band shows. */
export function clampView(view: View, box: Box): View {
  const scale = Math.min(MAX_SCALE, Math.max(1, view.scale))
  if (scale === 1) return IDENTITY
  const minX = box.width - box.width * scale
  const minY = box.height - box.height * scale
  return {
    scale,
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
  }
}

/** Multiply the zoom by `factor`, keeping the picture's pixel under `point` still. */
export function zoomAt(
  view: View,
  factor: number,
  point: { x: number; y: number },
  box: Box,
): View {
  if (!Number.isFinite(factor) || factor <= 0) return view
  const scale = Math.min(MAX_SCALE, Math.max(1, view.scale * factor))
  const ratio = scale / view.scale
  return clampView(
    {
      scale,
      x: point.x - (point.x - view.x) * ratio,
      y: point.y - (point.y - view.y) * ratio,
    },
    box,
  )
}

/** Drag a zoomed picture. At the fitted size there is nothing to drag. */
export function panBy(view: View, dx: number, dy: number, box: Box): View {
  if (view.scale === 1) return view
  return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, box)
}

/** Double-tap: zoom in at the tapped point, or back out to the fitted picture. */
export function toggleZoomAt(view: View, point: { x: number; y: number }, box: Box): View {
  if (view.scale > 1) return IDENTITY
  return zoomAt(view, DOUBLE_TAP_SCALE, point, box)
}
