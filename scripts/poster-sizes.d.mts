/** Types for `poster-sizes.mjs`, so a TypeScript test can import it (same shape as live-products.d.mts). */

export interface PosterSample {
  slug: string
  colour: string
  /** The product's `category`, e.g. "Sportswear" — posters are judged within this group. */
  family: string
  bytes: number
}

export interface OwnerException {
  /** A LIVE_PRODUCTS slug. */
  product: string
  maxRatio: number
  reason: string
}

export type PosterVerdict = 'ok' | 'excepted' | 'flagged'

export interface JudgedPoster extends PosterSample {
  /** `bytes` divided by its family's median. */
  ratio: number
  verdict: PosterVerdict
  note: string
}

export interface PosterJudgement {
  rows: JudgedPoster[]
  /** Family name -> median bytes. */
  medians: Record<string, number>
  flagged: JudgedPoster[]
  excepted: JudgedPoster[]
}

export declare const FLAG_AT: number
export declare const OWNER_EXCEPTIONS: OwnerException[]
/** 0 for an empty list; the mean of the two middle values for an even count. */
export declare function median(values: number[]): number
export declare function judgePosters(
  posters: PosterSample[],
  options?: { exceptions?: OwnerException[] },
): PosterJudgement
