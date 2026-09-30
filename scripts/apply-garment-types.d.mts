/** Types for `apply-garment-types.mjs`, so TypeScript tests can import it. */

export declare const GARMENT_TYPES: Record<string, string>
export declare const NAME_FIX: { slug: string; wrong: string; right: string }
/** What to do with one product's garment type: never overwrites a value the owner typed. */
export declare function plannedType(
  stored: unknown,
  approved: string,
): 'write' | 'already' | 'owner-edited'
/** `text` with the misspelling corrected, in whatever letter case it was written. */
export declare function fixSpelling<T>(text: T, fix?: typeof NAME_FIX): T
/** The colour rows to send back for the spelling fix, or the reason not to send them. */
export declare function fixedColourRows(
  rows: unknown,
): { rows: Array<Record<string, unknown>>; changed: number } | { refuse: string }
