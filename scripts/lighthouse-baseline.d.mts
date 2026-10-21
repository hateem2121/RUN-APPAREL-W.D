/** Types for `lighthouse-baseline.mjs`, so TypeScript tests can import it. */
import type { Run } from './lighthouse-robot.mjs'

export interface JobEntry {
  page: string
  formFactor: string
  run: Run
}

export interface BaselineSummary {
  jobs: number
  medians: number[]
  worstMedian: number | null
  p10Median: number | null
  stallRate: number
  cpuMedian: number | null
  failuresAt(floor: number): number
}

export declare function readJobDir(dir: string): JobEntry[]
export declare function summariseBaseline(jobs: JobEntry[][]): Record<string, BaselineSummary>
