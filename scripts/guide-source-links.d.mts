/** Types for `guide-source-links.mjs`, so TypeScript tests can import it. */

export declare const GUIDE_FILES: readonly string[]
export declare function parseSources(text: string): { url: string; guide: string }[]
