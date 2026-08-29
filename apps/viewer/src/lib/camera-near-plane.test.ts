import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  boundingRadius,
  computeNearPlane,
  depthStepMm,
  installAdaptiveNearPlane,
  internalCamera,
} from './camera-near-plane'

/**
 * Measured on the owner's M4 Pro, model-viewer 4.3.1, Minecut Motion, 24-bit depth.
 * These are the numbers the module's comment claims, asserted rather than trusted.
 */
const MODEL = { x: 0.43, y: 1.04, z: 0.29 } // metres, from getDimensions()
const ZOOMED_OUT = 2.18 // model-viewer caps zoom-out here for this garment
const MODEL_VIEWER_NEAR = 0.004365
const MODEL_VIEWER_FAR = 4.3645
const CLO_GAP_MM = 0.1 // CLO's fixed offset between a printed graphic and the cloth

/** Below this the GPU cannot reliably order two surfaces; 10x is comfortable. */
const FIGHTS_BELOW = 3

describe('boundingRadius', () => {
  it('is half the box diagonal, not half the tallest side', () => {
    // The tallest side would give 0.52 and under-estimate the diagonal reach.
    expect(boundingRadius(MODEL)).toBeCloseTo(0.581, 3)
  })

  it('survives a model whose dimensions are not yet known', () => {
    expect(boundingRadius({ x: Number.NaN, y: 1, z: 1 })).toBe(0)
  })
})

describe('computeNearPlane', () => {
  it('never crosses in front of the model', () => {
    // The failure this guards is a near plane that clips the garment when zoomed in.
    const radius = boundingRadius(MODEL)
    for (const orbit of [0.8, 1.0, 1.2, 1.6, 2.18, 4, 10]) {
      const near = computeNearPlane(orbit, radius)
      const nearestSurface = orbit - radius
      if (nearestSurface > 0) expect(near).toBeLessThan(nearestSurface)
    }
  })

  it('is always positive, including with the camera inside the model', () => {
    const radius = boundingRadius(MODEL)
    expect(computeNearPlane(0.1, radius)).toBeGreaterThan(0)
    expect(computeNearPlane(0, radius)).toBeGreaterThan(0)
    expect(computeNearPlane(Number.NaN, radius)).toBeGreaterThan(0)
  })

  it('grows with the camera, which is the entire point', () => {
    const radius = boundingRadius(MODEL)
    const close = computeNearPlane(1.2, radius)
    const far = computeNearPlane(ZOOMED_OUT, radius)
    expect(far).toBeGreaterThan(close)
  })
})

describe('depth margin over CLO’s 0.1 mm graphic offset', () => {
  const radius = boundingRadius(MODEL)

  it('reproduces the defect with model-viewer’s own near plane', () => {
    // NEGATIVE CONTROL. If this ever stops fighting, the test below proves nothing.
    const step = depthStepMm(MODEL_VIEWER_NEAR, MODEL_VIEWER_FAR, ZOOMED_OUT)
    expect(CLO_GAP_MM / step).toBeLessThan(FIGHTS_BELOW)
  })

  it('clears the defect once the near plane follows the camera', () => {
    const near = computeNearPlane(ZOOMED_OUT, radius)
    const step = depthStepMm(near, MODEL_VIEWER_FAR, ZOOMED_OUT)
    expect(CLO_GAP_MM / step).toBeGreaterThan(100)
  })

  it('holds at every zoom the visitor can reach, not just the one that was tested', () => {
    for (const orbit of [0.9, 1.2, 1.6, 2.18]) {
      const near = computeNearPlane(orbit, radius)
      const step = depthStepMm(near, MODEL_VIEWER_FAR, orbit)
      expect(CLO_GAP_MM / step).toBeGreaterThan(FIGHTS_BELOW * 3)
    }
  })

  it('does NOT claim to rescue p001’s 0.001 mm gap', () => {
    // The module says so; assert it, so nobody later deletes decal-depth-bias.ts
    // believing this covers every garment.
    const near = computeNearPlane(ZOOMED_OUT, radius)
    const step = depthStepMm(near, MODEL_VIEWER_FAR, ZOOMED_OUT)
    expect(0.001 / step).toBeLessThan(10)
  })
})

