import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { pipelinePlanEndpoint } from './pipelinePlan'

/**
 * `GET /api/pipeline/plan/:productSlug` — the endpoint that tells the asset pipeline
 * which variant IDs to bake into a merged GLB.
 *
 * WHY THE COVERAGE GAP HERE WAS THE DANGEROUS KIND. This endpoint is PRIVATE (it
 * exposes internal ordering and draft products) and it was at 0%, meaning its
 * authorisation check had never been executed by a test. An auth regression here is
 * silent in both directions a reviewer would look: the happy path still works, and
 * the endpoint is not linked from anywhere, so nobody would notice it had opened.
 *
 * AND THE OUTPUT IS PHYSICALLY IRREVERSIBLE. The variant IDs this returns are baked
 * into the merged GLB, and the colourway slugs they derive from are printed on QR
 * tags. If this endpoint drops a colour or reorders the list, the pipeline produces a
 * file whose colour buttons silently do nothing on the live page — the exact failure
 * that made typing the IDs by hand unacceptable and caused this endpoint to exist.
 * `pnpm pipeline validate --strict` catches a mismatch against the CMS, but only if
 * what the CMS reported was right in the first place.
 */

const handler = pipelinePlanEndpoint.handler as (req: PayloadRequest) => Promise<Response>

const PRODUCT = {
  productCode: 'N001',
  slug: 'n001',
  colourways: [
    { displayName: 'Navy', slug: 'navy', active: true },
    { displayName: 'Wine', slug: 'wine', active: true },
    { displayName: 'Lime', slug: 'lime' }, // `active` absent — defaults to on
  ],
}

const makeReq = (
  role: string | null,
  routeParams: Record<string, string> = { productSlug: 'n001' },
  product: Record<string, unknown> | null = PRODUCT,
) => {
  const find = vi.fn().mockResolvedValue({ docs: product ? [product] : [] })
  const req = {
    user: role ? { role } : null,
    routeParams,
    payload: { find },
  } as unknown as PayloadRequest
  return { req, find }
}

describe('GET /api/pipeline/plan/:productSlug — authorisation', () => {
  it.each([
    ['an anonymous caller', null],
    ['an unknown role', 'viewer'],
    ['a near-miss role string', 'Admin'],
    ['an empty role', ''],
  ])('401s for %s, without querying the database', async (_label, role) => {
    const { req, find } = makeReq(role)
    const res = await handler(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(find, 'an unauthorised caller must not reach D1').not.toHaveBeenCalled()
  })

  it.each(['admin', 'editor'])('allows %s', async (role) => {
    const res = await handler(makeReq(role).req)
    expect(res.status).toBe(200)
  })

  /**
   * This response contains unpublished products and internal ordering. If it ever
   * acquires the public viewer's cache headers, that content lands in a shared edge
   * cache and can be served to someone who never authenticated.
   */
  it.each([
    ['unauthorised', null],
    ['authorised', 'admin'],
  ])('is never cacheable on the %s path', async (_label, role) => {
    const res = await handler(makeReq(role).req)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('GET /api/pipeline/plan/:productSlug — the plan', () => {
  it('derives variant IDs from the product code and colour slugs', async () => {
    const res = await handler(makeReq('admin').req)
    const body = (await res.json()) as {
      productCode: string
      slug: string
      colours: { displayName: string; slug: string; variantId: string }[]
      variantIds: string[]
    }

    expect(body.productCode).toBe('N001')
    expect(body.slug).toBe('n001')
    expect(body.variantIds).toEqual(['N001-NAVY', 'N001-WINE', 'N001-LIME'])
    expect(body.colours[0]).toEqual({
      displayName: 'Navy',
      slug: 'navy',
      variantId: 'N001-NAVY',
    })
  })

  /**
   * ROW ORDER IS THE CONTRACT. It decides which colour is the default on the live
   * page, and it is the order the pipeline expects its input files in. Sorting this
   * list "for tidiness" changes which garment a buyer sees first on every QR scan
   * that omits a colour.
   */
  it('preserves row order exactly, rather than sorting', async () => {
    const scrambled = {
      ...PRODUCT,
      colourways: [
        { displayName: 'Wine', slug: 'wine', active: true },
        { displayName: 'Navy', slug: 'navy', active: true },
      ],
    }
    const res = await handler(makeReq('admin', { productSlug: 'n001' }, scrambled).req)
    const body = (await res.json()) as { variantIds: string[] }

    expect(body.variantIds).toEqual(['N001-WINE', 'N001-NAVY'])
  })

  it('skips retired colours but keeps ones where active is merely absent', async () => {
    const mixed = {
      ...PRODUCT,
      colourways: [
        { displayName: 'Navy', slug: 'navy', active: false },
        { displayName: 'Wine', slug: 'wine', active: true },
        { displayName: 'Lime', slug: 'lime' },
      ],
    }
    const res = await handler(makeReq('admin', { productSlug: 'n001' }, mixed).req)
    const body = (await res.json()) as { variantIds: string[] }

    // Only an EXPLICIT false retires a colour — the same defaulting rule the public
    // projection uses. Treating `undefined` as retired would drop every colour row
    // created before the field existed.
    expect(body.variantIds).toEqual(['N001-WINE', 'N001-LIME'])
  })

  it('returns an empty plan rather than failing when a product has no colours', async () => {
    const bare = { productCode: 'T004', slug: 't004', colourways: [] }
    const res = await handler(makeReq('admin', { productSlug: 't004' }, bare).req)
    const body = (await res.json()) as { colours: unknown[]; variantIds: unknown[] }

    expect(res.status).toBe(200)
    expect(body.colours).toEqual([])
    expect(body.variantIds).toEqual([])
  })

  it.each([
    ['an empty slug', { productSlug: '' }],
    ['a missing slug', {}],
  ])('404s on %s without querying', async (_label, params) => {
    const { req, find } = makeReq('admin', params as Record<string, string>)
    const res = await handler(req)

    expect(res.status).toBe(404)
    expect(find).not.toHaveBeenCalled()
  })

  it('404s with the slug named when no product matches', async () => {
    const { req } = makeReq('admin', { productSlug: 'nope' }, null)
    const res = await handler(req)

    expect(res.status).toBe(404)
    const body = (await res.json()) as { message: string }
    expect(body.message).toContain('nope')
  })

  /**
   * Unlike the public endpoint, this one deliberately does NOT filter on
   * `status: published` — preparing assets for a draft product is the entire point.
   * Pinned so a copy-paste from publicViewer.ts cannot quietly make it impossible to
   * process a garment before launch.
   */
  it('queries without a published filter, so draft products can be prepared', async () => {
    const { req, find } = makeReq('admin')
    await handler(req)

    const where = find.mock.calls[0]?.[0]?.where as Record<string, unknown>
    expect(JSON.stringify(where)).not.toContain('published')
    expect(where).toEqual({ slug: { equals: 'n001' } })
  })
})
