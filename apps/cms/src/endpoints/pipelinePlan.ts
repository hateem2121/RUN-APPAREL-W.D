import { buildVariantId, normalizeSlug } from '@run-apparel/shared'
import type { Endpoint, PayloadRequest } from 'payload'

/**
 * GET /api/pipeline/plan/:productSlug
 *
 * The asset pipeline's `merge --from-cms <slug>` reads this instead of taking a
 * `<file.glb>=<VARIANT-ID>` token per input on the command line.
 *
 * Why it exists: merging one raw GLB per colour used to mean typing the variant
 * IDs by hand at the terminal, and they had to match the CMS character for
 * character or the colour buttons silently died on the live page. The CMS is the
 * only place that knows what the colours are, so the CMS is what tells the
 * pipeline. Nothing is stored twice — the IDs are derived from the colour rows.
 *
 * PRIVATE: authenticated staff or the robot API key only. It exposes internal
 * ordering, so it must never sit behind the public viewer's cache headers.
 */
export const pipelinePlanEndpoint: Endpoint = {
  path: '/pipeline/plan/:productSlug',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const headers = { 'Cache-Control': 'no-store' }

    const role = (req.user as { role?: string } | null | undefined)?.role
    if (role !== 'admin' && role !== 'editor') {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers })
    }

    const params = (req.routeParams ?? {}) as { productSlug?: string }
    const productSlug = normalizeSlug(String(params.productSlug ?? ''))
    if (!productSlug) {
      return Response.json({ error: 'not_found', message: 'Not a valid product address.' }, { status: 404, headers })
    }

    const found = await req.payload.find({
      collection: 'products',
      where: { slug: { equals: productSlug } },
      limit: 1,
      depth: 0,
      req,
    })
    const product = found.docs[0]
    if (!product) {
      return Response.json(
        { error: 'not_found', message: `No product has the web address word “${productSlug}”.` },
        { status: 404, headers },
      )
    }

    const productCode = String(product.productCode ?? '')
    const rows = Array.isArray(product.colourways) ? product.colourways : []
    // Row order is the order the pipeline expects its input files in, and
    // switched-off colours are skipped — a retired colour has no business
    // consuming a slot in a fresh merge.
    const colours = rows
      .map((raw) => (raw ?? {}) as Record<string, unknown>)
      .filter((row) => row.active !== false)
      .map((row) => ({
        displayName: String(row.displayName ?? ''),
        slug: String(row.slug ?? ''),
        variantId: buildVariantId(productCode, String(row.slug ?? '')),
      }))

    return Response.json(
      {
        productCode,
        slug: productSlug,
        colours,
        variantIds: colours.map((c) => c.variantId),
      },
      { headers },
    )
  },
}
