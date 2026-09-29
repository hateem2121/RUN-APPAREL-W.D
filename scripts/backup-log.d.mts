/** Types for `backup-log.mjs`, so a TypeScript test can import it. */
export declare const INQUIRY_BUCKET: string
export declare function objectLabel(bucket: string, key: string, index: number): string
export declare function summaryLine(counts: {
  saved: number
  failed: number
  inquiryFailed: number
  unverified: number
  mismatched: number
}): string
