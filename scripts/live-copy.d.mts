/** Types for `live-copy.mjs`, so a TypeScript test can import it (same shape as live-products.d.mts). */
export interface Head {
  title: string
  description: string
}
export declare function readHead(html: string): Head
export declare function headProblems(pages: Array<Head & { url: string }>, shell: Head): string[]
export declare function payloadCopyProblems(slug: string, payload: unknown): string[]
export declare function runVerdict(result: {
  problems?: string[]
  refusedCount?: number
  pages?: number
}): 'problems' | 'inconclusive' | 'clean'
