/**
 * Keep enough depth precision at the garment to stop printed layers flickering.
 *
 * THE DEFECT, confirmed by the owner on 2026-08-29 on their own M4 Pro: white specks
 * blinking on and off over the printed graphic as the garment turns — but ONLY when
 * zoomed out. Zoomed in it was flawless. That asymmetry is the whole diagnosis.
 *
 * A depth buffer does not measure distance linearly. Precision is crammed close to the
 * near plane and stretched thin further away, and the resolvable step at distance `z`
 * grows with `z²`:
 *
 *     step = (1 / (2^bits - 1)) * (far - near) * z² / (far * near)
 *
 * `model-viewer` pins `near` at **0.00436 m** and never moves it, so a visitor can zoom
 * close without the model clipping. That is a reasonable default and it is fatal here,
 * because CLO stacks a printed graphic a fixed **0.100 mm** above the cloth. Measured on
 * the live element with a 24-bit buffer:
 *
 *   | camera distance | step       | margin over 0.100 mm |
 *   | 1.2 m (zoomed in)  | 0.0196 mm |  5.1x  -> clean     |
 *   | 2.18 m (zoomed out)| 0.0650 mm |  1.5x  -> FIGHTS    |
 *
 * Below roughly 3x the GPU cannot reliably order the two surfaces, so it picks a
 * different winner per pixel and per frame. Doubling the distance quarters the
 * precision, which is exactly why pulling back made it worse.
 *
 * ⚠️ A FIXED near plane is the wrong fix, and was the first thing tried. 0.5 m gives a
 * 199x margin at full zoom-out and would CLIP the garment the moment anyone zooms
 * closer than half a metre. The near plane has to follow the camera.
 *
 * So: `near` is derived from how far the camera actually is from the model's surface,
 * every time it is read. At 2.18 m that yields ~0.8 m and a ~350x margin; zoomed in it
 * shrinks with the camera and never crosses in front of the model.
 *
 * ⚠️ THIS DOES NOT RESCUE EVERY GAP, AND MUST NOT BE SOLD AS IF IT DOES. The margin is
 * proportional to the gap, so a garment whose layers sit closer stays marginal, and
 * `decal-depth-bias.ts` is still what covers that case. This raises the floor for the
 * whole catalogue; it does not replace the per-material fix.
 *
 * ⚠️ THE NUMBER THIS PARAGRAPH USED TO CITE WAS WRONG. It said `p001` was "recorded at
 * 0.001 mm, a hundredth of Minecut's". Re-measured 2026-08-29 with
 * `pnpm pipeline overlays output/production/p001.glb --json`: p001's smallest gap
 * ANYWHERE is **0.0418 mm**, and among surfaces the detector actually classifies as
 * stacked it is **0.1281 mm** (range 0.128-0.2035). Forty times what was claimed.
 * The negative control ran across all ten production garments and returned visibly
 * different answers rather than a constant, so the instrument was reading the files.
 *
 * ⚠️ THE CONCLUSION STANDS ANYWAY, AND NOT BECAUSE OF THIS NUMBER. p001 needs the bias
 * because someone RENDERED it: with the bias off its chevrons break into fragments and
 * "NEVER LOOK BACK" fills with holes, and n001 — which is unaffected — is the control
 * that makes that observation trustworthy (`review-server.ts`, 2026-08-27). Do not
 * retire `decal-depth-bias.ts` on the strength of the corrected figure; the rendered
 * evidence is the authority here, and an arithmetic margin has never been one.
 *
 * ⚠️ WHY A PROPERTY OVERRIDE AND NOT AN ASSIGNMENT. `model-viewer` recomputes `near`
 * from the framed model on every camera change, so anything written into it is undone
 * on the next interaction — which is precisely when the defect appears. A getter is
 * read at the moment the projection matrix is rebuilt, so the value is always current
 * and cannot be clobbered. The cost is that this reaches into three.js's camera object,
 * the same class of internal dependency as `decal-depth-bias.ts`, so it fails SAFE:
 * if anything is missing the install is skipped and the viewer keeps model-viewer's
 * own behaviour rather than throwing.
 */

/**
 * How much of the free space in front of the model to leave ahead of the near plane.
 *
 * Exported so `tools/asset-pipeline/src/review-server.ts` can hold a pinned second copy.
 * That page must render what production renders or it answers a different question, and
 * it has already misled the owner once by lacking the decal bias.
 */
export const NEAR_FRACTION = 0.5

/**
 * Floor for the near plane, in metres. Only reached when the camera is inside the
 * model's bounding sphere, where there is no "in front of the model" left to divide.
 * Kept well above zero because a near plane at or below 0 collapses the projection.
 */
