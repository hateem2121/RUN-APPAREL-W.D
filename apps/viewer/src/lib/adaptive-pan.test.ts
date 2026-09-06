import { describe, expect, it } from 'vitest'
import {
  adaptivePanSensitivity,
  GAIN_PER_SENSITIVITY,
  MODEL_VIEWER_PAN_CONSTANT,
  PAN_FOV_IN,
  PAN_FOV_OUT,
  PAN_SENS_IN,
  PAN_SENS_OUT,
  PAN_SENS_STEP,
  panScreenGain,
  shouldWritePan,
} from './adaptive-pan'

/**
 * The curve is a deliberate trade, so the tests assert the two ENDPOINTS and the
 * shape between them — not a table of values, which would just restate the
 * implementation and fail on any legitimate re-tuning.
 *
 * The one number that is NOT ours is checked against the library's own constant:
 * see "1:1 at full zoom" below.
 */
describe('adaptivePanSensitivity', () => {
  it('is unchanged at the default framing — the safety property', () => {
    // ⚠️ THIS IS THE MOST IMPORTANT ASSERTION IN THE FILE. 0.3 is the value the
    // 2026-08-19 off-screen defect was measured against: at 1.0 an asymmetric
    // pinch shoved the garment off screen with its edge clipped. Starting the
    // curve here is what makes the whole change a no-op for that gesture.
    expect(adaptivePanSensitivity(PAN_FOV_OUT)).toBeCloseTo(PAN_SENS_OUT, 10)
  })

  it('reaches exactly 1:1 finger tracking at full zoom', () => {
    expect(adaptivePanSensitivity(PAN_FOV_IN)).toBeCloseTo(PAN_SENS_IN, 10)
  })

  it('1:1 means 1:1 against model-viewer OWN constant, not against a copy of it', () => {
    // Derived from the library's `PAN_SENSITIVITY = 0.018`, so a model-viewer
    // upgrade that changes it fails HERE rather than quietly changing how the
    // garment feels under a finger. That is the only reason this indirection
    // exists — 1.0313 hardcoded would pass forever.
    expect(GAIN_PER_SENSITIVITY).toBeCloseTo((MODEL_VIEWER_PAN_CONSTANT * 180) / Math.PI, 12)
    expect(panScreenGain(adaptivePanSensitivity(PAN_FOV_IN))).toBeCloseTo(1, 2)
  })

  it('reproduces the measured shipped gain at the default framing', () => {
    // The device measured 120 points of finger -> 37 points of garment = 0.308.
    // The formula says 0.3094. If this drifts, either the endpoint moved or the
    // library's constant did — both worth stopping for.
    expect(panScreenGain(PAN_SENS_OUT)).toBeCloseTo(0.309, 3)
  })

  it('rises monotonically as the visitor zooms in, with no knee', () => {
    // A power law is a straight line in log-log space; the practical assertion is
    // that it never reverses or plateaus between the endpoints.
    const samples = Array.from({ length: 60 }, (_, i) => PAN_FOV_OUT - (i * 29) / 59)
    let previous = -Infinity
    for (const fov of samples) {
      const value = adaptivePanSensitivity(fov)
      expect(value, `not increasing at fov=${fov.toFixed(2)}`).toBeGreaterThan(previous)
      previous = value
    }
  })

  it('never leaves the band, however far the camera is driven', () => {
    for (const fov of [PAN_FOV_OUT, 45, 90, 179]) {
      expect(adaptivePanSensitivity(fov)).toBeCloseTo(PAN_SENS_OUT, 10)
    }
    for (const fov of [PAN_FOV_IN, 0.5, 0.2, 0.001]) {
      expect(adaptivePanSensitivity(fov)).toBeCloseTo(PAN_SENS_IN, 10)
    }
  })

  it('fails SAFE on a value that is not a usable number', () => {
    // Inheriting a stale or NaN sensitivity is the off-screen defect returning.
    // The safe direction is the gentle end, not the fast one.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, -30]) {
      expect(adaptivePanSensitivity(bad), `fov=${bad}`).toBe(PAN_SENS_OUT)
    }
  })

  it('stays strictly inside 1:1 everywhere, so the garment never outruns the finger', () => {
    const samples = Array.from({ length: 200 }, (_, i) => PAN_FOV_IN + (i * 29) / 199)
    for (const fov of samples) {
      expect(panScreenGain(adaptivePanSensitivity(fov)), `fov=${fov}`).toBeLessThanOrEqual(1.001)
    }
  })

  it('the honest limit: reach improves, but the zoom penalty does not vanish', () => {
    // Strokes-to-cross scales as 1 / (fov · gain). Documented as 30x -> 9.3x in the
    // module header, and pinned here so a future re-tuning has to face the number
    // rather than discover it. If someone chases 1x they will need gain ~9.3, which
    // the assertion above already forbids.
    const strokes = (fov: number) => 1 / (fov * panScreenGain(adaptivePanSensitivity(fov)))
    const before = strokes(PAN_FOV_IN) / strokes(PAN_FOV_OUT)
    const flat = (PAN_FOV_OUT / PAN_FOV_IN) ** 1 // what it would be with a fixed sensitivity
    expect(flat).toBeCloseTo(30, 5)
    expect(before).toBeGreaterThan(8)
    expect(before).toBeLessThan(11)
  })
})

describe('shouldWritePan', () => {
  it('always writes the first value', () => {
    expect(shouldWritePan(null, PAN_SENS_OUT)).toBe(true)
  })

  it('ignores changes below the step, in both directions', () => {
    expect(shouldWritePan(0.5, 0.5 + PAN_SENS_STEP / 2)).toBe(false)
    expect(shouldWritePan(0.5, 0.5 - PAN_SENS_STEP / 2)).toBe(false)
  })

  it('writes once the change reaches the step', () => {
    expect(shouldWritePan(0.5, 0.5 + PAN_SENS_STEP)).toBe(true)
    expect(shouldWritePan(0.5, 0.5 - PAN_SENS_STEP)).toBe(true)
  })

  it('keeps a full 30deg -> 1deg sweep well under 40 writes', () => {
    // ⚠️ THE POINT OF THE STEP. One real gesture fired ~165 `camera-change`
    // events on the live page; an unquantised write is 165 Lit update cycles on
    // the element holding a 2.4M-triangle scene. This asserts the coalescing
    // actually coalesces, over a sweep far denser than a real pinch.
    let last: number | null = null
    let writes = 0
    for (let i = 0; i <= 400; i++) {
      const fov = PAN_FOV_OUT - (i * (PAN_FOV_OUT - PAN_FOV_IN)) / 400
      const next = adaptivePanSensitivity(fov)
      if (shouldWritePan(last, next)) {
        writes++
        last = next
      }
    }
    expect(writes).toBeGreaterThan(1) // negative control: it must not coalesce to nothing
    expect(writes).toBeLessThan(40)
  })
})
