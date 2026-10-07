import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawingToKeep, keptRenders } from '../pageCache.mjs'
import { PUBLIC_VIEWER_VARY } from '../publicViewerHeaders.mjs'
import {
  API_CACHE_SECONDS,
  API_HOST,
  API_RENDER_HEADERS,
  allowedOrigins,
  apiCacheKey,
  keepableApiAnswer,
  keepableApiRequest,
  keptApiHeaders,
  serveViewerApi,
  servedApiHeaders,
  withViewerCors,
} from '../viewerApiCache.mjs'
import { publicViewerEndpoint } from './endpoints/publicViewer'
import { __clearRelatedCache, publishedCards } from './endpoints/relatedGarments'
import { __clearViewerCache, viewerCacheKey, writeViewerCache } from './endpoints/viewerCache'

/**
 * The garment data kept in Cloudflare's cache (viewerApiCache.mjs, 2026-10-07: an uncached answer
 * took 4.0–4.5 s from Pakistan, ~10 database trips from `local-ISB` to ENAM). Each case below is a
 * way to serve one visitor something not meant for them, or everyone a stale or broken answer.
 * The worst is CORS: the Cache API ignores `Vary`, so a kept `Access-Control-Allow-Origin` would
 * be served to the next visitor from another origin and their browser would refuse the garment.
 */

const ALLOWED = 'https://viewer.wear-run.help,https://wear-run.help,https://wear-run.com'
const API = `https://${API_HOST}/api/public/viewer`

const GARMENT = {
  product: { slug: 'rxps', productName: 'Skinsuit' },
  selectedColourway: { slug: 'wine' },
  colourways: [{ slug: 'wine' }],
}

/** What OpenNext + Payload answer: Payload's CORS rule applied to the request it was GIVEN. */
const payloadLike =
  (body: unknown = GARMENT, status = 200, contentType = 'application/json') =>
  async (request: Request): Promise<Response> => {
    const headers = new Headers({
      'content-type': contentType,
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      'x-robots-tag': 'noindex',
      vary: PUBLIC_VIEWER_VARY,
      'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
      'access-control-allow-methods': 'PUT, PATCH, POST, GET, DELETE, OPTIONS',
    })
    const origin = request.headers.get('origin')
    if (origin && ALLOWED.split(',').includes(origin)) {
      headers.set('access-control-allow-credentials', 'true')
      headers.set('access-control-allow-origin', origin)
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers,
    })
  }

/** `caches.default`, in memory: a stored copy comes back as a fresh Response. */
const fakeCache = () => {
  const store = new Map<string, { text: string; status: number; headers: [string, string][] }>()
  return {
    store,
    match: vi.fn(async (key: string) => {
      const hit = store.get(key)
      if (!hit) return undefined
      return new Response(hit.text, { status: hit.status, headers: hit.headers })
    }),
    put: vi.fn(async (key: string, response: Response) => {
      store.set(key, {
        text: await response.text(),
        status: response.status,
        headers: [...response.headers.entries()],
      })
    }),
    /** The one copy kept so far: what a later visitor would be served. */
    only: () => {
      const [kept, ...more] = [...store.values()]
      if (!kept || more.length > 0) throw new Error(`expected one kept copy, found ${store.size}`)
      return kept
    },
  }
}

const setup = (draw = payloadLike()) => {
  let version = 'v1'
  const pending: Promise<unknown>[] = []
  const env = {
    CF_VERSION_METADATA: { id: 'deploy-1' },
    SITE_CACHE: { get: vi.fn(async () => version) },
    VIEWER_ALLOWED_ORIGINS: ALLOWED,
  }
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) }
  const cache = fakeCache()
  const drawSpy = vi.fn(draw)
  const ask = async (path = '/rxps/wine', init: RequestInit = {}) => {
    const response = await serveViewerApi(
      new Request(`${API}${path}`, init),
      env,
      ctx,
      drawSpy,
      cache,
    )
    await Promise.all(pending.splice(0))
    return response
  }
  return {
    env,
    cache,
    draw: drawSpy,
    ask,
    save: (next: string) => {
      version = next
    },
  }
}

const from = (origin: string): RequestInit => ({ headers: { origin } })

afterEach(() => {
  __clearViewerCache()
  __clearRelatedCache()
})

