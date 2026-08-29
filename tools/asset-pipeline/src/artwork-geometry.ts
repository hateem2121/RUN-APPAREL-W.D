import type { Document, Texture } from '@gltf-transform/core'

/**
 * Find printed artwork by the SHAPE of its UV mapping, not by what it is called.
 *
 * WHY A WORD LIST IS NOT ENOUGH, MEASURED. `ARTWORK_MATERIAL_NAME` in
 * texture-artwork.ts matches nine English words. Across all 28 raw CLO exports,
 * **8 garments have not one material matching any of them** — AERO-TECH WINDBREAKER,
 * ENDURA CROP TOP, PRO-PILE SHERPA JACKET, Scuba-Neck Performance, THE KINETIC
 * MATRIX JACKET, VANTA CORE JACKET, X-MILO CORE OVERSIZE and ZENMOVE TIGHTS — so
 * their printed graphics took the FABRIC compression budget and came back soft.
 * That is the strongest candidate for the reported "blurry / mushy graphics".
 *
 * The names are the problem. Real artwork materials in the catalogue are called
 * `All Slogan`, `Asset 1`, `Extra Mile`, `design` — which a wider list could catch —
 * but also `ZZ00000ZZZZ0`, `ZZZ00000`, `76197`, `01`, `Untitled-1` and `ルン ろご。`
 * (Japanese for "run logo"). Roughly 300 materials carry a name no English word list
 * can ever match. Widening the vocabulary fixes half the problem and leaves the rest.
 *
 * WHAT WORKS INSTEAD. A decal is mapped to its own small UV rectangle; a garment
 * panel is mapped across a large atlas. Measured 2026-08-27 over every textured
 * primitive in all 28 exports, using each accessor's own `min`/`max` — no decode,
 * no binary read:
 *
 *     material name says   prims    p05    median      p95
 *     fabric                 884  69.91    294.81   938.50
 *     topstitch             1707   0.83      0.83     1.35
 *     everything else        598   0.83      1.00   971.77
 *
 * Two orders of magnitude between fabric and artwork, in a signal that does not
 * care what language the designer typed.
 *
 * ⚠️ THE FAILURE DIRECTION IS DELIBERATE. At a span threshold of 12, 353 of 598
 * artwork-candidate primitives are caught and 22 of 884 fabric primitives are
 * wrongly included — 2.5%. A false positive gives fabric a HIGHER quality budget:
 * a slightly larger file and no visual harm. A false negative crushes a printed
 * graphic. Bias toward catching more.
 *
 * ⚠️ THIS FEEDS COMPRESSION ONLY, NEVER `isArtworkTexture`. That function feeds
 * `findArtworkAlphaProblems`, which is a BLOCKING gate, and widening a blocking
 * gate to fix a rendering bug is the wrong trade — the same reasoning that keeps
 * `isArtworkMaterialByName` out of it.
 */

/**
 * Largest UV span, in either axis, that still reads as a decal.
 *
 * Set from the measurement above. `Asset 5` on X-MILO spans 8.909 x 1.000, so a
 * strict unit-square test would miss real artwork; fabric's 5th percentile is
 * 69.91, so there is a wide empty band between them. 12 sits in that band, closer
 * to the artwork side than the midpoint because the safe failure is a false
 * positive.
 */
export const ARTWORK_MAX_UV_SPAN = 12

/**
 * Names that are small in UV but are NOT printed artwork.
 *
 * Topstitch is the one that matters: `Topstitch 1 Copy 1` on X-MILO measures
 * exactly 1.000 x 1.000, the same span as the slogan beside it, and there are 1,707
 * stitch primitives across the catalogue. Without this guard every one of them
 * would take the artwork budget and the file would grow for thread nobody can see.
 * Hardware is small in UV for the same reason and is not a picture either.
 */
const NOT_ARTWORK_NAME =
  /(^|[^a-z])(topstitch|stitch|seam|zipper|zip|slider|puller|stopper|button|snap|rivet|buckle|hook|eyelet|grommet|люверсы)([^a-z]|$)/i

/** Split CamelCase so `TopStitch` matches as two tokens. See material-class.ts. */
function splitCamelCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

/**
 * Every baseColour texture that is used ONLY by artwork-shaped primitives.
 *
 * "Only" is load-bearing: a texture shared between a decal quad and a garment panel
 * keeps the fabric budget. Raising a decal's budget is harmless, but claiming a
 * 6835x5331 fabric atlas as artwork would hold it at 4096 and blow the size ceiling.
 */
export function findArtworkTexturesByGeometry(document: Document): Set<Texture> {
  const artwork = new Set<Texture>()
  const disqualified = new Set<Texture>()

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial()
      const texture = material?.getBaseColorTexture()
      if (!material || !texture) continue

      const uv = primitive.getAttribute('TEXCOORD_0')
      if (!uv) {
        // No UV to measure. Absence of evidence, not evidence of fabric — but this
        // signal has nothing to say, so it says nothing and the name check still runs.
        continue
      }
      const min = uv.getMin([0, 0]) as number[]
      const max = uv.getMax([0, 0]) as number[]
      const span = Math.max((max[0] ?? 0) - (min[0] ?? 0), (max[1] ?? 0) - (min[1] ?? 0))

      const looksLikeArtwork =
        span <= ARTWORK_MAX_UV_SPAN &&
        !NOT_ARTWORK_NAME.test(splitCamelCase(material.getName() || ''))

      if (looksLikeArtwork) artwork.add(texture)
      else disqualified.add(texture)
    }
  }

  for (const texture of disqualified) artwork.delete(texture)
  return artwork
}
