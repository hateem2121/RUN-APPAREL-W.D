/** Types for `live-garment-writes-lib.mjs`, so `apps/cms/src/liveGarmentWrites.test.ts` is typed. */

export function swapProblems(input: {
  product: {
    status?: unknown
    glbAsset?: unknown
    colourways?: Array<{ variantId?: unknown }>
  }
  mediaId: number
  media: { filesize?: unknown; mimeType?: unknown }
  servedBytes: number
  fileColours: string[]
}): string[]

export function renderRows<R extends Record<string, unknown>>(
  rows: R[],
  bySlug: Record<string, number>,
): Array<R & { renderImage?: number }> | { error: string }
