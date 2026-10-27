import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  drawingToKeep,
  KEPT_CACHE_CONTROL,
  keptRenders,
  STORE_MODE_KEY,
  sharedCacheKey,
} from '../pageCache.mjs'
import { PUBLIC_VIEWER_VARY } from '../publicViewerHeaders.mjs'
import {
  API_HOST,
  API_RENDER_HEADERS,
  allowedOrigins,
  keepableApiAnswer,
  keepableApiRequest,
  keepApiAnswer,
  keptApiHeaders,
  serveViewerApi,
  servedApiHeaders,
  answerWarmRequest,
  warmGarmentTarget,
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

/**
 * Workers Cache in front of SitePages, in memory: read-through by `cf.cacheKey`. A miss runs
 * SitePages's own decision (keepApiAnswer, as worker.mjs does) and stores only an answer it marked
 * kept; a hit comes back as a fresh Response with `Cf-Cache-Status: HIT`.
 *
 * ⚠️ AND IT FOLLOWS A REDIRECT UNLESS TOLD NOT TO, AS THE RUNTIME DOES. `fetch()` on a service
 * binding or `ctx.exports` has Fetch semantics: the default redirect mode follows a 3xx "resulting
 * in an HTTP request to the public internet" (Cloudflare, Workers RPC "Reserved methods", read
 * 2026-10-25). That is how #247 served /factory as the factory page (200) instead of its 308 live
 * on 2026-10-25: this fake used to hand the 308 back whatever the caller asked, so it could not fail
 * the way production did.
 */
const FOLLOWED_BODY = 'the page the redirect pointed at'
const fakeStore = (draw: (request: Request) => Promise<Response>) => {
  const kept = new Map<string, { text: string; status: number; headers: [string, string][] }>()
  const follow = (answer: Response, init?: { redirect?: string }) =>
    answer.status >= 300 && answer.status < 400 && init?.redirect !== 'manual'
      ? new Response(FOLLOWED_BODY, { status: 200, headers: { 'content-type': 'text/html' } })
      : answer
  return {
    kept,
    fetch: vi.fn(
      async (request: Request, init?: { cf?: { cacheKey?: string }; redirect?: string }) => {
        const key = init?.cf?.cacheKey
        if (!key) throw new Error('every call into the store must carry its key')
        const hit = kept.get(key)
        if (hit) {
          return new Response(hit.text, {
            status: hit.status,
            headers: [...hit.headers, ['cf-cache-status', 'HIT']],
          })
        }
        const answer = await keepApiAnswer(request, draw)
        if (answer.headers.get('x-run-kept') === 'yes') {
          const copy = answer.clone()
          kept.set(key, {
            text: await copy.text(),
            status: copy.status,
            headers: [...copy.headers.entries()],
          })
        }
        return follow(answer, init)
      },
    ),
    /** The one copy kept so far: what a later visitor would be served. */
    only: () => {
      const [copy, ...more] = [...kept.values()]
      if (!copy || more.length > 0) throw new Error(`expected one kept copy, found ${kept.size}`)
      return copy
    },
  }
}

const setup = (draw = payloadLike()) => {
  let version = 'v1'
  let mode: string | null = null
  const env = {
    CF_VERSION_METADATA: { id: 'deploy-1' },
    SITE_CACHE: { get: vi.fn(async (key: string) => (key === STORE_MODE_KEY ? mode : version)) },
    VIEWER_ALLOWED_ORIGINS: ALLOWED,
  }
  const ctx = { waitUntil: () => {} }
  const drawSpy = vi.fn(draw)
  const store = fakeStore(drawSpy)
  const ask = (path = '/rxps/wine', init: RequestInit = {}) =>
    serveViewerApi(new Request(`${API}${path}`, init), env, ctx, store)
  return {
    env,
    store,
    draw: drawSpy,
    ask,
    save: (next: string) => {
      version = next
    },
    /** The off switch (pageCache.mjs STORE_MODE_KEY): 'versioned' is the key before 2026-10-25. */
    switchTo: (next: string | null) => {
      mode = next
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

  it('leaves every other request to the Worker untouched: no store call, no draw', async () => {
    const { ask, draw, store } = setup()
    for (const path of ['/rxps/wine?x=1', '/rxps/wine/extra']) {
      expect(await ask(path)).toBeNull()
    }
    expect(await serveViewerApi(new Request(`https://${API_HOST}/admin`), {}, {}, store)).toBeNull()
    expect(draw).not.toHaveBeenCalled()
    expect(store.fetch).not.toHaveBeenCalled()
  })

  it('answers as before (null) without the deploy id, the KV binding, the store, or a reachable one', async () => {
    const { env, draw, store } = setup()
    const request = () => new Request(`${API}/rxps/wine`)
    expect(
      await serveViewerApi(request(), { ...env, CF_VERSION_METADATA: undefined }, {}, store),
    ).toBeNull()
    expect(await serveViewerApi(request(), { ...env, SITE_CACHE: undefined }, {}, store)).toBeNull()
    // `next start` and a local preview without ctx.exports have no store at all.
    expect(await serveViewerApi(request(), env, {})).toBeNull()
    const broken = { ...env, SITE_CACHE: { get: vi.fn().mockRejectedValue(new Error('KV down')) } }
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    expect(await serveViewerApi(request(), broken, {}, store)).toBeNull()
    const unreachable = { fetch: vi.fn().mockRejectedValue(new Error('loopback failed')) }
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    expect(await serveViewerApi(request(), env, {}, unreachable)).toBeNull()
    expect(draw).not.toHaveBeenCalled()
  })
})

describe('the store key', () => {
  it('is the shared key: the API host, the deploy and the address, not the content version', async () => {
    const { ask, store } = setup()
    await ask()
    const [, init] = store.fetch.mock.calls[0] as [Request, { cf: { cacheKey: string } }]
    expect(init.cf.cacheKey).toBe(sharedCacheKey(`${API}/rxps/wine`, 'deploy-1', 'live'))
    expect(init.cf.cacheKey).toContain(API_HOST)
  })

  it('switched to "versioned", names the content version again', async () => {
    const { ask, store, switchTo } = setup()
    switchTo('versioned')
    await ask()
    const [, init] = store.fetch.mock.calls[0] as [Request, { cf: { cacheKey: string } }]
    expect(init.cf.cacheKey).toBe(sharedCacheKey(`${API}/rxps/wine`, 'deploy-1', 'v1'))
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

  it('a CMS save no longer changes the key: the kept copy answers, and the save marks it stale', async () => {
    const { ask, draw, save } = setup()
    await ask()
    save('v2')
    expect((await ask())?.headers.get('server-timing')).toContain('hit')
    expect(draw).toHaveBeenCalledTimes(1)
  })

  // NEGATIVE CONTROL: with the switch off, a save is a new key and the next request draws again.
  it('switched to "versioned", a CMS save makes the next request draw again, as before', async () => {
    const { ask, draw, save, switchTo } = setup()
    switchTo('versioned')
    await ask()
    await ask()
    expect(draw).toHaveBeenCalledTimes(1)
    save('v2')
    expect((await ask())?.headers.get('server-timing')).toContain('miss')
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('serves the answer’s own Cache-Control and headers, and none of the cache’s bookkeeping', async () => {
    const { ask, store } = setup()
    await ask()
    const kept = store.only()
    const keptHeaders = new Headers(kept.headers)
    expect(keptHeaders.get('cache-control')).toBe(KEPT_CACHE_CONTROL)
    expect(keptHeaders.get('cache-tag')).toBe('garment-data')
    const hit = await ask()
    expect(hit?.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300',
    )
    expect(hit?.headers.get('x-robots-tag')).toBe('noindex')
    expect(hit?.headers.get('strict-transport-security')).toContain('max-age=63072000')
    expect(hit?.headers.get('content-type')).toBe('application/json')
    expect(hit?.headers.get('vary')).toBe(PUBLIC_VIEWER_VARY)
    for (const name of ['x-run-browser-cache-control', 'x-run-kept', 'x-run-drawn-at']) {
      expect(hit?.headers.has(name), name).toBe(false)
    }
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
    const { ask, draw, store } = setup()
    const first = await ask('/rxps/wine', from('https://wear-run.com'))
    expect(first?.headers.get('access-control-allow-origin')).toBe('https://wear-run.com')
    expect(first?.headers.get('access-control-allow-credentials')).toBe('true')

    // The kept copy carries no grant at all.
    const kept = store.only()
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
    const { ask, draw, store } = setup(make())
    const first = await ask()
    expect(first?.headers.get('server-timing')).toBe('api-cache;desc="skip"')
    await ask()
    expect(store.kept.size).toBe(0)
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('never keeps an answer drawn without its "More from" list (a spoiled render)', async () => {
    const { ask, store } = setup(async (request) => {
      keptRenders().getStore().spoiled = true
      return payloadLike()(request)
    })
    expect((await ask())?.status).toBe(200)
    expect(store.kept.size).toBe(0)
  })

  it('a refused answer still reaches the browser with its own cache rule', async () => {
    const { ask } = setup(payloadLike({ error: 'not_found', message: 'x' }, 404))
    const res = await ask()
    expect(res?.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300',
    )
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

describe('a redirect from the store reaches the browser as a redirect (live, 2026-10-25)', () => {
  it('passes a 308 through instead of following it to its target', async () => {
    const redirect = async () =>
      new Response(null, { status: 308, headers: { location: `${API}/rxps/navy` } })
    const { ask } = setup(redirect)
    const res = await ask()
    expect(res?.status).toBe(308)
    expect(res?.headers.get('location')).toBe(`${API}/rxps/navy`)
    expect(await res?.text()).not.toContain(FOLLOWED_BODY)
  })

  it('asks the store not to follow redirects', async () => {
    const { ask, store } = setup()
    await ask()
    expect(store.fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
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

// Faster-taps plan, Task 5: a website page may not call cms.wear-run.help (its connect-src does not
// list it), so a card touch asks the site's own address and the Worker asks the store.
describe('warmGarmentTarget: the same-origin address that warms one garment’s data', () => {
  const warm = (address: string) => warmGarmentTarget(new URL(address))?.href ?? null

  it('maps a garment to its data address on the admin host', () => {
    expect(warm('https://wear-run.com/__warm/garment/r-asb/petrol')).toBe(
      `https://${API_HOST}/api/public/viewer/r-asb/petrol`,
    )
  })

  it.each([
    ['a product without a colour', 'https://wear-run.com/__warm/garment/a'],
    ['a deeper path', 'https://wear-run.com/__warm/garment/a/b/c'],
    ['a query', 'https://wear-run.com/__warm/garment/a/b?x=1'],
    ['the admin host', `https://${API_HOST}/__warm/garment/a/b`],
    ['another warm path', 'https://wear-run.com/__warm/other/a/b'],
  ])('refuses %s', (_name, address) => {
    expect(warm(address)).toBeNull()
  })
})

describe('answerWarmRequest: what the Worker does with a warm request', () => {
  const fakeCtx = () => {
    const waited: Promise<unknown>[] = []
    return { ctx: { waitUntil: (p: Promise<unknown>) => waited.push(p) }, waited }
  }

  it('answers 204 at once and asks the store for the garment’s data in the background', async () => {
    const asked: string[] = []
    const serve = async (request: Request) => {
      asked.push(request.url)
      return new Response('{"product":{}}')
    }
    const { ctx, waited } = fakeCtx()
    const answer = await answerWarmRequest(
      new Request('https://wear-run.com/__warm/garment/r-asb/petrol'),
      {},
      ctx,
      serve,
    )
    expect(answer?.status).toBe(204)
    expect(answer?.headers.get('cache-control')).toBe('no-store')
    await Promise.all(waited)
    expect(asked).toEqual([`https://${API_HOST}/api/public/viewer/r-asb/petrol`])
  })

  it('leaves every other request alone, and a warm address asked with anything but GET', async () => {
    const serve = async () => new Response('')
    const { ctx } = fakeCtx()
    expect(
      await answerWarmRequest(new Request('https://wear-run.com/products'), {}, ctx, serve),
    ).toBeNull()
    expect(
      await answerWarmRequest(
        new Request('https://wear-run.com/__warm/garment/a/b', { method: 'POST' }),
        {},
        ctx,
        serve,
      ),
    ).toBeNull()
  })
})
