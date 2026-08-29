/**
 * Keep a graphic's ink when it is converted to a hard cutout.
 *
 * THE DEFECT, MEASURED 2026-08-27. `solidifyMaterials` resolves printed artwork
 * from BLEND to MASK with `alphaCutoff 0.5`, which is the correct alphaMode — it is
 * order-independent, so it does not sort badly the way BLEND does. But MASK at 0.5
 * DISCARDS every pixel below alpha 128, and on a letterform those are exactly the
 * anti-aliased edge pixels. Measured on the processed exports:
 *
 *     X-MILO        Slogan / Extra Mile / Asset 1 / Asset 5   0.67-2.04% of pixels
 *     METRO-SHIELD  All Slogan x13                            1.32-3.11%
 *     MATRIX-PUFF   26-12-25-BACK SUB                         0.56%
 *
 * Those fractions are of the WHOLE texture, and a slogan texture is 85% empty. The
 * `Slogan` map is 13% ink, so losing 1.11% of all pixels is losing ~8% of the ink —
 * all of it at stroke edges. Thin strokes drop below the threshold entirely and
 * disappear. Reported by the owner as "missing bits and pieces", and invisible to
 * every gate: `findArtworkAlphaProblems` considers MASK at exactly 0.5 correct.
 *
 * THE FIX IS A PUBLISHED ONE, not an invention. Ignacio Castaño's alpha-test
 * coverage preservation (The Witness, and standard in game texture pipelines): find
 * the scale that makes the coverage surviving the threshold match the coverage the
 * texture actually had, then rescale the alpha channel by it. Castaño bisects on the
 * REFERENCE value because it is bounded in [0,1] and therefore easy to solve, then
 * converts that back into a scale.
 *
 * WHY RESCALE THE TEXTURE RATHER THAN LOWER THE CUTOFF. Lowering `alphaCutoff` per
 * material would be simpler and would touch no pixels — but
 * `findArtworkAlphaProblems` flags any artwork MASK whose cutoff is not exactly 0.5,
 * so every affected garment would raise a warning. A warning the owner learns to
 * ignore is worse than no warning, and that gate is BLOCKING. Keeping the cutoff at
 * 0.5 and fixing the texture leaves it untouched.
 *
 * See:
 *   http://www.ludicon.com/castano/blog/articles/computing-alpha-mipmaps/
 *   https://lisyarus.github.io/blog/posts/exploring-ways-to-mipmap-alpha-tested-textures.html
 */

/**
 * Ceiling on the boost.
 *
 * ⚠️ WITHOUT THIS THE FIX BECOMES THE OPPOSITE DEFECT. A soft shadow at alpha 12
 * everywhere has almost no ink, so the bisection would ask for a ~20x scale and
 * paint a solid rectangle across the garment. This pipeline has already shipped that
 * failure once, in the other direction: before 2026-07-31 a 66%-transparent wordmark
 * was forced OPAQUE and rendered as a near-white box, measured (240,240,240). 4x
 * recovers a stroke whose peak sits at alpha ~64 and cannot manufacture a shape that
 * was never there.
 */
export const MAX_ALPHA_BOOST = 4

/** Below this ink fraction there is nothing meaningful to preserve. */
const MIN_INK_FRACTION = 0.001

/**
 * The scale that makes coverage-after-threshold match the ink that was visible.
 *
 * Returns 1 when nothing needs doing — a hard cutout, a fully opaque texture, or an
 * empty one. NEVER returns below 1: deleting ink is the reported defect, and
 * thinning a graphic is not this function's job.
 */
export function alphaBoostForCoverage(alpha: Uint8Array, cutoff: number): number {
  const total = alpha.length
  if (total === 0) return 1

  // 256-bin histogram: one pass, and it makes the bisection below exact rather than
  // a repeated scan of millions of pixels.
  const histogram = new Uint32Array(256)
  let inkSum = 0
  for (const value of alpha) {
    histogram[value] = (histogram[value] ?? 0) + 1
    inkSum += value
  }

  // What the texture actually showed: the alpha-weighted area. A pixel at alpha 128
  // covered half of itself, and BLEND drew it that way.
  const targetCoverage = inkSum / 255 / total
  if (targetCoverage <= MIN_INK_FRACTION || targetCoverage >= 1) return 1

  const reference = Math.round(cutoff * 255)
  const coverageAtOrAbove = (threshold: number): number => {
    let n = 0
    for (let v = threshold; v < 256; v++) n += histogram[v] ?? 0
    return n / total
  }

  const current = coverageAtOrAbove(reference)
  if (current >= targetCoverage) return 1

  // Castaño: solve for the threshold that yields the target coverage. Bounded in
  // [0,255], monotonically decreasing in the threshold, so a bisection is exact.
  let low = 0
  let high = reference
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (coverageAtOrAbove(mid) >= targetCoverage) low = mid
    else high = mid - 1
  }

  // Take the NEAREST achievable coverage, not merely the first that clears the
  // target. Coverage is a step function of the threshold — it can only change by
  // whole pixels — so on a texture with few distinct alpha values the step just
  // past the target can overshoot it by more than the step just short of it does.
  // Overshooting fattens the letterform, which is the failure this whole module
  // exists to avoid causing.
  if (low < reference) {
    const under = Math.abs(coverageAtOrAbove(low + 1) - targetCoverage)
    const over = Math.abs(coverageAtOrAbove(low) - targetCoverage)
    if (under < over) low += 1
  }
  if (low <= 0) return MAX_ALPHA_BOOST

  // Rescaling so that `low` lands on the reference preserves the coverage exactly.
  return Math.min(MAX_ALPHA_BOOST, reference / low)
}

/** Multiply an alpha channel in place, clamped. */
export function applyAlphaBoost(alpha: Uint8Array, boost: number): void {
  if (boost <= 1) return
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = Math.min(255, Math.round((alpha[i] ?? 0) * boost))
  }
}
