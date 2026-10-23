/**
 * Types for `export-design-tokens.mjs`, so the CMS's TypeScript tests can import it — the same
 * reason and the same shape as `contrast-rules.d.mts`.
 */

export declare const TOKENS_CSS: string
export declare const OUT_DIR: string
export declare const FILES: { light: string; dark: string; highContrast: string }
/** name → light-half CSS value of each override in tokens.css's `prefers-contrast: more` block. */
export declare function highContrastOverrides(css: string): Record<string, string>

export interface Declaration {
  name: string
  value: string
}

/** A Design Tokens Format Module 2025.10 document, kept loose: the tests validate its shape. */
export type TokenDocument = Record<string, unknown>

export declare function rootDeclarations(css: string): Declaration[]
export declare function colourValue(css: string): Record<string, unknown> | null
export declare function exportTokens(css: string): {
  light: TokenDocument
  dark: TokenDocument
  highContrast: TokenDocument
  omitted: string[]
}
export declare function serialise(doc: TokenDocument): string
export declare function renderFiles(css: string): Record<string, string>
