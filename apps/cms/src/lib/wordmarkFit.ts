/**
 * The factor to multiply the current font-size by so the rendered text spans the
 * available width. FITTED, NOT GUESSED: two fixed sizes both ran "RUN APPAREL" off the
 * edge of the design artifact, because Archivo 900 at 122% is not a width you estimate.
 * The name comes from a CMS field, so its length is an input, not a constant.
 */
export function fitScale(available: number, needed: number, safety = 0.995): number {
  if (!Number.isFinite(available) || !Number.isFinite(needed) || available <= 0 || needed <= 0) {
    return 1
  }
  return (available / needed) * safety
}
