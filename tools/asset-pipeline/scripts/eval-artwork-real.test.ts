import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cameraFingerprint, fovLadderFor, resolveRawPath, slugForPrint, suggestViewFor } from './eval-artwork-real.mjs'

/**
 * Unit tests for `--find-views`, the discovery step that makes garment #2's
 * artwork calibration a followable procedure instead of a research task.
 *
 * The expensive half — does the rendered crop actually show the print — cannot be
 * tested here and is not meant to be: that is what the contact sheet is for, and
 * this repo's rule is that the sheet is the authority. What IS testable is the
 * arithmetic that positions the camera, and every bug found while building this
 * was in that arithmetic rather than in the rendering.
 */

/** N001's real prints, measured off the built baseline on 2026-08-08. */
const WORDMARK = { name: 'THE EXTRA MILE (Slogan)_3161', centre: [-0.0, 1.314, 0.069], span: [0.202, 0.014, 0.02] }
const HEM_LABEL = { name: 'TEAM WEAR FRONT LABEL_3117', centre: [-0.05, 0.782, 0.06], span: [0.039, 0.023, 0.01] }
const BACK_PRINT = { name: 'Zipper 3_TapeFabric_3556', centre: [-0.003, 1.022, -0.107], span: [0.089, 0.005, 0.01] }

const MODEL_MIN = [-0.35, 0.0, -0.15]
const MODEL_MAX = [0.35, 1.7, 0.15]

describe('fovLadderFor', () => {
  /**
   * The anchor is N001's wordmark at 14°, which is the one field of view in this
   * repo that was hand-derived and confirmed against contact sheets. If the
   * scaling ever stops reproducing it, the ladder has drifted off its only
   * evidence.
   */
  it('reproduces the calibrated 14deg for the print it was anchored on', () => {
    expect(fovLadderFor(WORDMARK)).toContain(14)
  })

  /**
   * ⚠️ THE BUG THIS PINS. The first version used a FIXED ladder of [10, 14, 20, 28]°
   * for every print. Rendered against the real export, the 0.202 m wordmark framed
   * correctly while the 0.039 m hem label and 0.030 m neck logo were unreadable
   * specks at every rung — one garment holds a 6× range of print sizes. A speck in
   * frame still yields a plausible damage number; it is just mostly fabric.
   */
  it('zooms much tighter for a small print than for a large one', () => {
    const [, wordmark] = fovLadderFor(WORDMARK)
    const [, label] = fovLadderFor(HEM_LABEL)
    expect(label).toBeLessThan(wordmark / 4)
  })

  it('is strictly ascending, so the contact sheet reads tight to loose', () => {
    for (const print of [WORDMARK, HEM_LABEL, BACK_PRINT]) {
      const ladder = fovLadderFor(print)
      expect(ladder, print.name).toEqual([...ladder].sort((a, b) => a - b))
      expect(new Set(ladder).size, `${print.name} must not repeat a rung`).toBe(ladder.length)
    }
  })

  /**
   * A degenerate primitive must not produce a field of view model-viewer will
   * refuse or silently clamp. See render.test.ts for what clamping costs.
   */
  it('clamps a pathological print into a renderable range', () => {
    for (const span of [[1e-6, 1e-6, 1e-6], [50, 50, 50]]) {
      for (const fov of fovLadderFor({ name: 'x', centre: [0, 0, 0], span })) {
        expect(fov).toBeGreaterThanOrEqual(1)
        expect(fov).toBeLessThanOrEqual(45)
      }
    }
  })
})

