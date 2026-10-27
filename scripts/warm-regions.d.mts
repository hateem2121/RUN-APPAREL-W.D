/** Types for `warm-regions.mjs`, so a TypeScript test can import it (same shape as warm-shared-store.d.mts). */
export type RegionTarget = { url: string; headers: Record<string, string> }

export type RegionMeasurementBody = {
  type: 'http'
  target: string
  locations: { country: string; tags: string[]; limit: number }[]
  measurementOptions: {
    protocol: 'HTTPS'
    request: { method: 'GET'; path: string; query?: string; headers?: Record<string, string> }
  }
}

export declare const REGION_TARGETS_MAX: number
export declare const PROBES_PER_COUNTRY: number
export declare function regionTargets(
  pages: string[],
  origin?: string,
  max?: number,
): Promise<RegionTarget[]>
export declare function regionWarmPlan(
  targets: RegionTarget[],
  countries: string[],
  probesPerCountry: number,
): RegionMeasurementBody[]
export declare function regionVerdict(
  measurements: {
    results?: {
      probe?: { country?: string }
      result?: { headers?: Record<string, string | string[]> }
    }[]
  }[],
): Record<string, { hit: number; miss: number; other: number }>