describe('which requests the garment-data cache may answer', () => {
  it.each(['/rxps/wine', '/rxps', '/r-avn/navy'])('keeps GET %s on the API host', (path) => {
    expect(keepableApiRequest(new Request(`${API}${path}`))).toBe(true)
  })

  it.each<[string, Request]>([
    ['a POST', new Request(`${API}/rxps/wine`, { method: 'POST', body: 'x' })],
    ['a HEAD', new Request(`${API}/rxps/wine`, { method: 'HEAD' })],
    ['a preflight', new Request(`${API}/rxps/wine`, { method: 'OPTIONS' })],
    ['a query string', new Request(`${API}/rxps/wine?x=1`)],
    ['a deeper path', new Request(`${API}/rxps/wine/extra`)],
    ['the bare prefix', new Request(API)],
    ['a trailing slash', new Request(`${API}/rxps/`)],
    ['another API path', new Request(`https://${API_HOST}/api/health`)],
    ['the products API', new Request(`https://${API_HOST}/api/products`)],
    ['the admin', new Request(`https://${API_HOST}/admin`)],
    ['the website host', new Request('https://wear-run.com/api/public/viewer/rxps/wine')],
    ['the old host', new Request('https://wear-run.help/api/public/viewer/rxps/wine')],
  ])('never %s', (_label, request) => {
    expect(keepableApiRequest(request)).toBe(false)
  })

  it('leaves every other request to the Worker untouched: no cache read, no draw', async () => {
    const { ask, draw, cache } = setup()
    for (const path of ['/rxps/wine?x=1', '/rxps/wine/extra']) {
      expect(await ask(path)).toBeNull()
    }
    expect(
      await serveViewerApi(
        new Request(`https://${API_HOST}/admin`),
        {},
        { waitUntil: () => {} },
        draw,
        cache,
      ),
    ).toBeNull()
    expect(draw).not.toHaveBeenCalled()
    expect(cache.match).not.toHaveBeenCalled()
  })

  it('answers as before (null) without the deploy id, the KV binding, or a readable cache', async () => {
    const { env, draw, cache } = setup()
    const request = () => new Request(`${API}/rxps/wine`)
    const ctx = { waitUntil: () => {} }
    expect(
      await serveViewerApi(request(), { ...env, CF_VERSION_METADATA: undefined }, ctx, draw, cache),
    ).toBeNull()
    expect(
      await serveViewerApi(request(), { ...env, SITE_CACHE: undefined }, ctx, draw, cache),
    ).toBeNull()
    const broken = { ...env, SITE_CACHE: { get: vi.fn().mockRejectedValue(new Error('KV down')) } }
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    expect(await serveViewerApi(request(), broken, ctx, draw, cache)).toBeNull()
    expect(draw).not.toHaveBeenCalled()
  })
})

describe('the cache key', () => {
  it('holds the address, the deploy and the content version', () => {
    const key = apiCacheKey(`${API}/rxps/wine`, 'deploy-1', 'v1')
    expect(key).toBe(`https://${API_HOST}/__api-cache/deploy-1/v1/api/public/viewer/rxps/wine`)
    expect(apiCacheKey(`${API}/rxps/wine`, 'deploy-1', 'v2')).not.toBe(key)
    expect(apiCacheKey(`${API}/rxps/wine`, 'deploy-2', 'v1')).not.toBe(key)
    expect(apiCacheKey(`${API}/rxps/navy`, 'deploy-1', 'v1')).not.toBe(key)
  })
})

