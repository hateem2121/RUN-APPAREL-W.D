import type { Document, Transform } from '@gltf-transform/core'
import { createTransform } from '@gltf-transform/functions'
import { classifyMaterialName } from './material-class'

/**
 * Stop cloth rendering as metal.
 *
 * REPORTED AS "some garments give a shiny/metallic look", 2026-08-27, and PROVEN
 * by A/B on the real MATRIX-PUFF JACKET export: with `metallic 0.29` the jacket
 * renders as glossy black patent leather; with `metallic 0` it renders as matte
 * fabric with the quilting visible. Same camera, same lighting, one value changed.
 * Those 5 materials cover **76.6% of the garment's triangles** — the whole body,
 * not a trim.
 *
 * THE DEFECT. glTF defaults an absent `metallicFactor` to **1.0**. CLO omits it on
 * some fabric, so the format says "fully metal". METRO-SHIELD SUIT's
 * `Nylon_Canvas Copy 1_*` is absent-metalness at roughness **0.10** — a mirror.
 *
 * THE NUMBER IS 55, NOT HUNDREDS, AND THE MR-TEXTURE CHECK IS THE DIFFERENCE.
 * Measured across all 28 exports: 515 materials are metallic with no
 * `metallicRoughnessTexture`, and 440 of those are legitimate hardware. A further
 * 3,593 are metallic-by-omission but DO carry an MR texture, whose blue channel
 * supplies metalness per pixel. Those are correct — verified 2026-08-27 by reading
 * one directly: X-MILO's 6835x5331 MR map measures mean metalness **0.000**, 100%
 * of pixels non-metal, roughness 0.905. Counting them is what produced a false
 * "hundreds of materials" figure.
 *
 * WHY NO TEST COULD FAIL ON THIS BEFORE. The only `setMetallicFactor` calls in the
 * repository were four in `placeholders.ts`, all seeding `metallic: 0` — correct,
 * and therefore incapable of exhibiting the defect. The repo's own recurring
 * pattern.
 *
 * CLASSIFY ON THE MATERIAL NAME, NEVER THE TEXTURE NAME: 0 of 5,048 images across
 * the catalogue carry a name or URI, so a texture-name classifier is inert.
 *
 * THE THIRD BUCKET, `unclassified`, DEFAULTS TO MATTE SINCE 2026-09-03 (fix plan Rank 13,
 * audit A-06) — and is still reported by name. Until then it was reported and never
 * rewritten (owner decision 2026-08-26 on 20 `Trim_*` materials that could be metal
 * trim or fabric binding). The audit then found a trim piece shipping as polished chrome
 * for exactly that reason: an absent `metallicFactor` on a name nobody could classify.
 * The asymmetry decides it — a garment part is far more often cloth than chrome, and real
 * hardware is caught BY NAME before this bucket is reached — so the unclassifiable get the
 * fabric default and the report lists them, so a piece that really is metal can be named
 * for it in CLO (`zipper`, `buckle`, `slider` … see material-class.ts).
 */

/** Metalness at or below this is already fine; nothing is rewritten. */
const METALLIC_SUSPECT_MIN = 0.1

/**
 * Roughness floor applied when a fabric material is fixed.
 *
 * Cloth scatters light; 0.10 is a mirror. This RAISES a too-low value and never
 * lowers a high one, so a matte fabric that happens to be metallic keeps its own
 * roughness. 0.5 is deliberately conservative — it removes the mirror without
 * asserting what the fabric's real finish is, which only a rendered crop can say.
 */
const DEFAULT_MIN_ROUGHNESS = 0.5

export interface PbrNormalizeResult {
  /** Material names forced to metallic 0. */
  fixed: string[]
  /**
   * Metallic, no MR texture, name not classifiable — DEFAULTED to matte (metallic 0,
   * roughness floor) since 2026-09-03 and reported here so a real metal part can be
   * renamed in CLO. Before that, reported and never rewritten.
   */
  unclassified: string[]
  /** Materials left metal because their name says hardware. */
  hardware: number
  /** Materials left alone because an MR texture already supplies metalness. */
  skippedWithMrTexture: number
}

export interface PbrNormalizeOptions {
  /** Roughness floor for a fixed fabric material. Default 0.5. */
  minRoughness?: number
  onResult?: (result: PbrNormalizeResult) => void
}

export function normalizePbr(options: PbrNormalizeOptions = {}): Transform {
  const minRoughness = options.minRoughness ?? DEFAULT_MIN_ROUGHNESS

  return createTransform('normalizePbr', async (document: Document): Promise<void> => {
    const result: PbrNormalizeResult = {
      fixed: [],
      unclassified: [],
      hardware: 0,
      skippedWithMrTexture: 0,
    }

    for (const material of document.getRoot().listMaterials()) {
      if (material.getMetallicFactor() <= METALLIC_SUSPECT_MIN) continue

      // THE LOAD-BEARING CHECK — see the header. Rewriting a material that carries
      // an MR texture would override real per-pixel data with a constant.
      if (material.getMetallicRoughnessTexture()) {
        result.skippedWithMrTexture++
        continue
      }

      const name = material.getName() || ''
      const bucket = classifyMaterialName(name)

      if (bucket === 'hardware') {
        result.hardware++
        continue
      }
      if (bucket === 'unclassified') {
        // Reported AND defaulted (A-06): the fabric default, named so it can be undone
        // by naming the part for what it is.
        result.unclassified.push(name)
      }

      material.setMetallicFactor(0)
      // Raise only. A fabric already rougher than the floor knows better than this
      // constant does.
      if (material.getRoughnessFactor() < minRoughness) {
        material.setRoughnessFactor(minRoughness)
      }
      result.fixed.push(name)
    }

    options.onResult?.(result)
  })
}
