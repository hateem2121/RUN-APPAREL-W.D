import { getProductCards } from '../../lib/content'
import { buildLlmsFullTxt } from '../../lib/llmsFullTxt'
import { SITE_ORIGIN } from '../../lib/seo'

/**
 * `/llms-full.txt`.
 *
 * Sits at `src/app/`, outside both route groups, so it is served as plain text without
 * inheriting the frontend layout.
 *
 * Provides the complete technical compendium: manufacturing operations, the buyer guides,
 * the 8-step order workflow, and the 3D reference garment catalog.
 *
 * Cached for an hour at the edge and a day as stale.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const products = await getProductCards()
  return new Response(buildLlmsFullTxt(SITE_ORIGIN, products), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
