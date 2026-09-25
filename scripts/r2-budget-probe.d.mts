/** Types for `r2-budget-probe.mjs`, so a TypeScript test can import it. */

export interface OperationSum {
  actionType: string
  requests: number
}

export interface ClassifiedOperations {
  classA: number
  classB: number
  unclassified: string[]
}

export type BudgetVerdict = 'PASS' | 'WARN' | 'FAIL'

export interface StorageReading {
  bucketName: string
  datetime: string
  bytes: number
}

export interface DailyStoragePeak {
  bucketName: string
  date: string
  bytes: number
}

export interface CostUsage {
  storageBytes: number
  classA: number
  classB: number
}

export interface BudgetUsage {
  currentBytes: number
  billedBytes: number
  classA: number
  classB: number
}

export interface BudgetResult {
  verdict: BudgetVerdict
  atCurrentRate: number
  trailing: number
  fraction: { storage: number; classA: number; classB: number }
  worst: number
}

export declare const FREE_TIER: { storageBytes: number; classA: number; classB: number }
export declare const PRICE: { perGBMonth: number; perMillionClassA: number; perMillionClassB: number }
export declare const WARN_AT_FRACTION: number
export declare const CLASS_A_ACTIONS: Set<string>
export declare const CLASS_B_ACTIONS: Set<string>
export declare const FREE_ACTIONS: Set<string>

export declare function classifyOperations(operationSums: OperationSum[]): ClassifiedOperations
export declare function currentStorageBytes(rows: StorageReading[]): number
export declare function billedStorageBytes(rows: DailyStoragePeak[]): number
export declare function estimateMonthlyCost(usage: CostUsage): number
export declare function evaluateR2Budget(usage: BudgetUsage): BudgetResult
