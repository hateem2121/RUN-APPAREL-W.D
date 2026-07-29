/**
 * The contract between the CMS raw-upload inbox and the shrink service.
 *
 * This used to be two hand-copied interfaces with a "Must match …" comment on
 * each. It is one type here so a change on either side is a compile error rather
 * than a queue message that silently loses a field.
 */

/**
 * How hard the auto-shrinker should push, chosen per upload by the owner.
 *
 * The point of exposing this is that the alternative is a container rebuild:
 * the pipeline source is baked into the image, so before this existed, changing
 * a simplify setting meant Docker + `wrangler deploy` + several minutes. Now a
 * garment that came back too heavy or too soft is just re-uploaded at a
 * different level.
 */
export type ShrinkDetailLevel = 'fidelity' | 'balanced' | 'small'

export const SHRINK_DETAIL_LEVELS: readonly {
  value: ShrinkDetailLevel
  label: string
}[] = [
  { value: 'balanced', label: 'Balanced (recommended)' },
  { value: 'fidelity', label: 'Highest quality — bigger file' },
  { value: 'small', label: 'Smallest file — softer detail' },
]

export const DEFAULT_SHRINK_DETAIL: ShrinkDetailLevel = 'balanced'

/** Message enqueued on `glb-shrink` for the shrink Worker. */
export interface ShrinkJobMessage {
  rawUploadId: number | string
  filename: string
  prefix: string | null
  /** Absent on messages enqueued before this field existed — treat as the default. */
  detail?: ShrinkDetailLevel
  /**
   * The product this garment is for, so the worker can write the colour names it
   * found inside the file back onto that product. Those names are what the
   * "Which colour in your CLO file is this?" dropdown offers — the mechanism that
   * removed the requirement to name colourways `N001-NAVY` inside CLO 3D.
   *
   * Optional: the upload's "Target product" field is optional, and messages
   * enqueued before this existed do not carry it. Absent simply means the owner
   * attaches the result by hand, exactly as before.
   */
  targetProductId?: number | string | null
}

/**
 * Pipeline CLI flags for a detail level, passed through to `parseOptimizeArgs`
 * inside the container so the CLI and the auto-shrinker stay one code path.
 *
 * STARTING VALUES — tune against a real garment and update here.
 * Rationale for the shape of them:
 *   - Geometry, not texture, is what makes a CLO export huge (measured: textures
 *     were 2.1 MB in every variant of the 373 MB export), so `--simplify` and the
 *     error budget are the only levers that matter.
 *   - `--uv-weight` feeds TEXCOORD_0 into the simplifier's error metric
 *     (meshoptimizer `simplifyWithAttributes`), which is what protects printed
 *     graphics. Because UV distortion is now *inside* the budget, the budget
 *     itself can be looser than the 0.0001 needed when it was not — that older
 *     setting only stayed safe by also locking every mesh border, which is what
 *     inflated the result to 58 MB / 6.0 M triangles.
 *   - `ratio` is a target, not a promise: the simplifier stops early when the
 *     error budget binds. Lowering `--simplify` alone therefore does nothing once
 *     the budget is the binding constraint — raise the budget instead.
 */
export function shrinkFlagsFor(detail: ShrinkDetailLevel = DEFAULT_SHRINK_DETAIL): string[] {
  switch (detail) {
    case 'fidelity':
      return ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.0002', '--uv-weight', '2']
    case 'small':
      return ['--simplify', '0.02', '--meshopt', '--simplify-error', '0.002', '--uv-weight', '0.5']
    default:
      return ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.0005', '--uv-weight', '1']
  }
}

/** Plain-language advice shown when a shrunk file is still over the Media ceiling. */
export function nextDetailAdvice(detail: ShrinkDetailLevel = DEFAULT_SHRINK_DETAIL): string {
  if (detail === 'small') {
    return 'This garment is unusually heavy even at the smallest setting — it probably needs to be re-exported from CLO at a lower mesh density.'
  }
  return 'Re-upload it with the Detail setting on “Smallest file — softer detail”.'
}
