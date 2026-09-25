/** Types for `icon-parity-probe.mjs`, so a TypeScript test can import it (same shape as poster-sizes.d.mts). */

export interface IconParityResult {
  ok: boolean
  differingPixels: number
  totalPixels: number
  differingFraction: number
}

export declare function isRefusal(status: number): boolean
export declare const SITE_ICON_URL: string
export declare const VIEWER_ICON_URL: string
export declare const COMPARE_SIZE: number
export declare const CHANNEL_TOLERANCE: number
export declare const MAX_DIFFERING_FRACTION: number

export declare function compareMarks(
  svgA: string,
  svgB: string,
  options?: { size?: number; channelTolerance?: number; maxDifferingFraction?: number },
): Promise<IconParityResult>
