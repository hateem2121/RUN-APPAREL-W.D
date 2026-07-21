import type { ViewerApiResponse } from '@run-apparel/shared'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms.wear-run.help').replace(/\/$/, '')

/** Fetch the published viewer payload for a product/colourway pair. */
export async function fetchViewerData(
  productSlug: string,
  colourSlug: string,
): Promise<ViewerApiResponse> {
  const res = await fetch(
    `${API_BASE}/api/public/viewer/${encodeURIComponent(productSlug)}/${encodeURIComponent(colourSlug)}`,
    { headers: { accept: 'application/json' } },
  )
  if (!res.ok && res.status !== 404) {
    throw new Error(`Viewer API responded ${res.status}`)
  }
  return (await res.json()) as ViewerApiResponse
}