describe('installAdaptiveNearPlane', () => {
  const makeCamera = () => ({ near: MODEL_VIEWER_NEAR, updateProjectionMatrix: vi.fn() })

  it('makes near track the camera and recomputes on every read', () => {
    const camera = makeCamera()
    let orbit = 2.18
    expect(installAdaptiveNearPlane(camera, () => orbit, boundingRadius(MODEL))).toBe(true)
    const far = camera.near
    orbit = 1.0
    expect(camera.near).toBeLessThan(far)
  })

  it('swallows model-viewer’s own writes, which otherwise undo it on the first drag', () => {
    const camera = makeCamera()
    installAdaptiveNearPlane(camera, () => 2.18, boundingRadius(MODEL))
    const applied = camera.near
    camera.near = MODEL_VIEWER_NEAR // what model-viewer does on every camera change
    expect(camera.near).toBe(applied)
  })

  it('is idempotent, because Stage calls it on load and on every colourway', () => {
    const camera = makeCamera()
    expect(installAdaptiveNearPlane(camera, () => 2.18, 0.581)).toBe(true)
    expect(installAdaptiveNearPlane(camera, () => 2.18, 0.581)).toBe(true)
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1)
  })

  it('fails safe rather than throwing when the camera is missing or unusable', () => {
    expect(installAdaptiveNearPlane(null, () => 2.18, 0.581)).toBe(false)
    expect(installAdaptiveNearPlane(undefined, () => 2.18, 0.581)).toBe(false)
    expect(installAdaptiveNearPlane({ near: 1 } as never, () => 2.18, 0.581)).toBe(false)
  })

  it('leaves a non-configurable near plane alone instead of crashing', () => {
    const camera = { updateProjectionMatrix: vi.fn() } as unknown as {
      near: number
      updateProjectionMatrix: () => void
    }
    Object.defineProperty(camera, 'near', { value: 0.1, configurable: false, writable: false })
    expect(installAdaptiveNearPlane(camera, () => 2.18, 0.581)).toBe(false)
  })
})

/**
 * The INSTALLED package, so these guards track whatever version actually resolves
 * rather than a version written down somewhere. Same technique as
 * `decal-depth-bias.test.ts`, which has guarded its sibling internal since 2026-08-27.
 */
function modelViewerFile(...parts: string[]): string {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@google/model-viewer')
  // .../model-viewer/dist/model-viewer.js -> .../model-viewer
  return join(dirname(dirname(entry)), ...parts)
}

describe('⚠️ GUARD — model-viewer still exposes the internals the near plane depends on', () => {
  /*
   * WHY THIS EXISTS. `internalCamera()` is the only bridge to model-viewer's internals
   * in this module, and until 2026-08-29 it shipped with NO guard at all — unlike its
   * sibling `decal-depth-bias.ts`, which carries three.
   *
   * The failure mode is the dangerous one: SILENT. A rename produces no exception and
   * no error. `internalCamera()` returns null, `installAdaptiveNearPlane` returns false,
   * the near plane quietly reverts to model-viewer's `far / 1000`, and the white
   * speckling comes back on every zoomed-out garment. That is precisely the regression
   * the sibling guard was built to prevent, on the module that fixes the defect.
   */

  it("still constructs the scene symbol as Symbol('scene') — the RUNTIME description", () => {
    /*
     * ⚠️ THE TYPE DEFINITION IS NOT ENOUGH, and this is the whole point of reading the
     * built JS instead. `internalCamera()` matches on `symbol.description === 'scene'`,
     * which is the string passed to `Symbol()` at runtime. The `.d.ts` only declares the
     * EXPORT name `$scene`. model-viewer could keep exporting `$scene` while changing the
     * description to `Symbol('modelScene')`, and a types-only guard would stay green
     * while the near plane silently stopped being installed.
     */
    const source = readFileSync(modelViewerFile('lib', 'model-viewer-base.js'), 'utf8')
    expect(source).toContain("Symbol('scene')")
  })

  it("still exposes Symbol('controls'), the ambiguity the description match resolves", () => {
    /*
     * ⚠️ THIS COMMENT WAS WRONG WHEN WRITTEN, on 2026-08-29, and an independent check
     * caught it the same day. It claimed `Symbol('controls')` is why the `isObject3D`
     * filter is load-bearing. It is not: `internalCamera()` tests
     * `symbol.description !== 'scene'` FIRST, so the controls symbol is rejected before
     * the filter is ever reached, and there is exactly ONE `Symbol('scene')` in the
     * installed package.
     *
     * What this assertion actually pins is the ambiguity the DESCRIPTION match resolves:
     * two internal symbols carry a `.camera`, so a lookup selecting on `.camera` alone
     * returns whichever enumerates last — which is what cost a debugging session. The
     * `isObject3D` filter is a second, independent defence, and it is covered by its own
     * test below rather than by this one.
     */
    const source = readFileSync(modelViewerFile('lib', 'features', 'controls.js'), 'utf8')
    expect(source).toContain("Symbol('controls')")
  })

  it('still declares $scene as the symbol keying the scene onto the element', () => {
    const source = readFileSync(modelViewerFile('lib', 'model-viewer-base.d.ts'), 'utf8')
    expect(source).toMatch(/export declare const \$scene: unique symbol/)
    expect(source).toMatch(/\[\$scene\]: ModelScene/)
  })

  it('still declares ModelScene.camera, the object the near plane is installed on', () => {
    const source = readFileSync(
      modelViewerFile('lib', 'three-components', 'ModelScene.d.ts'),
      'utf8',
    )
    expect(source).toMatch(/camera: PerspectiveCamera/)
  })
})

