import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.hoisted`, as in journalHooks.test.ts: vi.mock's factory runs before module scope.
const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))

import { garmentIndexNowUrls, pingIndexNowForGarment } from './garmentIndexNow'

/**
 * A garment's pages go to IndexNow when the garment changes (2026-10-08, `garmentIndexNow.ts`).
 */
type Doc = Record<string, unknown>
const ORIGIN = 'https://wear-run.com'

const garment = (over: Doc = {}): Doc => ({
  status: 'published',
  slug: 'rxps',
  colourways: [{ slug: 'wine', active: true }, { slug: 'lime' }, { slug: 'navy', active: false }],
  ...over,
})

describe('the addresses a garment save changes', () => {
  it('a live garment: every colour page that exists, then /products', () => {
    expect(garmentIndexNowUrls(garment(), undefined, ORIGIN)).toEqual([
      'https://wear-run.com/products/rxps/wine',
      'https://wear-run.com/products/rxps/lime',
      'https://wear-run.com/products',
    ])
  })

  it('a garment taken off the site: the pages that just went away', () => {
    const before = garment()
    const after = garment({ status: 'draft' })
    expect(garmentIndexNowUrls(after, before, ORIGIN)).toEqual(
      garmentIndexNowUrls(before, undefined, ORIGIN),
    )
  })

  it('nothing for a garment that was never live, or with no slug or colour', () => {
    expect(garmentIndexNowUrls(garment({ status: 'draft' }), undefined, ORIGIN)).toEqual([])
    expect(
      garmentIndexNowUrls(garment({ status: 'draft' }), garment({ status: 'draft' }), ORIGIN),
    ).toEqual([])
    expect(garmentIndexNowUrls(garment({ slug: '' }), undefined, ORIGIN)).toEqual([])
    expect(garmentIndexNowUrls(garment({ colourways: [] }), undefined, ORIGIN)).toEqual([])
  })
})

describe('the garment hook itself', () => {
  const liveEnv = { SITE_INDEXING: 'visible', CMS_PUBLIC_URL: 'https://cms.wear-run.help' }
  const call = (doc: Doc, previousDoc: Doc | undefined, host: string) =>
    pingIndexNowForGarment({ doc, previousDoc, req: { headers: new Headers({ host }) } } as never)

  beforeEach(() => {
    getCloudflareContext.mockReset()
    vi.unstubAllGlobals()
  })

  it('hands the garment’s pages to waitUntil from the live admin, and returns the doc', async () => {
    const waitUntil = vi.fn()
    const post = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('', { status: 202 }),
    )
    vi.stubGlobal('fetch', post)
    getCloudflareContext.mockResolvedValue({ env: liveEnv, ctx: { waitUntil } })
    const doc = garment()
    expect(await call(doc, undefined, 'cms.wear-run.help')).toBe(doc)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0]![0]
    const body = JSON.parse(String(post.mock.calls[0]![1].body)) as { urlList: string[] }
    expect(body.urlList).toEqual(garmentIndexNowUrls(doc, undefined, 'https://wear-run.com'))
  })

  it('sends nothing for a draft, from localhost, or with no Worker context', async () => {
    const waitUntil = vi.fn()
    getCloudflareContext.mockResolvedValue({ env: liveEnv, ctx: { waitUntil } })
    await call(garment({ status: 'draft' }), undefined, 'cms.wear-run.help')
    await call(garment(), undefined, 'localhost:4174')
    expect(waitUntil).not.toHaveBeenCalled()

    getCloudflareContext.mockRejectedValue(new Error('no context under payload run'))
    const doc = garment()
    expect(await call(doc, undefined, 'cms.wear-run.help')).toBe(doc)
  })

  it('is wired to every garment save', () => {
    const products = readFileSync(
      join(import.meta.dirname, '..', 'collections', 'Products.ts'),
      'utf8',
    )
    expect(products).toMatch(/afterChange: \[[^\]]*pingIndexNowForGarment[^\]]*\]/)
  })
})