export const MIN_NEAR = 0.01

/** The three.js camera surface this needs. Structural, so a test can fake it. */
export interface NearPlaneCamera {
  near: number
  updateProjectionMatrix(): void
}

/** Model extents as `model-viewer` reports them from `getDimensions()`. */
export interface ModelDimensions {
  x: number
  y: number
  z: number
}

/**
 * Radius of the sphere enclosing the model, from its bounding box.
 *
 * Half the box diagonal, not half the tallest side: a camera orbiting a garment can sit
 * off any axis, and the tallest-side version under-estimates the reach on the diagonal
 * and would let the near plane cross in front of a sleeve.
 */
export function boundingRadius(dimensions: ModelDimensions): number {
  const { x, y, z } = dimensions
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0
  return Math.sqrt(x * x + y * y + z * z) / 2
}

/**
 * The near plane to use for a camera `orbitRadius` from the centre of a model of
 * `radius`.
 *
 * Half the clear distance between the camera and the nearest point of the model, so it
 * is always strictly in front of the camera and always strictly behind the model. Falls
 * back to {@link MIN_NEAR} once the camera is inside the model, where there is nothing
 * to halve.
 */
export function computeNearPlane(orbitRadius: number, radius: number): number {
  if (!Number.isFinite(orbitRadius) || !Number.isFinite(radius)) return MIN_NEAR
  const clearance = orbitRadius - Math.max(radius, 0)
  if (!(clearance > 0)) return MIN_NEAR
  return Math.max(MIN_NEAR, clearance * NEAR_FRACTION)
}

/**
 * Depth-buffer step, in millimetres, at distance `z`. Exported for the test, which uses
 * it to assert the fix actually buys the margin this file claims rather than trusting
 * the arithmetic in the comment above.
 */
export function depthStepMm(near: number, far: number, z: number, bits = 24): number {
  if (near <= 0 || far <= near || z <= 0) return Number.POSITIVE_INFINITY
  return (((1 / (2 ** bits - 1)) * ((far - near) * z * z)) / (far * near)) * 1000
}

/**
 * Reach `model-viewer`'s internal three.js camera.
 *
 * ⚠️ TWO of model-viewer's internal symbols expose a `.camera`, and picking the wrong
 * one costs a debugging session: `Symbol(scene)` is the three.js `Scene`, and
 * `Symbol(controls)` is the orbit controller, which holds the same camera but is NOT an
 * `Object3D`. Selecting on `.camera` alone returns whichever enumerates last. Select on
 * the SCENE, by `isObject3D`, and take the camera from it.
 *
 * Same internal-API caveat as `backingThreeMaterial`: correct on model-viewer 4.3.1, and
 * a silent no-op if a future release renames it — which is why this returns `null`
 * rather than throwing, and why the caller treats `false` as "keep the old behaviour".
 */
export function internalCamera(element: object | null | undefined): NearPlaneCamera | null {
  if (!element || typeof element !== 'object') return null
  for (const symbol of Object.getOwnPropertySymbols(element)) {
    if (symbol.description !== 'scene') continue
    const scene = (element as Record<symbol, unknown>)[symbol] as
      | { isObject3D?: boolean; camera?: unknown }
      | undefined
    if (scene?.isObject3D !== true) continue
    const camera = scene.camera as NearPlaneCamera | undefined
    if (camera && typeof camera.updateProjectionMatrix === 'function') return camera
  }
  return null
}

const INSTALLED = '__adaptiveNearPlane'

/**
 * Make `camera.near` follow the camera instead of staying pinned.
 *
 * `readOrbitRadius` is called on every read rather than captured, because the whole
 * point is that the value changes as the visitor zooms. Returns whether the override is
 * in place — `false` means nothing was changed and model-viewer's own near plane still
 * applies, which is a degraded render, never a broken one.
 */
export function installAdaptiveNearPlane(
  camera: NearPlaneCamera | null | undefined,
  readOrbitRadius: () => number,
  radius: number,
): boolean {
  if (!camera || typeof camera.updateProjectionMatrix !== 'function') return false

  const marked = camera as NearPlaneCamera & { [INSTALLED]?: boolean }
  if (marked[INSTALLED]) return true

  try {
    Object.defineProperty(camera, 'near', {
      configurable: true,
      get: () => computeNearPlane(readOrbitRadius(), radius),
      // model-viewer keeps assigning its own value on every camera change. Swallowing
      // the write is the point: without this the override lasts until the first drag.
      set: () => {},
    })
  } catch {
    // A non-configurable `near` on some future three.js build. Leave it alone.
    return false
  }

  marked[INSTALLED] = true
  camera.updateProjectionMatrix()
  return true
}
