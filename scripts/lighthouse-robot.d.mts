/**
 * Types for `lighthouse-robot.mjs`, so TypeScript tests can import it — the same reason and
 * the same shape as `copy-rules.d.mts` and `perf-probe`'s callers.
 */

export declare const LIGHTHOUSE_VERSION: string
export declare const RUNS: number
export declare const MIN_VALID_RUNS: number
export declare const FORM_FACTORS: string[]
export declare const CATEGORIES: string[]
export declare const PAGES: { name: string; url: string }[]
export declare const INCONCLUSIVE_STATUSES: Set<number>
export declare const EXPECTED_BELOW_ONE: Record<string, string[]>
export declare const KNOWN_FINDINGS: Record<string, string>
export declare const PERFORMANCE_FLOORS: Record<string, number>

export declare function median(values: unknown[]): number | null
export declare function documentStatus(lhr: unknown): number | null

export type Run =
  | { missing: true; reason: string }
  | {
      missing: false
      version: string | null
      formFactor: string | null
      status: number | null
      runtimeError: string | null
      scores: Record<string, number | null>
      belowOne: string[]
    }

export declare function readRun(lhr: unknown): Run

export interface Classified {
  kind: 'valid' | 'inconclusive' | 'broken' | 'wrong-version'
  why?: string
}
export declare function classifyRun(run: Run): Classified

export interface PageRuns {
  page: string
  formFactor: string
  runs: Run[]
}
export interface PageVerdict {
  key: string
  failures: string[]
  inconclusive: string[]
  advisories: string[]
  line: string
}
export declare function judgePage(page: PageRuns): PageVerdict

export declare function evaluate(pages: PageRuns[]): {
  ok: boolean
  failures: string[]
  inconclusive: string[]
  advisories: string[]
  lines: string[]
}
