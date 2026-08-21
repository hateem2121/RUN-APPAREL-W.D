import type { Document, Transform } from '@gltf-transform/core'
import { createTransform, simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions'
import type { AttributeSimplifier } from './simplify-textured'

/**
 * Reduce decorative topstitch geometry on its own budget, leaving the garment alone.
 *
 * WHY THIS EXISTS. On 2026-08-21 a CLO export arrived at 1,313,979,936 bytes —
 * 3.6x anything the pipeline had processed — and the split was not what anyone
 * assumed. Of its 33,964,432 triangles, `Cloth_mesh` (the ENTIRE visible garment,
 * carrying all 116 artwork materials) was **11,128 — 0.03%**. The other 21 meshes
 * were all named `Topstitch_*` and held **99.97%**. Three thousand triangles of
 * thread for every one triangle of garment.
 *
 * That asymmetry is the whole opportunity, and it is only reachable because CLO
 * names the stitching into separate meshes. Measured on that file: the stitch
 * meshes carry five materials each (one per colourway) with a flat `baseColor` and
 * NO printed artwork — verified by walking mesh → primitive → material including
 * the KHR_materials_variants mappings, not assumed from the names. So thread can
 * take an error budget orders of magnitude looser than the garment at zero risk to
 * the prints, which is exactly what the general-purpose decimator cannot express.
 *
 * ⚠️ TWO MISTAKES MADE THIS LOOK BROKEN THE FIRST TIME, and both are easy to
 * repeat. The first attempt produced frayed, spiky thread and was rejected on
 * sight by the owner. Neither cause was the triangle count:
 *
 *   1. The thread was given `error: 0.01` — twenty times looser than the garment's
 *      0.001. The budget, not the ratio, is what decides whether a stitch stays a
 *      cord or collapses into spikes.
 *   2. It was decimated TWICE — once here, then again by `simplifyTextured` when
 *      `--simplify` was also passed. 777k triangles became 445k.
 *
 * With a tight budget and a single pass, 1.36M triangles renders a cord that is
 * indistinguishable from the 3.98M original. Do not read a small output as proof
 * that thread cannot be small.
 *
 * ⚠️ AND: A WIDE CROP CANNOT SEE THIS DAMAGE. At the pipeline's default
 * `crop-chest` view (18° field of view) the ruined 445k version looked *identical*
 * to the untouched original and was reported as such. At **4°** it is obviously
 * frayed. When judging thread, render a custom view at 4–7° via
 * `render --views`; `min-field-of-view` is already 1deg so tight zooms work. This
 * is the same lesson as the 2026-08-05 wordmark incident, on a different feature.
 *
 * NOTE ON `--simplify`: production does not pass it for garments shaped like this.
 * `Cloth_mesh` at 11,128 triangles needs no decimation at all, so `--simplify` was
 * only ever acting on thread — and running both is precisely mistake 2 above.
 */

/** CLO names every stitch mesh `Topstitch_<id>`. Matched case-insensitively. */
export const DEFAULT_STITCH_PATTERN = /^topstitch/i

export interface TopstitchOptions {
  simplifier: AttributeSimplifier
  /**
   * Target fraction of stitch triangles to keep. A TARGET, not a guarantee — see
   * `error`, which usually binds first and is what actually decides the output.
   */
  ratio: number
  /**
   * Error budget for stitch geometry. This is the real aggression dial.
   *
   * Keep it TIGHT. Measured: 0.0005 asked to keep 3% and kept 3.99%, stopping
   * early rather than damaging the cord — so a tight budget cannot be pushed into
   * wrecking the stitching by asking too hard. A loose 0.01 is what produced the
   * rejected, frayed output.
   */
  error: number
  /** Which meshes count as stitching. Defaults to `DEFAULT_STITCH_PATTERN`. */
  pattern?: RegExp
  onResult?: (result: TopstitchResult) => void
}

export interface TopstitchResult {
  /** Meshes matched as stitching. */
  meshes: number
  /** Primitives actually welded + decimated. */
  primitives: number
  /** Stitch triangles before and after, so the ratio is auditable rather than assumed. */
  trianglesBefore: number
  trianglesAfter: number
  /** Triangles left untouched because they are not stitching (i.e. the garment). */
  garmentTriangles: number
}

function triangleCount(prim: { getIndices(): { getCount(): number } | null }): number {
  const indices = prim.getIndices()
  return indices ? indices.getCount() / 3 : 0
}

/**
 * Weld + decimate only the meshes whose name matches `pattern`.
 *
 * Runs BEFORE geometry compression, like `simplifyTextured`, because meshopt and
 * draco both quantize vertex attributes and a decimator that meets quantized
 * attributes bails to a position-only fallback. That is the same reason the repo
 * rule "never run the pipeline on its own output" exists.
 */
export function reduceTopstitch(options: TopstitchOptions): Transform {
  const pattern = options.pattern ?? DEFAULT_STITCH_PATTERN

  return createTransform('reduceTopstitch', async (document: Document): Promise<void> => {
    const result: TopstitchResult = {
      meshes: 0,
      primitives: 0,
      trianglesBefore: 0,
      trianglesAfter: 0,
      garmentTriangles: 0,
    }

    for (const mesh of document.getRoot().listMeshes()) {
      const isStitch = pattern.test(mesh.getName() || '')
      if (isStitch) result.meshes++

      for (const primitive of mesh.listPrimitives()) {
        const before = triangleCount(primitive)
        if (!isStitch) {
          result.garmentTriangles += before
          continue
        }
        result.trianglesBefore += before
        // Weld first: a CLO stitch tube arrives with split vertices, and an
        // unwelded mesh has no shared edges for the simplifier to collapse, so
        // skipping this makes the decimation look like it did nothing.
        weldPrimitive(primitive)
        simplifyPrimitive(primitive, {
          simplifier: options.simplifier,
          ratio: options.ratio,
          error: options.error,
          // Stitching is a free-standing tube, not a panel that must stay welded
          // to its neighbours, so there is no border to lock. (On the GARMENT,
          // lockBorder was measured to be the wrong tool — see simplify-textured.)
          lockBorder: false,
        })
        result.trianglesAfter += triangleCount(primitive)
        result.primitives++
      }
    }

    options.onResult?.(result)
  })
}
