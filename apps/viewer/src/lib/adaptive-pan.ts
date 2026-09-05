/**
 * How far a two-finger slide moves the garment, as a function of how far in the
 * visitor has zoomed.
 *
 * THE COMPLAINT. Owner, 2026-09-05: "when we zoom in, the two finger slide
 * becomes very slow." Measured on an iPhone 17 Pro simulator with real two-finger
 * input (`touch2_path`) against the live `rxps` garment: a 120-point parallel
 * slide moved the garment **37 points**. The finger travels 3.2x further than the
 * garment does, at every zoom level.
 *
 * ⚠️ THE OBVIOUS READING OF THAT IS WRONG, AND THE FIRST AUDIT GOT IT WRONG.
 * Pan did not "get slower when zoomed in". Derive the screen-space gain from
 * model-viewer's own source (`SmoothControls.movePan`):
 *
 *     metresPerPixel = radius · fovDeg · 0.018 · s / canvasHeight
 *     frameHeight_m  = 2 · radius · tan(fovRad / 2)
 *     gain           = metresPerPixel · canvasHeight / frameHeight_m
 *                    = 0.018 · s · fovDeg / (2 · tan(fovRad / 2))
 *
 * For small fov, `2·tan(fov/2) -> fovRad`, so **gain -> 0.018 · s · 180/π =
 * 1.0313 · s** — independent of zoom, of camera distance, and of canvas size. At
 * the shipped `s = 0.3` that is **0.3094**, and the device measured **0.308**.
 * Two derivations, three decimals apart.
 *
 * So the pan speed is constant. What changes is that **the garment gets 56.6x
 * bigger** between the default framing and `min-field-of-view: 1deg`, so the same
 * constant fraction of a stroke covers 56.6x less of it. That is inherent to any
 * 3D viewer and is not a defect.
 *
 * WHAT THIS MODULE THEREFORE IS. Not a repair — a deliberate trade. It breaks
 * direct-manipulation invariance (a fixed finger-to-object ratio) in exchange for
 * reach, and only where reach is the problem.
 *
 * ⚠️ THE ZOOMED-OUT END MUST NOT MOVE, and this is the whole safety argument.
 * `PAN_SENSITIVITY`'s block in `Stage.tsx` records a three-point sweep on a real
 * device: at `1.0` an asymmetric pinch (thumb anchored at x=141, index finger
 * 261 -> 341) moved the target to -0.0979 and **shoved the garment off screen with
 * its edge clipped**; at `0.3` it stayed centred. That is the owner's own
 * 2026-08-19 "pinch does not work perfectly" report. The curve therefore STARTS at
 * today's shipped value, which makes this change provably a no-op for the one
 * gesture that was actually measured.
 *
 * ⚠️ THE ZOOMED-IN END IS 0.97 BECAUSE THAT IS GAIN = 1.00. Above 1:1 the surface
 * under the finger outruns the finger, which is the one line direct manipulation
 * does not cross — and it gets worse, not better, at depth: a buyer at 1deg is
 * doing precision work on a print, and model-viewer runs pan and zoom in the SAME
 * gesture, so an asymmetric pinch at gain > 1 throws the print out of frame faster
 * than the pinch zooms into it.
 *
 * ⚠️ A POWER LAW, NOT A LINE, AND THE EXPONENT IS DERIVED RATHER THAN CHOSEN.
 * model-viewer damps `logFov`, and a pinch moves it roughly linearly, so field of
 * view is naturally logarithmic here. A power law is a straight line in log-log
 * space: constant sensitivity change per unit of pinch effort, no knee anywhere,
 * and no third free parameter. The two endpoints are the only decision.
 *
 * ⚠️ WHAT THIS DOES NOT FIX, stated so the next person does not "improve" it into
 * absurdity. Strokes-to-cross-the-garment scales as `1 / (fov · gain)`. With
 * `k = 0.345` that is `fov^-0.655`, so the zoom penalty falls from **30x to
 * 9.3x** — it does not vanish. Making it vanish needs `k = 1`, i.e. `s(1deg) = 9.0`
 * and a gain of 9.3, where the garment leaves the screen faster than the finger
 * moves. The residual 9.3x is what the reset affordance is for, not this curve.
 *
 * VERIFIED ON DEVICE, 2026-09-05 (iPhone 17 Pro simulator, `touch2_path`, against a
 * local build of this change):
 *
 *   - At the default framing a 120-point parallel slide moved the garment **37
 *     points** — gain 0.31, byte-for-byte the behaviour that shipped before. That is
 *     the safety property, and it is the one that mattered: the 2026-08-19
 *     off-screen defect cannot return at the framing it was measured at.
 *   - ⚠️ THE IMPROVEMENT AT DEPTH IS **NOT** CLEANLY MEASURABLE FROM SCREENSHOTS,
 *     and the honest reason is `resetRadius()`: it fires on EVERY two-finger
 *     release, gated on pan being enabled rather than on whether the user panned,
 *     and it re-frames the model — so the zoom changes underneath the very
 *     measurement that is trying to hold it constant. A device number for the
 *     zoomed-in gain would be confounded, so none is quoted here.
 *
 * What proves the mechanism instead is `e2e/webgl.spec.ts`, which reads
 * `panSensitivity` back at 30deg and again at 3deg and asserts it both rose and
 * landed on this curve — with both negative controls run and both observed to fail.
 * The magnitude comes from the formula above and `adaptive-pan.test.ts`.
 *
 * ⚠️ AND IT DOES NOT FIX THE PINCH-IS-PAN COUPLING, which is the other half of the
 * complaint. `touchModeZoom` runs `movePan(dx, dy)` in the same handler as the
 * zoom, so an anchored-thumb slide still zooms rather than slides. Separating them
 * needs a custom gesture layer above model-viewer; `disable-pan` is NOT the escape
 * (it would take the deliberate pan with it — see `DISABLE_TAP` in `Stage.tsx`).
 */

