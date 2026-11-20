import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseEncoding as viewerChooses } from '../../viewer/worker/compression'
import door, {
  alwaysHandedOn,
  BUILD_MEMO_MS,
  buildFromSite,
  chooseEncoding,
  DOOR_OFF,
  DOOR_SWITCH_KEY,
  forgetBuild,
  liveBuild,
  SITE_BUILD_PATH,
} from '../door.mjs'
import { forgetKvMemo, keptHeaders, PER_DEPLOY, STORE_BUILD_KEY } from '../pageCache.mjs'
import { NO_SITE_BUILD, SITE_BUILD_ASSET } from '../siteBuild.mjs'

/**
 * The front door (door.mjs, 20 Nov 2026): the small Worker Cloudflare runs before the site's own.
 *
 * WHAT PRODUCTION DID. After 5 quiet minutes a kept garment page took 966 ms from a US probe and
 * 1,469 ms from Sydney while its handlers ran for 83 and 58 ms: the wait was the site's 40.8 MiB
 * Worker starting. These tests hold the door to the two things that fix it and the one thing that
 * must never break: a kept answer comes from the store WITHOUT the site's Worker being asked, a
 * garment page goes straight to the viewer Worker, and everything the door is not sure of is
 * handed on untouched.
 *
 * `ORIGIN` stands in for the site behind the route (door.mjs handOn). It answers two things: the
 * build's name from the static files (`/__site-build.txt`, served without starting the site's
 * Worker), and everything else, which IS the site's Worker starting. `drawn()` counts only the
 * second kind, which is what each test is about.
 */
const BUILD = 'site-0123456789abcdef0123.0123456789ab'

const kvOf = (values: Record<string, string | null>) => ({
  get: vi.fn(async (key: string) => values[key] ?? null),
})

const answering = (body: string, headers: HeadersInit = {}) =>
  vi.fn(async (_request: Request, _init?: unknown) => new Response(body, { headers }))

/** A copy the store holds: drawn a minute ago, which is how storeState tells it from a fresh one. */
const kept = (type: string) =>
  keptHeaders(new Headers({ 'content-type': type }), Date.now() - 60_000)

type World = { build?: string | null; keying?: string | null; door?: string | null }

function world(options: World = {}) {
  const buildFile = options.build === undefined ? BUILD : options.build
  const origin = {
    fetch: vi.fn(async (request: Request) => {
      if (new URL(request.url).pathname !== SITE_BUILD_PATH) {
        return new Response('from the site Worker')
      }
      return buildFile === null
        ? new Response('not found', { status: 404 })
        : new Response(`${buildFile}\n`)
    }),
  }
  const viewer = { fetch: answering('from the viewer Worker') }
  const pages = { fetch: answering('from the store', kept('text/plain; charset=utf-8')) }
  const env = {
    ORIGIN: origin,
    VIEWER: viewer,
    SITE_PAGES: pages,
    SITE_CACHE: kvOf({
      [DOOR_SWITCH_KEY]: options.door ?? null,
      [STORE_BUILD_KEY]: options.keying ?? null,
      'content-version': '7',
    }),
    CF_VERSION_METADATA: { id: 'door-version' },
    STORE_HEDGE: 'on',
    PAGE_COPY: 'off',
  }
  const ctx = { waitUntil: vi.fn() }
  const drawn = () =>
    origin.fetch.mock.calls.filter(([asked]) => new URL(asked.url).pathname !== SITE_BUILD_PATH)
  return { env, ctx, origin, viewer, pages, drawn }
}

const get = (url: string, headers: HeadersInit = {}) => new Request(url, { headers })

beforeEach(() => {
  forgetKvMemo()
  forgetBuild()
})

describe('what the door hands straight on', () => {
  it.each([
    'https://wear-run.com/_next/static/chunks/a.js',
    'https://wear-run.com/api/health',
    'https://wear-run.com/admin',
    'https://wear-run.com/film/tie-dye.mp4',
    'https://wear-run.com/__worker/version',
    `https://wear-run.com${SITE_BUILD_PATH}`,
  ])('%s never reaches the store, and costs no other read', async (url) => {
    const w = world()
    expect(alwaysHandedOn(new URL(url))).toBe(true)
    await door.fetch(get(url), w.env, w.ctx)
    expect(w.origin.fetch).toHaveBeenCalledTimes(1)
    expect(new URL(w.origin.fetch.mock.calls[0]?.[0].url ?? '').href).toBe(url)
    expect(w.pages.fetch).not.toHaveBeenCalled()
    expect(w.env.SITE_CACHE.get).not.toHaveBeenCalled()
  })

  it('a website page is not one of them', () => {
    expect(alwaysHandedOn(new URL('https://wear-run.com/guides'))).toBe(false)
    // Only on the site's own address: the admin host's /api is the garment data's home.
    expect(alwaysHandedOn(new URL('https://cms.wear-run.help/api/public/viewer/rxps/wine'))).toBe(
      false,
    )
  })
})

