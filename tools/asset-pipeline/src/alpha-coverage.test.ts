import { describe, expect, it } from 'vitest'
import { MAX_ALPHA_BOOST, alphaBoostForCoverage, applyAlphaBoost } from './alpha-coverage'

/** Alpha channel of a stroke `width` px thick whose peak alpha is `peak`. */
function stroke(width: number, peak: number, size = 64): Uint8Array {
  const a = new Uint8Array(size * size)
  const top = Math.floor((size - width) / 2)
  for (let y = top; y < top + width; y++) {
    for (let x = 0; x < size; x++) {
      // Triangular falloff across the stroke, as anti-aliasing produces.
      const d = Math.abs(y - (top + (width - 1) / 2)) / Math.max(1, width / 2)
      a[y * size + x] = Math.round(peak * (1 - d * 0.8))
    }
  }
  return a
}

const coverageAt = (a: Uint8Array, cutoff: number) =>
  a.reduce((n, v) => n + (v >= cutoff * 255 ? 1 : 0), 0) / a.length
const inkArea = (a: Uint8Array) => a.reduce((s, v) => s + v / 255, 0) / a.length

describe('alphaBoostForCoverage', () => {
  it('rescues a thin stroke whose peak alpha is below the cutoff', async () => {
    // THE DEFECT. MASK at alphaCutoff 0.5 discards every pixel below alpha 128, so
    // a stroke peaking at 110 vanishes ENTIRELY — and nothing downstream notices,
    // because MASK/0.5 is exactly what findArtworkAlphaProblems considers correct.
    const a = stroke(3, 110)
    expect(coverageAt(a, 0.5)).toBe(0)
    expect(inkArea(a)).toBeGreaterThan(0)

    const boost = alphaBoostForCoverage(a, 0.5)
    expect(boost).toBeGreaterThan(1)
    const boosted = new Uint8Array(a)
    applyAlphaBoost(boosted, boost)
    expect(coverageAt(boosted, 0.5)).toBeGreaterThan(0)
  })

  it('brings surviving coverage close to the ink that was visible before', async () => {
    // ⚠️ A COARSE FIXTURE CANNOT SHOW THIS AND THE FIRST ONE HERE DID NOT. Coverage
    // is a step function of the threshold: it can only change by whole pixels. A
    // 6-row stroke on a 64px image steps in units of 1/64 = 1.6%, so the target can
    // fall between two achievable values and NEITHER is closer than where it
    // started. Real artwork has thousands of distinct edge values — the Slogan
    // texture is 3169x476 — so the steps are far finer than the quantity measured.
    // A soft radial blob reproduces that.
    const size = 128
    const a = new Uint8Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2)
        a[y * size + x] = Math.round(Math.max(0, 1 - d) * 190)
      }
    }
    const target = inkArea(a)
    const before = coverageAt(a, 0.5)
    expect(before).toBeLessThan(target)

    const boosted = new Uint8Array(a)
    applyAlphaBoost(boosted, alphaBoostForCoverage(a, 0.5))
    const after = coverageAt(boosted, 0.5)
    expect(Math.abs(after - target)).toBeLessThan(Math.abs(before - target))
  })

  it('leaves a hard binary cutout alone', async () => {
    // Its coverage already equals its ink area, so there is nothing to recover and
    // boosting would fatten the letterforms for no reason.
    const a = new Uint8Array(64 * 64)
    for (let i = 0; i < a.length; i++) a[i] = i % 2 === 0 ? 255 : 0
    expect(alphaBoostForCoverage(a, 0.5)).toBe(1)
  })

  it('leaves a fully opaque texture alone', async () => {
    expect(alphaBoostForCoverage(new Uint8Array(1024).fill(255), 0.5)).toBe(1)
  })

  it('leaves a fully transparent texture alone rather than dividing by zero', async () => {
    expect(alphaBoostForCoverage(new Uint8Array(1024).fill(0), 0.5)).toBe(1)
  })

  it('NEVER shrinks alpha — deleting ink is the defect, adding it is not', async () => {
    // A texture whose cutout keeps MORE than was visible would bisect to a scale
    // below 1. Thinning a graphic is not this function's job.
    const a = new Uint8Array(64 * 64)
    for (let i = 0; i < a.length; i++) a[i] = 130
    expect(alphaBoostForCoverage(a, 0.5)).toBeGreaterThanOrEqual(1)
  })

  it('is clamped, so a nearly invisible texture cannot be turned solid', async () => {
    // A soft shadow at alpha 12 everywhere has almost no ink. Without a ceiling the
    // bisection would scale it ~20x and paint a solid rectangle across the garment —
    // which is the OPPOSITE failure, and one this pipeline has already shipped once
    // (the 66%-transparent wordmark forced OPAQUE, rendering a near-white box).
    const a = new Uint8Array(64 * 64).fill(12)
    expect(alphaBoostForCoverage(a, 0.5)).toBeLessThanOrEqual(MAX_ALPHA_BOOST)
  })

  it('applyAlphaBoost clamps at 255 and does not wrap', async () => {
    const a = new Uint8Array([0, 100, 200, 255])
    applyAlphaBoost(a, 3)
    expect(Array.from(a)).toEqual([0, 255, 255, 255])
  })
})