/** The field of view every product starts at — all 11 live payloads say `30deg`. */
export const PAN_FOV_OUT = 30

/** `MIN_FIELD_OF_VIEW` in Stage.tsx. The tightest crop a visitor can reach. */
export const PAN_FOV_IN = 1

/**
 * Sensitivity at the default framing. **Unchanged from what shipped**, on purpose:
 * this is the value the 2026-08-19 off-screen defect was measured against.
 */
export const PAN_SENS_OUT = 0.3

/**
 * Sensitivity at full zoom. `1.0313 × 0.97 = 1.000` — exactly 1:1 finger tracking,
 * the largest value that does not have the garment outrun the finger.
 */
export const PAN_SENS_IN = 0.97

/**
 * model-viewer's own pan constant, from `SmoothControls`:
 * `PAN_SENSITIVITY = 0.018`. Screen gain is `0.018 · s · 180/π`.
 *
 * Held here so `adaptive-pan.test.ts` can assert the gain endpoint against the
 * LIBRARY's number rather than against a hardcoded 1.0313. A model-viewer upgrade
 * that changes it then breaks a test instead of quietly changing how the garment
 * feels under a finger.
 */
export const MODEL_VIEWER_PAN_CONSTANT = 0.018

/** Screen-space gain per unit of `panSensitivity`, in the small-angle limit. */
export const GAIN_PER_SENSITIVITY = (MODEL_VIEWER_PAN_CONSTANT * 180) / Math.PI

/**
 * Smallest change worth writing to the element.
 *
 * ⚠️ NOT A COSMETIC ROUNDING. One gesture fires ~165 `camera-change` events
 * (counted on the live page, 2026-09-05). Writing `mv.panSensitivity` on each one
 * enqueues 165 Lit update cycles on the element already carrying a 2.4M-triangle
 * scene. At 0.02 the whole 30deg -> 1deg range costs at most ~34 writes, and a
 * typical gesture 2-4.
 */
export const PAN_SENS_STEP = 0.02

/** Derived, not chosen: the exponent that puts both endpoints on one power law. */
const K = Math.log(PAN_SENS_IN / PAN_SENS_OUT) / Math.log(PAN_FOV_OUT / PAN_FOV_IN)

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value

/**
 * `panSensitivity` for a given field of view, in degrees.
 *
 * Fails safe to `PAN_SENS_OUT` on any value that is not a usable number, because
 * the alternative — inheriting a stale or NaN sensitivity — is the off-screen
 * defect this file exists to avoid re-opening.
 */
export function adaptivePanSensitivity(fovDeg: number): number {
  if (!Number.isFinite(fovDeg) || fovDeg <= 0) return PAN_SENS_OUT
  const fov = clamp(fovDeg, PAN_FOV_IN, PAN_FOV_OUT)
  const raw = PAN_SENS_OUT * (PAN_FOV_OUT / fov) ** K
  return clamp(raw, PAN_SENS_OUT, PAN_SENS_IN)
}

/** The resulting finger-to-garment ratio, for tests and for reasoning about it. */
export function panScreenGain(sensitivity: number): number {
  return GAIN_PER_SENSITIVITY * sensitivity
}

/**
 * Whether a newly-computed sensitivity is different enough from the last one
 * written to be worth writing. See `PAN_SENS_STEP`.
 */
export function shouldWritePan(last: number | null, next: number): boolean {
  if (last === null) return true
  return Math.abs(next - last) >= PAN_SENS_STEP
}
