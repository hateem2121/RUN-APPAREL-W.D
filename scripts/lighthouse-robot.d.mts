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
export declare const ROBOT_UA_MARK: string
export declare function robotUserAgent(formFactor: string): string
export declare function lighthouseArgs(
  url: string,
  formFactor: string,
  file: string,
  ci?: boolean,
): string[]

export type MeasuringMachine = 'local' | 'github-runner'
export declare const PERFORMANCE_FLOORS: Record<MeasuringMachine, Record<string, number>>
export declare function measuringMachine(env?: Record<string, string | undefined>): MeasuringMachine

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
      rttMs: number | null
      benchmarkIndex: number | null
      ttfbMs: number | null
      observedFcpMs: number | null
      observedDclMs: number | null
      observedLoadMs: number | null
    }

export declare function readRun(lhr: unknown): Run
export declare const PAINT_STALL_MS: number
export declare function paintStall(run: Run): boolean

export declare const LIGHTHOUSE_TIMEOUT_MS: number
export declare const LIGHTHOUSE_SPAWN_OPTIONS: {
  stdio: ['ignore', 'ignore', 'pipe']
  encoding: 'utf8'
  timeout: number
  killSignal: 'SIGKILL'
}
export declare const WARM_UP_RUNS: number
export interface PlannedRun {
  page: { name: string; url: string }
  formFactor: string
  run: number
  measured: boolean
}
export declare function plannedRuns(options: {
  pages: { name: string; url: string }[]
  formFactors: string[]
  runs: number
  warmUp: number
}): PlannedRun[]
export declare function parseArgs(argv: string[]): {
  pages: string[] | undefined
  formFactors: string[] | undefined
  runs: number
  warmUp: number
  out: string | undefined
  from: string | undefined
  report: boolean
}

export declare const STDERR_TAIL_LINES: number
export declare function stderrTail(text: string, lines?: number): string
export declare function describeExit(
  result: { status: number | null; error?: { code?: string }; stderr?: string },
  url: string,
  formFactor: string,
): string[]
export declare function readReport(file: string): Run

export interface Classified {
  kind: 'valid' | 'inconclusive' | 'broken' | 'wrong-version'
  why?: string
}
export declare function classifyRun(run: Run): Classified

export interface PageRuns {
  page: string
  formFactor: string
  runs: Run[]
  machine?: MeasuringMachine
  floors?: Record<string, number>
  /** Audits allowed to fail on this page; defaults to `EXPECTED_BELOW_ONE[page]`. */
  expectedBelowOne?: string[]
}
export interface PageVerdict {
  key: string
  failures: string[]
  inconclusive: string[]
  advisories: string[]
  line: string
}
export declare function judgePage(page: PageRuns): PageVerdict

export declare function exact(score: number | null): string
export declare const MAX_NOT_JUDGED: number
export declare function evaluate(
  pages: PageRuns[],
  options?: { maxNotJudged?: number },
): {
  ok: boolean
  failures: string[]
  inconclusive: string[]
  advisories: string[]
  lines: string[]
}
