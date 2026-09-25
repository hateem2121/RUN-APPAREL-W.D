/** Types for `canonical-tags.mjs`, so TypeScript tests can import it (same shape as contrast-rules.d.mts). */

/** The HTML with every comment removed, repeated until stable. */
export declare function stripHtmlComments(html: string): string
/** Every real `<link rel="canonical">`'s href in document order; `''` for a tag with no href. */
export declare function canonicalHrefs(html: string): string[]
