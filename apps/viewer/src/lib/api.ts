import type { ViewerApiResponse } from '@run-apparel/shared'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms.wear-run.help').replace(
  /\/$/,
  '',
)

/**
 * Fetch the published viewer payload.
 *
 * `colourSlug: null` is "/n001" — no colour named. The segment is dropped rather
 * than sent empty or stringified: `/n001/null` and `/n001/` are both read by the
 * API as a mangled colour and 404, which is the bug this path exists to fix.
 */
export async function fetchViewerData(
  productSlug: string,
  colourSlug: string | null,
): Promise<ViewerApiResponse> {
  const path =
    colourSlug === null
      ? `/api/public/viewer/${encodeURIComponent(productSlug)}`
      : `/api/public/viewer/${encodeURIComponent(productSlug)}/${encodeURIComponent(colourSlug)}`
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Viewer API responded ${res.status}`)
  }
  return (await res.json()) as ViewerApiResponse
}