describe('a miss draws and keeps, a hit answers without drawing', () => {
  it('draws once, then answers the same body from the kept copy', async () => {
    const { ask, draw } = setup()
    const first = await ask()
    expect(first?.status).toBe(200)
    expect(first?.headers.get('server-timing')).toContain('miss')
    const firstBody = await first?.text()

    const second = await ask()
    expect(second?.status).toBe(200)
    expect(second?.headers.get('server-timing')).toContain('hit')
    expect(await second?.text()).toBe(firstBody)
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('a CMS save (a new content version) makes the next request draw again', async () => {
    const { ask, draw, save } = setup()
    await ask()
    await ask()
    expect(draw).toHaveBeenCalledTimes(1)
    save('v2')
    expect((await ask())?.headers.get('server-timing')).toContain('miss')
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('serves the answer’s own Cache-Control and headers, and none of the cache’s bookkeeping', async () => {
    const { ask, cache } = setup()
    await ask()
    const kept = cache.only()
    const keptHeaders = new Headers(kept.headers)
    expect(keptHeaders.get('cache-control')).toBe(`public, max-age=${API_CACHE_SECONDS}`)
    const hit = await ask()
    expect(hit?.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300',
    )
    expect(hit?.headers.get('x-robots-tag')).toBe('noindex')
    expect(hit?.headers.get('strict-transport-security')).toContain('max-age=63072000')
    expect(hit?.headers.get('content-type')).toBe('application/json')
    expect(hit?.headers.get('vary')).toBe(PUBLIC_VIEWER_VARY)
    expect(hit?.headers.has('x-run-api-cache-control')).toBe(false)
    expect(hit?.headers.get('server-timing')).toBe('api-cache;desc="hit"')
  })

  it('draws from a clean request: none of the visitor’s headers reach Payload', async () => {
    const { ask, draw } = setup()
    await ask('/rxps/wine', {
      headers: { origin: 'https://wear-run.com', cookie: 'payload-token=x', 'x-evil': '1' },
    })
    const [drawn] = draw.mock.calls[0] as [Request]
    expect(drawn.url).toBe(`${API}/rxps/wine`)
    expect([...drawn.headers.keys()].sort()).toEqual(Object.keys(API_RENDER_HEADERS).sort())
  })

  it('draws inside the keep marker, so the handler skips its minute-old memory', async () => {
    const seen: boolean[] = []
    const { ask } = setup(async (request) => {
      seen.push(drawingToKeep())
      return payloadLike()(request)
    })
    await ask()
    expect(seen).toEqual([true])
    expect(drawingToKeep(), 'and only inside it').toBe(false)
  })
})

describe('CORS is worked out for each request, never kept (the Origin trap)', () => {
  it('each origin gets its own grant, a stranger and the viewer binding get none', async () => {
    const { ask, draw, cache } = setup()
    const first = await ask('/rxps/wine', from('https://wear-run.com'))
    expect(first?.headers.get('access-control-allow-origin')).toBe('https://wear-run.com')
    expect(first?.headers.get('access-control-allow-credentials')).toBe('true')

    // The kept copy carries no grant at all.
    const kept = cache.only()
    const keptNames = kept.headers.map(([name]) => name.toLowerCase())
    expect(keptNames).not.toContain('access-control-allow-origin')
    expect(keptNames).not.toContain('access-control-allow-credentials')

    const viewer = await ask('/rxps/wine', from('https://viewer.wear-run.help'))
    expect(viewer?.headers.get('server-timing')).toContain('hit')
    expect(viewer?.headers.get('access-control-allow-origin')).toBe('https://viewer.wear-run.help')

    const stranger = await ask('/rxps/wine', from('https://evil.example'))
    expect(stranger?.headers.has('access-control-allow-origin')).toBe(false)
    expect(stranger?.headers.has('access-control-allow-credentials')).toBe(false)

    // The viewer Worker's binding sends no Origin.
    const binding = await ask('/rxps/wine')
    expect(binding?.headers.has('access-control-allow-origin')).toBe(false)
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('a copy that somehow kept a grant still answers with the asker’s own (belt and braces)', () => {
    const planted = new Headers({
      'access-control-allow-origin': 'https://viewer.wear-run.help',
      'access-control-allow-credentials': 'true',
    })
    const allowed = allowedOrigins({ VIEWER_ALLOWED_ORIGINS: ALLOWED })
    const served = servedApiHeaders(planted, 'https://evil.example', allowed)
    expect(served.has('access-control-allow-origin')).toBe(false)
    expect(served.has('access-control-allow-credentials')).toBe(false)
    expect(
      servedApiHeaders(planted, 'https://wear-run.com', allowed).get('access-control-allow-origin'),
    ).toBe('https://wear-run.com')
    // And keeping strips one before it is ever stored.
    expect(keptApiHeaders(planted).has('access-control-allow-origin')).toBe(false)
  })

  it('matches Payload exactly: no prefix, case or trailing-slash look-alikes', () => {
    const allowed = allowedOrigins({ VIEWER_ALLOWED_ORIGINS: ALLOWED })
    for (const near of [
      'https://wear-run.com.evil.example',
      'https://WEAR-RUN.com',
      'https://wear-run.com/',
      'http://wear-run.com',
      'null',
    ]) {
      expect(withViewerCors(new Headers(), near, allowed).has('access-control-allow-origin')).toBe(
        false,
      )
    }
  })

  it('falls back to Payload’s own default list when the variable is missing', () => {
    expect(allowedOrigins({})).toEqual(['https://wear-run.com'])
    expect(
      allowedOrigins({ VIEWER_ALLOWED_ORIGINS: ' https://a.example , https://b.example' }),
    ).toEqual(['https://a.example', 'https://b.example'])
  })

  it('a 404 still carries the asker’s grant, so the page can read the status', async () => {
    const { ask } = setup(payloadLike({ error: 'not_found', message: 'x' }, 404))
    const res = await ask('/nope/wine', from('https://wear-run.com'))
    expect(res?.status).toBe(404)
    expect(res?.headers.get('access-control-allow-origin')).toBe('https://wear-run.com')
  })
})

describe('only a whole, real garment is kept', () => {
  it.each<[string, () => (request: Request) => Promise<Response>]>([
    ['a 404', () => payloadLike({ error: 'not_found', message: 'x' }, 404)],
    ['a 500', () => payloadLike({ errors: [{ message: 'D1' }] }, 500)],
    // The status alone must refuse it: the body checks below would let this one through.
    ['a non-200 carrying a garment-shaped body', () => payloadLike(GARMENT, 203)],
    ['an error body with a 200', () => payloadLike({ error: 'not_found', message: 'x' })],
    ['a body naming no garment', () => payloadLike({ product: {} })],
    ['a body that is not JSON', () => payloadLike('{"product":', 200)],
    ['an HTML page', () => payloadLike('<html></html>', 200, 'text/html')],
  ])('never keeps %s, and draws again next time', async (_label, make) => {
    const { ask, draw, cache } = setup(make())
    await ask()
    await ask()
    expect(cache.put).not.toHaveBeenCalled()
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('never keeps an answer drawn without its "More from" list (a spoiled render)', async () => {
    const { ask, cache } = setup(async (request) => {
      keptRenders().getStore().spoiled = true
      return payloadLike()(request)
    })
    expect((await ask())?.status).toBe(200)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('never keeps an answer that sets a cookie or arrives compressed', () => {
    const text = JSON.stringify(GARMENT)
    const ok = new Response(text, { headers: { 'content-type': 'application/json' } })
    expect(keepableApiAnswer(ok, text)).toBe(true)
    const cookie = new Response(text, {
      headers: { 'content-type': 'application/json', 'set-cookie': 'a=1' },
    })
    expect(keepableApiAnswer(cookie, text)).toBe(false)
    const gzip = new Response(text, {
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    })
    expect(keepableApiAnswer(gzip, text)).toBe(false)
  })
})

describe('the handler while a copy is being drawn to keep', () => {
  const PRODUCT = {
    productCode: 'N001',
    slug: 'n001',
    productName: 'Velocity Tee',
    category: 'Sportswear',
    variantMode: 'single-glb-variants',
    glbAsset: { url: '/media/n001.glb', mimeType: 'model/gltf-binary' },
    status: 'published',
    colourways: [
      {
        variantId: 'N001-WINE',
        displayName: 'Wine',
        slug: 'wine',
        sequence: 1,
        posterPreview: { url: '/media/wine.webp', mimeType: 'image/webp' },
        active: true,
      },
    ],
  }
  const handler = publicViewerEndpoint.handler as (req: PayloadRequest) => Promise<Response>
  const makeReq = (find: ReturnType<typeof vi.fn>) =>
    ({
      routeParams: { productSlug: 'n001', colourSlug: 'wine' },
      url: 'https://cms.example/api/x',
      payload: { find, findGlobal: vi.fn().mockResolvedValue({}) },
    }) as unknown as PayloadRequest

  it('reads the database, not the minute-old memory (control: outside, the memory answers)', async () => {
    writeViewerCache(viewerCacheKey('https://cms.example', 'n001', 'wine'), { stale: true })
    const outside = vi.fn(async () => ({ docs: [PRODUCT] }))
    expect(await (await handler(makeReq(outside))).json()).toEqual({ stale: true })
    expect(outside).not.toHaveBeenCalled()

    const inside = vi.fn(async () => ({ docs: [PRODUCT] }))
    const body = await keptRenders().run({ spoiled: false }, async () =>
      (await handler(makeReq(inside))).json(),
    )
    expect(body).not.toEqual({ stale: true })
    expect(inside).toHaveBeenCalled()
  })

  it('reads the published list fresh, and a failed list spoils the copy', async () => {
    const payload = { find: vi.fn(async () => ({ docs: [PRODUCT] })) }
    await publishedCards(payload as never)
    await publishedCards(payload as never)
    expect(payload.find, 'outside: the minute-old list').toHaveBeenCalledTimes(1)
    await publishedCards(payload as never, { fresh: true })
    expect(payload.find, 'fresh: the database').toHaveBeenCalledTimes(2)

    const failing = { find: vi.fn().mockRejectedValue(new Error('D1 is having a bad minute')) }
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    const render = { spoiled: false }
    await keptRenders().run(render, () => publishedCards(failing as never, { fresh: true }))
    expect(render.spoiled).toBe(true)
  })
})
