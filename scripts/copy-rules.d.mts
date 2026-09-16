/**
 * Types for `copy-rules.mjs`, so TypeScript tests in every package can import it — the same
 * reason and the same shape as `live-products.d.mts`.
 */

export declare const BRITISH_SPELLING: RegExp
export declare function findBritishSpellings(text: string): string[]
export declare function toAmerican(text: string): string

export declare const BUZZWORDS: readonly string[]
export declare const GARMENT_TERMS: readonly string[]
export declare function findBuzzwords(
  text: string,
  options?: { allow?: readonly string[] },
): string[]

export declare function findEmoji(text: string): string[]
export declare function findPlaceholders(text: string): string[]
export declare function llmsTxtProblems(content: string): string[]

export interface PageCopy {
  headings: string[]
  body: string
  decoded: string[]
}
export declare function readCopyInPage(): PageCopy

export interface PrimaryAction {
  label: string
  destination: string
  top: number
  fixed: boolean
}
export interface PrimaryActions {
  primaries: PrimaryAction[]
  windows: { top: number; destinations: string[] }[]
}
export declare function primaryActionsInPage(): PrimaryActions
