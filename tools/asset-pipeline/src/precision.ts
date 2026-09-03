/**
 * How fine the finished file's position grid is, against how close its prints sit to the
 * cloth (fix plan Rank 13, audit GEO-05).
 *
 * The codec stores positions as 14-bit integers over each mesh's own box, so a vertex can
 * only land on a grid: a 1.6 m garment has a step of about 0.1 mm. CLO places a print
 * 0.1–0.3 mm in front of the cloth (the overlay scan measures it per print). When the
 * grid step approaches the gap, a print and its cloth can quantize onto the SAME plane
 * and flicker regardless of any depth nudge. Measured on the catalogue the grid is
 * 0.02–0.06 mm against a 0.100 mm gap — fine — but nothing said so, and a bigger garment
 * or a coarser codec setting would have changed the answer silently.
 *
 * Read from the file: for every mesh whose POSITION is a normalised integer accessor, the
 * node's scale is what one integer step is worth (glTF-Transform's `quantize` writes the
 * box onto the node), and 14 bits over −1..1 is 8191 steps per unit.
 */
import type { Document } from '@gltf-transform/core'

/** Signed 14-bit: one sign bit, 8191 steps from 0 to 1. */
const QUANTIZED_STEPS_PER_UNIT = 8191

export interface PositionGrid {
  /** The coarsest grid step across the file's quantized meshes, in millimetres. */
  gridMm: number
  /** Meshes read; 0 when nothing is quantized (floats: no grid to speak of). */
  quantizedMeshes: number
}

export function positionGrid(document: Document): PositionGrid {
  let gridMm = 0
  let quantizedMeshes = 0
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const quantized = mesh
      .listPrimitives()
      .some((prim) => prim.getAttribute('POSITION')?.getNormalized() === true)
    if (!quantized) continue
    quantizedMeshes++
    const scale = node.getWorldScale()
    const step =
      (Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2])) /
        QUANTIZED_STEPS_PER_UNIT) *
      1000
    gridMm = Math.max(gridMm, step)
  }
  return { gridMm, quantizedMeshes }
}

/** Under this many grid steps between a print and its cloth, the two can quantize together. */
export const MIN_GAP_STEPS = 2

/** The owner-facing sentence, or null when there is nothing to say (no quantized mesh, or no print measured). */
export function describePrecision(grid: PositionGrid, minGapMm: number | null): string | null {
  if (grid.quantizedMeshes === 0 || grid.gridMm <= 0) return null
  const gridText = `Position grid: ${grid.gridMm.toFixed(3)} mm per step (14-bit over the garment's size)`
  if (minGapMm === null) return `${gridText}; no print gap was measured on this file.`
  const steps = minGapMm / grid.gridMm
  return (
    `${gridText}; the closest print sits ${minGapMm.toFixed(3)} mm in front of its cloth — ${steps.toFixed(1)} grid steps` +
    (steps < MIN_GAP_STEPS
      ? '. ⚠️ Under two steps: that print and its cloth can land on the same plane and flicker; ' +
        'the depth nudge is all that separates them. A larger gap in CLO (0.2 mm) fixes it at the source.'
      : '.')
  )
}
