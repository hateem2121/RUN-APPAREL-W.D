/** Types for `warm-shared-store.mjs`, so a TypeScript test can import it (same shape as footer-facts-probe.d.mts). */
export type StoreVerdict = 'hit' | 'miss' | 'skip' | 'ok' | 'inconclusive' | 'error'

export declare const SITE_ORIGIN: string
export declare const API_ORIGIN: string
export declare function warmTargets(
  sitemapXml: string,
  origin?: string,
): { pages: string[]; garments: string[] }
export declare function storeVerdict(status: number, serverTiming: string): StoreVerdict
export declare function summarize(
  results: { url: string; status?: number; verdict: StoreVerdict }[],
): {
  counts: Record<StoreVerdict, number>
  warnings: string[]
  exitCode: 0
}
