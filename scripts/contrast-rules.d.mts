/**
 * Types for `contrast-rules.mjs`, so TypeScript tests in every package can import it — the
 * same reason and the same shape as `copy-rules.d.mts` and `live-products.d.mts`.
 */

/** An sRGB byte triple. Declared as `number[]` because the implementation maps over it. */
export type Rgb = number[]

export interface ParsedColour {
  rgb: Rgb
  alpha: number
}

export declare function relativeLuminance(rgb: Rgb): number
export declare function parseCssColour(value: string): ParsedColour
export declare function compositeOver(top: Rgb, alpha: number, under: Rgb): Rgb
export declare function contrastRatio(a: Rgb, b: Rgb): number
export declare function contrastOf(
  foreground: string,
  background: string,
  options?: { opacity?: number },
): number
export declare function toHex(rgb: Rgb): string

/** One measured element: its label, and the foreground/background pairs to grade. */
export interface ContrastRow {
  label: string
  pairs: [Rgb, Rgb][]
}

/**
 * Runs INSIDE the page via `page.evaluate` — it touches `document` and `getComputedStyle`,
 * which is why it is typed here but never called from Node.
 */
export declare function measureContrastInPage(options: {
  selector: string
  part?: 'text' | 'border'
}): ContrastRow[]

export declare function worstRatio(row: ContrastRow): number
