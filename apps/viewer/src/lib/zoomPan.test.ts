import { describe, expect, it } from 'vitest'
import { clampView, IDENTITY, MAX_SCALE, panBy, toggleZoomAt, zoomAt } from './zoomPan'

const BOX = { width: 400, height: 500 }

describe('zoomAt', () => {
  it('keeps the point under the finger still while zooming', () => {
    // The whole point of zooming "at" a point: the pixel of the render under the
    // pinch midpoint must stay under it, or the picture slides away mid-gesture.
    const point = { x: 100, y: 150 }
    const next = zoomAt(IDENTITY, 2, point, BOX)
    const localBefore = {
      x: (point.x - IDENTITY.x) / IDENTITY.scale,
      y: (point.y - IDENTITY.y) / IDENTITY.scale,
    }
    const localAfter = { x: (point.x - next.x) / next.scale, y: (point.y - next.y) / next.scale }
    expect(next.scale).toBe(2)
    expect(localAfter.x).toBeCloseTo(localBefore.x)
    expect(localAfter.y).toBeCloseTo(localBefore.y)
  })

  it('never zooms out past the fitted picture', () => {
    expect(zoomAt(IDENTITY, 0.25, { x: 200, y: 250 }, BOX)).toEqual(IDENTITY)
  })

  it('stops at the maximum', () => {
    expect(zoomAt(IDENTITY, 100, { x: 0, y: 0 }, BOX).scale).toBe(MAX_SCALE)
  })

  it('refuses a factor that is not a finite positive number', () => {
    // A pinch whose two fingers land on one pixel divides by zero; the view must
    // survive it rather than become NaN and blank the picture.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomAt(IDENTITY, bad, { x: 10, y: 10 }, BOX)).toEqual(IDENTITY)
    }
  })
})

describe('clampView', () => {
  it('never lets an edge of the zoomed picture come inside the frame', () => {
    const view = clampView({ scale: 2, x: 50, y: -2000 }, BOX)
    expect(view.x).toBe(0)
    expect(view.y).toBe(BOX.height - BOX.height * 2)
  })

  it('snaps the offset back to zero at the fitted size', () => {
    expect(clampView({ scale: 1, x: -30, y: 12 }, BOX)).toEqual(IDENTITY)
  })
})

describe('panBy', () => {
  it('does nothing while the picture is not zoomed', () => {
    expect(panBy(IDENTITY, 40, 40, BOX)).toEqual(IDENTITY)
  })

  it('moves a zoomed picture, inside its bounds', () => {
    const zoomed = zoomAt(IDENTITY, 2, { x: 200, y: 250 }, BOX)
    const moved = panBy(zoomed, 10, -10, BOX)
    expect(moved.x).toBe(zoomed.x + 10)
    expect(moved.y).toBe(zoomed.y - 10)
  })
})

describe('toggleZoomAt', () => {
  it('zooms in at the tapped point, then back out on the next double-tap', () => {
    const inView = toggleZoomAt(IDENTITY, { x: 120, y: 80 }, BOX)
    expect(inView.scale).toBeGreaterThan(1)
    expect(toggleZoomAt(inView, { x: 120, y: 80 }, BOX)).toEqual(IDENTITY)
  })
})