describe('internalCamera', () => {
  /*
   * Until 2026-08-29 this function had NO test and was the only uncovered function in
   * the module — 85.71% function coverage, with this the single gap. Every test below
   * fails if the lookup is broken, which is what the coverage number could not tell you.
   */
  const camera = () => ({ near: 0.1, updateProjectionMatrix: vi.fn() })

  it('finds the camera on the scene symbol', () => {
    const cam = camera()
    const element = { [Symbol('scene')]: { isObject3D: true, camera: cam } }
    expect(internalCamera(element)).toBe(cam)
  })

  it('⚠️ ignores Symbol(controls), which carries the same camera under a different name', () => {
    /*
     * THE REGRESSION THIS EXISTS FOR. Both symbols expose a `.camera`. A lookup that
     * selects on `.camera` alone returns whichever enumerates last — so this test builds
     * the element with `controls` LAST, which is the order that breaks a naive lookup.
     *
     * Note WHICH defence this exercises: the description match, not `isObject3D`. The
     * next test covers that one.
     */
    const cam = camera()
    const element = {
      [Symbol('scene')]: { isObject3D: true, camera: cam },
      [Symbol('controls')]: { camera: { near: 999, updateProjectionMatrix: vi.fn() } },
    }
    expect(internalCamera(element)).toBe(cam)
  })

  it('⚠️ skips a scene-named entry that is NOT an Object3D, and keeps looking', () => {
    /*
     * ADDED 2026-08-29 after an independent check proved this was covered by NOTHING:
     * deleting `if (scene?.isObject3D !== true) continue` left all 24 tests in this file
     * green, and v8 reported that line's statement AND branch uncovered.
     *
     * Every other test here is rejected earlier, by the description match, so none of
     * them reaches the filter. This one has to get PAST the description check to
     * exercise it — hence two symbols both described 'scene', the first carrying a
     * plausible `.camera` on a non-Object3D. A lookup that trusts the description alone
     * takes the decoy; the real one is second.
     */
    const cam = camera()
    const element = {
      [Symbol('scene')]: { camera: { near: 999, updateProjectionMatrix: vi.fn() } },
      [Symbol('scene')]: { isObject3D: true, camera: cam },
    }
    // Two same-described symbols are distinct keys, so both survive on the object.
    expect(Object.getOwnPropertySymbols(element)).toHaveLength(2)
    expect(internalCamera(element)).toBe(cam)
  })

  it('returns null when only Symbol(controls) is present, rather than the wrong camera', () => {
    const element = {
      [Symbol('controls')]: { camera: { near: 999, updateProjectionMatrix: vi.fn() } },
    }
    expect(internalCamera(element)).toBeNull()
  })

  it('returns null rather than throwing when model-viewer renames the symbol', () => {
    // The silent-regression case: the element is fine, the symbol description is not.
    const element = { [Symbol('modelScene')]: { isObject3D: true, camera: camera() } }
    expect(internalCamera(element)).toBeNull()
  })

  it('returns null when the scene carries no usable camera', () => {
    expect(internalCamera({ [Symbol('scene')]: { isObject3D: true } })).toBeNull()
    expect(internalCamera({ [Symbol('scene')]: { isObject3D: true, camera: {} } })).toBeNull()
  })

  it('fails safe on absent or non-object input', () => {
    expect(internalCamera(null)).toBeNull()
    expect(internalCamera(undefined)).toBeNull()
    expect(internalCamera('not an element' as unknown as object)).toBeNull()
  })
})