describe('suggestViewFor', () => {
  /**
   * Cross-check against the only hand-derived camera in the repo. N001's wordmark
   * view was written by a human from mesh bounds and confirmed by eye:
   * `orbit: '-0.2deg 90deg 0.445m'`, `target: '0m 1.314m 0.069m'`. If the maths
   * here reproduces that independently, the derivation is sound.
   */
  it('independently reproduces N001s hand-derived wordmark camera', () => {
    const view = suggestViewFor(WORDMARK, MODEL_MIN, MODEL_MAX, 14)
    // Compared numerically, not as a string: a print centre a hair below zero
    // formats as "-0.000m", which is faithful but not worth pinning as text.
    const target = view.target.split(/\s+/).map(Number.parseFloat)
    expect(target[0]).toBeCloseTo(0, 3)
    expect(target[1]).toBeCloseTo(1.314, 3)
    expect(target[2]).toBeCloseTo(0.069, 3)
    // Well inside CANONICAL.json's 0.05 m targetTolerance, which is what the aim
    // guard actually enforces.
    const azimuth = Number.parseFloat(view.orbit)
    expect(Math.abs(azimuth - -0.2), `got ${azimuth}deg, hand-derived was -0.2deg`).toBeLessThan(2)
  })

  /**
   * A print on the back of the garment must be photographed from behind. Without
   * this the camera shoots through the body and measures the front.
   */
  it('orbits round to the back for a print with negative z', () => {
    const view = suggestViewFor(BACK_PRINT, MODEL_MIN, MODEL_MAX, 10)
    expect(Math.abs(Number.parseFloat(view.orbit))).toBeGreaterThan(150)
  })

  it('always emits a target, which the aim guard requires', () => {
    for (const print of [WORDMARK, HEM_LABEL, BACK_PRINT]) {
      expect(suggestViewFor(print, MODEL_MIN, MODEL_MAX, 12).target).toMatch(/^-?[\d.]+m -?[\d.]+m -?[\d.]+m$/)
    }
  })
})

describe('slugForPrint', () => {
  /**
   * ⚠️ Material names carry spaces, brackets, parentheses and trailing IDs, and the
   * slug becomes a filename. It must also never come back empty — a view named ''
   * would collide with the next one and silently overwrite its render.
   */
  it('makes a filename-safe, non-empty name from a real material name', () => {
    expect(slugForPrint(WORDMARK)).toBe('the-extra-mile-slogan-3161')
    expect(slugForPrint({ name: '((()))' })).toBe('artwork')
    expect(slugForPrint({ name: '' })).toBe('artwork')
  })
})

describe('cameraFingerprint', () => {
  /**
   * The fingerprint exists so a widened zoom cannot keep an old ceiling: the aim
   * guard checks WHERE the camera points, never how far in. See
   * raw/CANONICAL.json → $cameraFingerprintComment.
   */
  it('changes when only the zoom changes', () => {
    const at = (fov: number) => cameraFingerprint([suggestViewFor(WORDMARK, MODEL_MIN, MODEL_MAX, fov)])
    expect(at(14)).not.toBe(at(20))
  })

  it('is stable for the same views', () => {
    const views = [suggestViewFor(WORDMARK, MODEL_MIN, MODEL_MAX, 14)]
    expect(cameraFingerprint(views)).toBe(cameraFingerprint(views))
  })

  /** Dropping a view changes the fingerprint — the reason --find-views says so. */
  it('changes when a view is dropped', () => {
    const a = suggestViewFor(WORDMARK, MODEL_MIN, MODEL_MAX, 14)
    const b = suggestViewFor(HEM_LABEL, MODEL_MIN, MODEL_MAX, 3)
    expect(cameraFingerprint([a, b])).not.toBe(cameraFingerprint([a]))
  })
})

describe('resolveRawPath', () => {
  /**
   * ⚠️ THE BUG THIS PINS. RUNBOOK → "Replacing or adding a garment" documents
   * `pnpm eval:artwork:real -- raw/<name>.glb --calibrate`. The root script
   * delegates through `pnpm --filter`, which runs the child with cwd set to
   * `tools/asset-pipeline/`, so that relative path resolved to
   * `tools/asset-pipeline/raw/<name>.glb` and step 3 of a five-step procedure
   * failed for anyone who copied it verbatim. Found by running the documented
   * line rather than reading it.
   */
  it('falls back to the repo root for a relative path that is not under cwd', async () => {
    const resolved = await resolveRawPath('raw/cycling-all-colours.glb')
    expect(resolved).toMatch(/Model-Viewer-main\/raw\/cycling-all-colours\.glb$/)
  })

  it('prefers a path that really exists relative to cwd', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rawpath-'))
    const file = join(dir, 'here.glb')
    await writeFile(file, 'x')
    expect(await resolveRawPath(file)).toBe(file)
  })

  it('leaves an absolute path alone', async () => {
    expect(await resolveRawPath('/nowhere/absolute.glb')).toBe('/nowhere/absolute.glb')
  })
})
