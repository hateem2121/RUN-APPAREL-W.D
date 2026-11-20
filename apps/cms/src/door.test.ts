import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import door, { alwaysHandedOn, DOOR_BUILD_KEY, liveBuild } from '../door.mjs'
import { forgetKvMemo, keptHeaders, PER_DEPLOY, STORE_BUILD_KEY } from '../pageCache.mjs'

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
 * `ORIGIN` stands in for the site's Worker behind the route (door.mjs handOn): a call to it is
 * the site's Worker starting, which is exactly what each test counts.
 */
const BUILD = 'site-0123456789abcdef0123.0123456789ab'

const kvOf = (values: Record<string, string | null>) => ({
  get: vi.fn(async (key: string) => values[key] ?? null),
})

const answering = (body: string, headers: HeadersInit = {}) =>
  vi.fn(async (_request: Request, _init?: unknown) => new Response(body, { headers }))

function world(options: { build?: string | null; keying?: string | null } = {}) {
  const origin = { fetch: answering('from the site Worker') }
  const viewer = { fetch: answering('from the viewer Worker') }
  // Drawn a minute ago: the store tells a kept copy from a fresh drawing by its age (storeState).
  const kept = keptHeaders(
    new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
    Date.now() - 60_000,
  )
  const pages = { fetch: answering('from the store', kept) }
  const env = {
    ORIGIN: origin,
    VIEWER: viewer,
    SITE_PAGES: pages,
    SITE_CACHE: kvOf({
      [DOOR_BUILD_KEY]: options.build === undefined ? BUILD : options.build,
      [STORE_BUILD_KEY]: options.keying ?? null,
      'content-version': '7',
    }),
    CF_VERSION_METADATA: { id: 'door-version' },
    STORE_HEDGE: 'on',
    PAGE_COPY: 'off',
  }
  const ctx = { waitUntil: vi.fn() }
  return { env, ctx, origin, viewer, pages }
}

const get = (url: string, headers: HeadersInit = {}) => new Request(url, { headers })

beforeEach(() => forgetKvMemo())

describe('what the door hands straight on', () => {
  it.each([
    'https://wear-run.com/_next/static/chunks/a.js',
    'https://wear-run.com/api/health',
    'https://wear-run.com/admin',
    'https://wear-run.com/film/tie-dye.mp4',
    'https://wear-run.com/__worker/version',
  ])('%s never reaches the store, and costs no KV read', async (url) => {
    const w = world()
    expect(alwaysHandedOn(new URL(url))).toBe(true)
    const response = await door.fetch(get(url), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
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
  ])('%s goes to the viewer Worker, and the site Worker is never asked', async (url) => {
    const w = world()
    const response = await door.fetch(get(url), w.env, w.ctx)
    expect(await response.text()).toBe('from the viewer Worker')
    expect(w.origin.fetch).not.toHaveBeenCalled()
  })

  it('still go there with the door switched off (no build name in KV)', async () => {
    const w = world({ build: null })
    const response = await door.fetch(get('https://wear-run.com/products/rxps/wine'), w.env, w.ctx)
    expect(await response.text()).toBe('from the viewer Worker')
  })

  it('the website list page /products is not a garment page', async () => {
    const w = world({ build: null })
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
    expect(w.origin.fetch).not.toHaveBeenCalled()
    // The key names the build KV gave, never this Worker's own version id.
    const init = w.pages.fetch.mock.calls[0]?.[1] as { cf: { cacheKey: string } }
    expect(init.cf.cacheKey).toContain(BUILD)
    expect(init.cf.cacheKey).not.toContain('door-version')
  })

  it('the garment data comes from the store, with this request’s CORS grant', async () => {
    const w = world()
    w.pages.fetch.mockImplementation(
      async () =>
        new Response('{"product":{"slug":"rxps"}}', {
          headers: keptHeaders(
            new Headers({ 'content-type': 'application/json' }),
            Date.now() - 60_000,
          ),
        }),
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
    expect(w.origin.fetch).not.toHaveBeenCalled()
  })
})

describe('when the door must step aside', () => {
  it('no build name in KV: every page is handed on (the off switch, and every deploy)', async () => {
    const w = world({ build: null })
    expect(await liveBuild(w.env)).toBeNull()
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
  })

  it('a value that is not a build’s name is no name', async () => {
    expect(await liveBuild(world({ build: 'off' }).env)).toBeNull()
    forgetKvMemo()
    expect(await liveBuild(world({ build: BUILD }).env)).toBe(BUILD)
  })

  it('keys named per deploy would name THIS Worker’s version: handed on', async () => {
    const w = world({ keying: PER_DEPLOY })
    const response = await door.fetch(get('https://wear-run.com/guides'), w.env, w.ctx)
    expect(await response.text()).toBe('from the site Worker')
    expect(w.pages.fetch).not.toHaveBeenCalled()
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
