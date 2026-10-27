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

export type RegionMeasurement = { id: string; results: unknown[] }

export declare const REGION_TARGETS_MAX: number
export declare const REGION_GARMENTS_MAX: number
export declare const PROBES_PER_COUNTRY: number
export declare const WARM_BUDGET_MS: number
export declare const READ_BACK_BUDGET_MS: number
export declare const READ_BACK_MAX: number
export declare const STORE_FIRST_BYTE_P75_MS: number
export declare function cardGarments(productsHtml: string): string[]
export declare function regionTargets(
  sitemap: { pages: string[]; garments?: string[] },
  origin?: string,
  max?: number,
): Promise<RegionTarget[]>
export declare function warmWithin(
  plan: object[],
  measureOne: (body: object, budget: AbortSignal) => Promise<RegionMeasurement>,
  budgetMs: number,
  concurrency?: number,
): Promise<{ done: RegionMeasurement[]; stopped: null | string }>
export declare function regionWarmPlan(
  targets: RegionTarget[],
  countries: string[],
  probesPerCountry: number,
): RegionMeasurementBody[]
type ProbeAnswers = {
  results?: {
    probe?: { country?: string }
    result?: {
      headers?: Record<string, string | string[]>
      timings?: { firstByte?: number; total?: number }
    }
  }[]
}
type Timing = { n: number; firstByteP75: number; totalP75: number }
export declare function regionTimings(
  measurements: ProbeAnswers[],
): Record<string, Partial<Record<'hit' | 'miss' | 'other', Timing>>>
export declare function readBackPlan<Body extends object>(
  plan: Body[],
  probes: string,
): (Body & { locations: string })[]
export declare function regionJudgement(
  readBack: ProbeAnswers[],
  all: ProbeAnswers[],
): Record<
  string,
  { verdict: 'pass' | 'fail'; hits: number; asked: number; firstByteP75: number | null }
>
export declare function regionReport(run: {
  warmed: ProbeAnswers[]
  readBack: ProbeAnswers[]
  measuring: boolean
}): { lines: string[]; exitCode: 0 | 1 }
export declare function regionVerdict(
  measurements: {
    results?: {
      probe?: { country?: string }
      result?: { headers?: Record<string, string | string[]> }
    }[]
  }[],
): Record<string, { hit: number; miss: number; other: number }>
