/**
 * Types for `check-ts-extensions.mjs`, so TypeScript tests in every package can import it — the same
 * reason and the same shape as `copy-rules.d.mts`.
 */

export declare function unextendedSpecifiers(source: string): string[]
export declare function sharedImportProblems(files: { name: string; source: string }[]): string[]