describe('garment pages', () => {
  it.each([
    'https://wear-run.com/products/rxps/wine',
    'https://wear-run.com/ru/products/rxps/wine',
    'https://wear-run.com/assets/index-abc.js',
    'https://wear-run.com/sw.js',
  ])('%s goes to the viewer Worker, and the site is never asked', async (url) => {
    const w = world()
    const response = await door.fetch(get(url), w.env, w.ctx)
    expect(await response.text()).toBe('from the viewer Worker')
    expect(w.origin.fetch).not.toHaveBeenCalled()
  })

  it('still go there with the door switched off', async () => {
    const w = world({ door: DOOR_OFF })
    const response = await door.fetch(get('https://wear-run.com/products/rxps/wine'), w.env, w.ctx)
    expect(await response.text()).toBe('from the viewer Worker')
  })

  it('the website list page /products is not a garment page', async () => {
    const w = world({ door: DOOR_OFF })
    const response = await door.fetch(get('https://wear-run.com/products'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.viewer.fetch).not.toHaveBeenCalled()
  })
})

describe('a kept answer', () => {
  it('a website page comes from the store without the site Worker being asked', async () => {
    const w = world()
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the store')
    expect(response.headers.get('server-timing')).toContain('page-cache;desc="hit"')
    expect(w.pages.fetch).toHaveBeenCalledTimes(1)
    expect(w.drawn()).toHaveLength(0)
    // The key names the build the site's files gave, never this Worker's own version id.
    const init = w.pages.fetch.mock.calls[0]?.[1] as { cf: { cacheKey: string } }
    expect(init.cf.cacheKey).toContain(BUILD)
    expect(init.cf.cacheKey).not.toContain('door-version')
  })

  it('the garment data comes from the store, with this request’s CORS grant', async () => {
    const w = world()
    w.pages.fetch.mockImplementation(
      async () =>
        new Response('{"product":{"slug":"rxps"}}', { headers: kept('application/json') }),
    )
    const response = await door.fetch(
      get('https://cms.wear-run.help/api/public/viewer/rxps/wine', {
        origin: 'https://wear-run.com',
      }),
      { ...w.env, VIEWER_ALLOWED_ORIGINS: 'https://wear-run.com' },
      w.ctx,
    )
    expect(await response.text()).toBe('{"product":{"slug":"rxps"}}')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://wear-run.com')
    expect(response.headers.get('server-timing')).toContain('api-cache;desc="hit"')
    expect(w.drawn()).toHaveLength(0)
  })
})

/**
 * The build's name. A kept page names script files only its own build has, and this Worker is a
 * separate deploy from the site's, so the name is read from the site's static files and never
 * baked in: the file changes at the moment the script files do.
 */
describe('the live website build’s name', () => {
  it('is read from the site’s static files, once per memo window', async () => {
    const w = world()
    const t0 = 1_000_000
    expect(await buildFromSite(w.env, t0)).toBe(BUILD)
    expect(await buildFromSite(w.env, t0 + BUILD_MEMO_MS - 1)).toBe(BUILD)
    expect(w.origin.fetch).toHaveBeenCalledTimes(1)
    const asked = w.origin.fetch.mock.calls[0]?.[0] as Request
    expect(asked.url).toBe(`https://wear-run.com${SITE_BUILD_PATH}`)
  })

  it('follows a deploy: after the window, a new name replaces the old one', async () => {
    const before = world()
    const t0 = 1_000_000
    expect(await buildFromSite(before.env, t0)).toBe(BUILD)
    const next = 'site-fedcba9876543210fedc.ba9876543210'
    const after = world({ build: next })
    expect(await buildFromSite(after.env, t0 + BUILD_MEMO_MS + 1)).toBe(next)
  })

  it('requests that arrive together share one read', async () => {
    const w = world()
    const all = await Promise.all([1, 2, 3].map(() => buildFromSite(w.env, 5)))
    expect(all).toEqual([BUILD, BUILD, BUILD])
    expect(w.origin.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no file yet (a site deploy from before the door)', null],
    ['a build with no fingerprint', NO_SITE_BUILD],
    ['anything that is not a build’s name', '<html>not found</html>'],
  ])('%s is no name: every page is handed on', async (_why, build) => {
    const w = world({ build })
    expect(await liveBuild(w.env)).toBeNull()
    forgetBuild()
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
  })

  it('a read that fails is not remembered: the next request asks again', async () => {
    const w = world()
    w.origin.fetch.mockRejectedValueOnce(new Error('network'))
    expect(await buildFromSite(w.env, 5)).toBeNull()
    expect(await buildFromSite(w.env, 6)).toBe(BUILD)
  })

  it('the door asks for the very file the site’s deploy writes', () => {
    expect(SITE_BUILD_ASSET.endsWith(`/assets${SITE_BUILD_PATH}`)).toBe(true)
  })
})

describe('when the door must step aside', () => {
  it('the off switch (KV `front-door` = `off`): every page is handed on', async () => {
    const w = world({ door: DOOR_OFF })
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
  })

  it('keys named per deploy would name THIS Worker’s version: handed on', async () => {
    const w = world({ keying: PER_DEPLOY })
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
  })

  /*
   * The deploy tests each new version at 0% by header before visitors get it (7 Nov 2026). Through
   * the door, a kept page or the viewer's live version would answer that check, and it would pass
   * without the new version ever running.
   */
  it.each([
    'https://wear-run.com/guides',
    'https://wear-run.com/products/rxps/wine',
    'https://cms.wear-run.help/api/public/viewer/rxps/wine',
  ])('a deploy’s pre-live check for %s reaches the site Worker, header and all', async (url) => {
    const w = world()
    const override = 'run-apparel-viewer-cms="dc8dcd28-271b-4367-9840-6c244f84cb40"'
    const asked = get(url, { 'Cloudflare-Workers-Version-Overrides': override })
    const response = await door.fetch(asked, w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
    expect(w.viewer.fetch).not.toHaveBeenCalled()
    const handedOn = w.origin.fetch.mock.calls[0]?.[0] as Request
    expect(handedOn.headers.get('cloudflare-workers-version-overrides')).toBe(override)
  })

  it('a store that throws never fails the page', async () => {
    const w = world()
    w.pages.fetch.mockRejectedValue(new Error('store down'))
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
  })

  it('a form post is handed on with its body', async () => {
    const w = world()
    const post = new Request('https://wear-run.com/contact/submit', { method: 'POST', body: 'a=1' })
    const response = await door.fetch(post, w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
  })
})

/**
 * wrangler.door.jsonc, read as text and parsed: routes, never Custom Domains (a Custom Domain here
 * would take the address from the site's Worker), and the store's switches equal to the site's.
 */
describe('the door’s configuration', () => {
  const cms = join(import.meta.dirname, '..')
  const strip = (text: string) =>
    text
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
  const doorConfig = JSON.parse(strip(readFileSync(join(cms, 'wrangler.door.jsonc'), 'utf8')))

  it('is reached by routes only', () => {
    expect(doorConfig.routes.length).toBeGreaterThan(0)
    for (const route of doorConfig.routes) {
      expect(route.custom_domain, route.pattern).toBeUndefined()
      expect(route.zone_name, route.pattern).toMatch(/^wear-run\.(com|help)$/)
    }
    expect(doorConfig.workers_dev).toBe(false)
    expect(doorConfig.preview_urls).toBe(false)
  })

  it('never routes the admin, and only the garment data on the admin host', () => {
    const adminHost = doorConfig.routes
      .map((route: { pattern: string }) => route.pattern)
      .filter((pattern: string) => pattern.startsWith('cms.wear-run.help'))
    expect(adminHost).toEqual(['cms.wear-run.help/api/public/viewer/*'])
  })

  it('binds the store’s cached entrypoint and the viewer, and reads the site’s own KV', () => {
    expect(doorConfig.services).toContainEqual({
      binding: 'SITE_PAGES',
      service: 'run-apparel-viewer-cms',
      entrypoint: 'SitePages',
    })
    expect(doorConfig.services).toContainEqual({
      binding: 'VIEWER',
      service: 'run-apparel-viewer-site',
    })
    const site = readFileSync(join(cms, 'wrangler.jsonc'), 'utf8')
    expect(site).toContain(doorConfig.kv_namespaces[0].id)
    for (const name of ['PAGE_COPY', 'STORE_HEDGE', 'VIEWER_ALLOWED_ORIGINS']) {
      expect(site, name).toContain(`"${name}": "${doorConfig.vars[name]}"`)
    }
  })
})

/**
 * A handed-on page goes out in the VISITOR's encoding (door.mjs inVisitorsEncoding, 20 Nov 2026).
 * What production did: the deploy of #435 failed PF-13 on all 42 products, "came back uncompressed
 * to a browser offering only gzip", because the page behind the door was compressed for the door's
 * own list. The first case is that failure: the site answers brotli, the visitor reads only gzip.
 */
describe('a handed-on page, in the visitor’s encoding', () => {
  const override = 'run-apparel-viewer-site="v1"'
  /** A request as Cloudflare delivers it: the visitor's own list kept in `cf`. */
  const fromVisitor = (clientAcceptEncoding: string | undefined) => {
    const request = get('https://wear-run.com/products/rxps/wine', {
      'cloudflare-workers-version-overrides': override,
    })
    Object.defineProperty(request, 'cf', { value: { clientAcceptEncoding } })
    return request
  }
  const siteAnswering = (encoding: string | null) => {
    const w = world()
    w.origin.fetch.mockImplementation(
      async () =>
        new Response('<!doctype html><p>page</p>', {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-length': '26',
            ...(encoding ? { 'content-encoding': encoding } : {}),
          },
        }),
    )
    return w
  }

  it('a visitor offering only gzip gets gzip, not the br the door was sent (the PF-13 failure)', async () => {
    const w = siteAnswering('br')
    const response = await door.fetch(fromVisitor('gzip'), w.env, w.ctx)
    expect(response.headers.get('content-encoding')).toBe('gzip')
    // A length for the brotli bytes would be a lie about the gzip ones.
    expect(response.headers.get('content-length')).toBeNull()
    expect(await response.text()).toBe('<!doctype html><p>page</p>')
  })

  it('a visitor asking for identity gets the page plain', async () => {
    const w = siteAnswering('br')
    const response = await door.fetch(fromVisitor('identity'), w.env, w.ctx)
    expect(response.headers.get('content-encoding')).toBeNull()
  })

  it('a visitor offering br gets the answer untouched, the same object', async () => {
    const w = siteAnswering('br')
    const answered = await (w.origin.fetch as unknown as () => Promise<Response>)()
    w.origin.fetch.mockResolvedValueOnce(answered)
    const response = await door.fetch(fromVisitor('gzip, deflate, br'), w.env, w.ctx)
    expect(response).toBe(answered)
  })

  it('leaves a plain answer, an unknown encoding and a request with no cf as they are', async () => {
    for (const [encoding, list] of [
      [null, 'gzip'],
      ['zstd', 'gzip'],
    ] as const) {
      const w = siteAnswering(encoding)
      const response = await door.fetch(fromVisitor(list), w.env, w.ctx)
      expect(response.headers.get('content-encoding'), String(encoding)).toBe(encoding)
    }
    const w = siteAnswering('br')
    const noCf = get('https://wear-run.com/products/rxps/wine', {
      'cloudflare-workers-version-overrides': override,
    })
    const response = await door.fetch(noCf, w.env, w.ctx)
    expect(response.headers.get('content-encoding')).toBe('br')
  })

  it('a visitor whose list Cloudflare did not keep gets the page plain, as the viewer would', async () => {
    const w = siteAnswering('gzip')
    const response = await door.fetch(fromVisitor(undefined), w.env, w.ctx)
    expect(response.headers.get('content-encoding')).toBeNull()
  })

  it('chooses exactly as the viewer does (compression.ts), on every list measured or likely', () => {
    for (const list of [
      null,
      '',
      'gzip',
      'br',
      'identity',
      '*',
      'zstd',
      'gzip, deflate, br',
      'gzip, deflate, br, zstd',
      'br;q=0, gzip',
      'gzip;q=0',
      '*;q=0, gzip',
      'BR, GZIP',
      'gzip;q=abc',
    ]) {
      expect(chooseEncoding(list), String(list)).toBe(viewerChooses(list))
    }
  })
})
