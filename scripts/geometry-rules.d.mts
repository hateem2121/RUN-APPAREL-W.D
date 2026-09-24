/**
 * Types for `geometry-rules.mjs`, so TypeScript tests in every package can import it — the
 * same reason and the same shape as `contrast-rules.d.mts`.
 */

export declare const MIN_TARGET_PX: number
export declare const MEASURED_TOLERANCE_PX: number

export declare function isWithinTargetFloor(
  measuredPx: number,
  floor?: number,
  tolerance?: number,
): boolean
