import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HTML_LIMITED_BOTS } from '../htmlLimitedBots.mjs'
import {
  BROWSER_CACHE_CONTROL,
  CONTENT_VERSION_KEY,
  drawingToKeep,
  KEPT_FILES,
  KEPT_RENDER_HEADERS,
  keepableFile,
  keepablePage,
  keepablePageRequest,
  keptFileRequest,
  keptHeaders,
  keptRenderRequest,
  keptRenders,
  PAGE_CACHE_SECONDS,
  pageCacheKey,
  pageCacheTiming,
  SITE_HOST,
  servedHeaders,
  sharedCacheKey,
  spoilKeptRender,
  storeState,
  unkeptHeaders,
  VERSION_CACHE_SECONDS,
  wholeFile,
  wholePage,
} from '../pageCache.mjs'
import { PUBLIC_PAGE_CSP } from '../publicViewerHeaders.mjs'
import { hostPattern, siteRedirects } from '../siteHostRules.mjs'
import { Media } from './collections/Media'
import { Products } from './collections/Products'
import { SiteSettings } from './globals/SiteSettings'
import {
  keptPagesAfterChange,
  keptPagesAfterDelete,
  keptPagesAfterGlobalChange,
} from './lib/contentVersion'

/**
 * The stored page cache (polish audit X15, 2026-10-04). pageCache.mjs decides; worker.mjs
 * applies. The decisions below are each a way to serve one visitor something that was not
 * meant for them, or to serve everyone a stale or broken page for a day.
 */

const page = (path: string, init: RequestInit = {}) =>
  new Request(`https://${SITE_HOST}${path}`, init)
// The admin's policy (as in cspNonce.test.ts): never the public pages' one.
const ADMIN_CSP = "frame-ancestors 'none'"

describe('which requests may be answered from a kept copy', () => {
  it.each(['/', '/products', '/contact', '/privacy', '/guides/garment-printing-methods'])(
    'keeps %s',
    (path) => {
      expect(keepablePageRequest(page(path))).toBe(true)
    },
  )

  it.each<[string, Request]>([
    ['a form post', page('/contact', { method: 'POST', body: 'x' })],
    ['a HEAD request', page('/', { method: 'HEAD' })],
    ['another host (the admin)', new Request('https://cms.wear-run.help/')],
    ['the old host', new Request('https://wear-run.help/')],
    ['a family filter', page('/products?family=teamwear')],
    ['a client navigation', page('/products?_rsc=abc')],
    ['an advert link', page('/?utm_source=linkedin')],
    ['an RSC request', page('/products', { headers: { rsc: '1' } })],
    ['a prefetch', page('/products', { headers: { 'next-router-prefetch': '1' } })],
    ['a router state', page('/products', { headers: { 'next-router-state-tree': '[]' } })],
    ['a server action', page('/contact', { headers: { 'next-action': 'x' } })],
    ['a byte range', page('/', { headers: { range: 'bytes=0-99' } })],
    ['a signed-in editor', page('/', { headers: { cookie: 'a=1; payload-token=x' } })],
    ['a draft preview', page('/', { headers: { cookie: '__prerender_bypass=x' } })],
    ['the admin', page('/admin')],
    ['the API', page('/api/public/viewer/rxps/wine')],
    ['a build file', page('/_next/static/chunks/a.js')],
    ['the film', page('/film/products.mp4')],
    ['security.txt', page('/.well-known/security.txt')],
    ['an image transform', page('/cdn-cgi/image/width=400/x.webp')],
  ])('never %s', (_label, request) => {
    expect(keepablePageRequest(request)).toBe(false)
  })

  it('reads a cookie that merely CONTAINS the name as no login', () => {
    expect(keepablePageRequest(page('/', { headers: { cookie: 'my-payload-token=x' } }))).toBe(true)
  })
})

describe('the request a kept page is drawn from', () => {
  // Headers from the 2026-10-04 probe (pageCache.mjs): each is a way a visitor could try to
  // make the copy everyone gets differ from the page a plain visit draws.
  const crafted = page('/products', {
    headers: {
      accept: 'text/x-component',
      'accept-language': 'de-DE',
      'user-agent': 'Mozilla/5.0 (crafted)',
      cookie: 'consent=granted',
      'x-matched-path': '/privacy',
      'x-middleware-prefetch': '1',
      'x-forwarded-host': 'evil.example',
      'next-url': '/privacy',
    },
  })

  it('keeps the address and asks for the page', () => {
    const clean = keptRenderRequest(crafted)
    expect(clean.url).toBe(`https://${SITE_HOST}/products`)
    expect(clean.method).toBe('GET')
  })

  it('carries none of the visitor’s headers, only the fixed ones', () => {
    expect(Object.fromEntries(keptRenderRequest(crafted).headers)).toEqual(KEPT_RENDER_HEADERS)
  })

  it('is the same request for a crafted visit as for a plain one', () => {
    const plain = keptRenderRequest(page('/products'))
    expect(Object.fromEntries(plain.headers)).toEqual(
      Object.fromEntries(keptRenderRequest(crafted).headers),
    )
  })

  it('its fixed user agent gets the crawler page shape, as every visitor does', () => {
    expect(new RegExp(HTML_LIMITED_BOTS).test(KEPT_RENDER_HEADERS['user-agent'])).toBe(true)
  })

  /*
   * ⚠️ THE SITE'S FORWARDS ARE TESTED AGAINST THE HOST HEADER, and a Request made in code has
   * none. Live after #154 (2026-10-10): plain https://wear-run.com/factory answered 404 while
   * /factory?x=1, /factory/ and the same address with a Range header forwarded — every one of
   * those skips this clean request. OpenNext builds its headers from the request's headers only
   * (@opennextjs/aws 4.1.4, dist/overrides/converters/edge.js) and tests a `has: host` rule as
   * `new RegExp(value).test(headers.host)` (dist/core/routing/matcher.js), so with no host the
   * forward never matched and the page fell through to the 404. This is that test.
   */
  const openNextHostMatch = (value: string, headers: Record<string, string>) =>
    headers.host !== '' && new RegExp(value).test(headers.host as string)
  const siteHostForwards = siteRedirects().filter((rule) =>
    rule.has?.some((h) => h.type === 'host' && h.value === hostPattern(SITE_HOST)),
  )

  it('carries the host every one of the site’s forwards is tested against', () => {
    expect(siteHostForwards.map((rule) => rule.source)).toContain('/factory')
    const headers = Object.fromEntries(keptRenderRequest(crafted).headers)
    for (const rule of siteHostForwards) {
      expect(openNextHostMatch(rule.has?.[0]?.value ?? '', headers), rule.source).toBe(true)
    }
  })

  // NEGATIVE CONTROL: the clean request as it was before the fix — no host — matches none.
  it('sees the fault: without a host, no forward on the site matches', () => {
    const before = Object.fromEntries(
      new Request(`https://${SITE_HOST}/factory`, {
        headers: { accept: 'text/html', 'user-agent': 'RUN APPAREL page cache' },
      }).headers,
    )
    for (const rule of siteHostForwards) {
      expect(openNextHostMatch(rule.has?.[0]?.value ?? '', before), rule.source).toBe(false)
    }
  })
})

describe('the key', () => {
  const url = `https://${SITE_HOST}/products`

  it('names the page, the deploy and the content version', () => {
    expect(pageCacheKey(url, 'deploy-1', 'content-1')).toBe(
      `https://${SITE_HOST}/__page-cache/deploy-1/content-1/products`,
    )
  })

  it('changes with a deploy, so a page asking for renamed script files is never served', () => {
    expect(pageCacheKey(url, 'deploy-2', 'content-1')).not.toBe(
      pageCacheKey(url, 'deploy-1', 'content-1'),
    )
  })

  it('changes with a save, so a page with yesterday’s products is never served', () => {
    expect(pageCacheKey(url, 'deploy-1', 'content-2')).not.toBe(
      pageCacheKey(url, 'deploy-1', 'content-1'),
    )
  })

  it('ignores the query, which keepablePageRequest refuses anyway', () => {
    expect(pageCacheKey(`${url}?x=1`, 'd', 'c')).toBe(pageCacheKey(url, 'd', 'c'))
  })

  it('cannot be steered by a version holding a slash', () => {
    expect(pageCacheKey(url, 'a/b', 'c')).toContain('/__page-cache/a%2Fb/c/products')
  })
})

describe('the shared store’s key (Workers Cache, 2026-10-24)', () => {
  const url = `https://${SITE_HOST}/products`

  it('names the host, the deploy, the content version and the page', () => {
    expect(sharedCacheKey(url, 'deploy-1', 'content-1')).toBe(
      `/__kept/${SITE_HOST}/deploy-1/content-1/products`,
    )
  })

  // Workers Cache leaves the host out of its own key, and this Worker answers on five.
  it('sees the fault: the same path on two hosts never shares a copy', () => {
    expect(sharedCacheKey('https://cms.wear-run.help/robots.txt', 'd', 'c')).not.toBe(
      sharedCacheKey(`https://${SITE_HOST}/robots.txt`, 'd', 'c'),
    )
  })

  it('changes with a deploy and with a save', () => {
    expect(sharedCacheKey(url, 'd2', 'c1')).not.toBe(sharedCacheKey(url, 'd1', 'c1'))
    expect(sharedCacheKey(url, 'd1', 'c2')).not.toBe(sharedCacheKey(url, 'd1', 'c1'))
  })

  it('cannot be steered by a version holding a slash, and ignores the query', () => {
    expect(sharedCacheKey(url, 'a/b', 'c')).toBe(`/__kept/${SITE_HOST}/a%2Fb/c/products`)
    expect(sharedCacheKey(`${url}?x=1`, 'd', 'c')).toBe(sharedCacheKey(url, 'd', 'c'))
  })

  it('a kept page is drawn from the clean request, carrying the key for the store', () => {
    const drawn = keptRenderRequest(page('/products'), { cacheKey: 'k' }) as Request & {
      cf?: { cacheKey?: string }
    }
    expect([...drawn.headers.entries()]).toEqual(Object.entries(KEPT_RENDER_HEADERS).sort())
    expect(drawn.cf?.cacheKey ?? 'k').toBe('k')
  })
})

describe('the three generated files', () => {
  it('keeps exactly the sitemap, llms.txt and robots.txt', () => {
    expect([...KEPT_FILES].sort()).toEqual(['/llms.txt', '/robots.txt', '/sitemap.xml'])
    for (const path of KEPT_FILES) expect(keptFileRequest(page(path)), path).toBe(true)
  })

  // The AI catalogue address is a deliberate 404 (apps/viewer/worker/notFound.ts).
  it.each<[string, Request]>([
    ['the AI catalogue 404', page('/.well-known/ai-catalog.json')],
    ['a page', page('/products')],
    ['the admin host', new Request('https://cms.wear-run.help/robots.txt')],
    ['a query', page('/sitemap.xml?x=1')],
    ['a HEAD', page('/sitemap.xml', { method: 'HEAD' })],
    ['a signed-in editor', page('/robots.txt', { headers: { cookie: 'payload-token=x' } })],
  ])('never %s', (_label, request) => {
    expect(keptFileRequest(request)).toBe(false)
  })

  const sitemap =
    '<?xml version="1.0"?><urlset><url><loc>https://wear-run.com/</loc></url></urlset>\n'
  it('keeps only a file that arrived whole', () => {
    expect(wholeFile('/sitemap.xml', sitemap)).toBe(true)
    expect(wholeFile('/sitemap.xml', sitemap.slice(0, 60))).toBe(false)
    expect(wholeFile('/sitemap.xml', '<urlset></urlset>')).toBe(false)
    expect(wholeFile('/llms.txt', '# RUN APPAREL\n\n> A private label maker')).toBe(true)
    expect(wholeFile('/llms.txt', '')).toBe(false)
    expect(wholeFile('/robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://x/s.xml\n')).toBe(
      true,
    )
    expect(wholeFile('/robots.txt', 'User-agent: *\nAllow: /\n')).toBe(false)
    expect(wholeFile('/products', sitemap)).toBe(false)
  })

  const file = (headers: Record<string, string> = {}, status = 200) =>
    new Response(sitemap, { status, headers: { 'content-type': 'application/xml', ...headers } })
  it('keeps an ordinary answer and nothing personal or compressed', () => {
    expect(keepableFile(file())).toBe(true)
    expect(keepableFile(file({}, 500))).toBe(false)
    expect(keepableFile(file({ 'set-cookie': 'a=1' }))).toBe(false)
    expect(keepableFile(file({ 'content-encoding': 'gzip' }))).toBe(false)
    expect(keepableFile(file({ 'content-type': 'text/html' }))).toBe(false)
  })
})

describe('which answers may be kept', () => {
  const html = (status = 200, headers: Record<string, string> = {}) =>
    new Response('<html></html>', {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': PUBLIC_PAGE_CSP,
        ...headers,
      },
    })

  it('keeps an ordinary public page', () => {
    expect(keepablePage(html())).toBe(true)
  })

  it.each<[string, Response]>([
    ['a not-found page', html(404)],
    ['an error page', html(500)],
    ['a page that sets a cookie', html(200, { 'set-cookie': 'a=1' })],
    ['a page varying on everything', html(200, { vary: '*' })],
    ['a compressed body (the guard cannot read it)', html(200, { 'content-encoding': 'gzip' })],
    ['the admin', html(200, { 'content-security-policy': ADMIN_CSP })],
    ['JSON', new Response('{}', { headers: { 'content-type': 'application/json' } })],
    ['an empty body', new Response(null, { headers: { 'content-type': 'text/html' } })],
  ])('never %s', (_label, response) => {
    expect(keepablePage(response)).toBe(false)
  })

  it('keeps only a page that arrived whole', () => {
    expect(wholePage('<!DOCTYPE html><html><body></body></html>')).toBe(true)
    expect(wholePage('<html><body></body></html>\n')).toBe(true)
    expect(wholePage('<!DOCTYPE html><html><body><main>half a pa')).toBe(false)
  })
})

describe('the headers', () => {
  it('kept: a lifetime the Cache API obeys, and no cookie or validator', () => {
    const kept = keptHeaders(
      new Headers({
        'content-security-policy': PUBLIC_PAGE_CSP,
        'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate',
        etag: '"x"',
        'last-modified': 'Sat, 04 Oct 2026 00:00:00 GMT',
        'set-cookie': 'a=1',
        'content-length': '10',
      }),
    )
    expect(kept.get('cache-control')).toBe(`public, max-age=${PAGE_CACHE_SECONDS}`)
    for (const name of ['etag', 'last-modified', 'set-cookie', 'content-length']) {
      expect(kept.has(name), name).toBe(false)
    }
    expect(kept.get('content-security-policy')).toBe(PUBLIC_PAGE_CSP)
  })

  it("served: the cache's bookkeeping removed, the page's own headers kept", () => {
    const served = servedHeaders(
      new Headers({
        'content-type': 'text/html',
        'content-security-policy': PUBLIC_PAGE_CSP,
        age: '30',
        expires: 'x',
        'cf-cache-status': 'HIT',
        etag: '"x"',
      }),
    )
    for (const name of ['age', 'expires', 'cf-cache-status', 'etag']) {
      expect(served.has(name), name).toBe(false)
    }
    expect(served.get('content-security-policy')).toBe(PUBLIC_PAGE_CSP)
  })

  it('labels the answer for the network panel', () => {
    expect(pageCacheTiming('hit')).toBe('page-cache;desc="hit"')
  })

  // The store obeys the kept lifetime; the browser must still get the answer's own rule
  // (robots.txt asks for 5 minutes, the sitemap for none).
  it('the answer’s own cache rule travels with the copy and comes back on the way out', () => {
    const own = 'public, max-age=300, stale-while-revalidate=3600'
    const kept = keptHeaders(new Headers({ 'cache-control': own }))
    expect(kept.get(BROWSER_CACHE_CONTROL)).toBe(own)
    const served = servedHeaders(kept)
    expect(served.get('cache-control')).toBe(own)
    expect(served.has(BROWSER_CACHE_CONTROL)).toBe(false)
  })

  it('an answer that must not be kept tells the store so, and still serves its own rule', () => {
    const own = 'private, no-cache, max-age=0, must-revalidate'
    const unkept = unkeptHeaders(new Headers({ 'cache-control': own }))
    expect(unkept.get('cache-control')).toBe('no-store')
    expect(servedHeaders(unkept).get('cache-control')).toBe(own)
  })

  it('an answer with no rule of its own leaves the store without one', () => {
    expect(servedHeaders(keptHeaders(new Headers())).has('cache-control')).toBe(false)
  })

  it.each<[string, Record<string, string>, 'hit' | 'miss' | 'skip']>([
    ['HIT', { 'cf-cache-status': 'HIT' }, 'hit'],
    ['STALE', { 'cf-cache-status': 'STALE' }, 'hit'],
    ['UPDATING', { 'cf-cache-status': 'UPDATING' }, 'hit'],
    ['REVALIDATED', { 'cf-cache-status': 'REVALIDATED' }, 'hit'],
    ['MISS', { 'cf-cache-status': 'MISS' }, 'miss'],
    ['BYPASS', { 'cf-cache-status': 'BYPASS' }, 'miss'],
    ['no status but an age', { age: '12' }, 'hit'],
    ['nothing at all', {}, 'miss'],
    [
      'a copy SitePages refused to keep',
      { 'x-run-kept': 'no', 'cf-cache-status': 'BYPASS' },
      'skip',
    ],
  ])('reads %s as a %s', (_label, headers, state) => {
    expect(storeState(new Headers(headers))).toBe(state)
  })

  it('tells a stored copy from a fresh drawing by its age when Cloudflare says nothing', () => {
    const drawn = keptHeaders(new Headers(), 1_000_000)
    expect(storeState(drawn, 1_000_050)).toBe('miss') // read the moment it arrived
    expect(storeState(drawn, 1_000_000 + 60_000)).toBe('hit') // a minute old: from the store
    expect(servedHeaders(drawn).has('x-run-drawn-at')).toBe(false)
  })

  it('SitePages marks its verdict, and the visitor never sees the mark', () => {
    expect(keptHeaders(new Headers()).get('x-run-kept')).toBe('yes')
    expect(unkeptHeaders(new Headers()).get('x-run-kept')).toBe('no')
    expect(servedHeaders(keptHeaders(new Headers())).has('x-run-kept')).toBe(false)
    expect(servedHeaders(unkeptHeaders(new Headers())).has('x-run-kept')).toBe(false)
  })
})

describe('the signal from worker.mjs to content.ts', () => {
  it('is off outside a render the worker means to keep', () => {
    expect(drawingToKeep()).toBe(false)
    spoilKeptRender() // and spoiling nothing is harmless
  })

  it('is on inside one, across awaits and timers, and records a fallback', async () => {
    const render = { spoiled: false }
    await keptRenders().run(render, async () => {
      expect(drawingToKeep()).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 1))
      expect(drawingToKeep()).toBe(true)
      spoilKeptRender()
    })
    expect(render.spoiled).toBe(true)
    expect(drawingToKeep()).toBe(false)
  })

  // Next bundles its own copy of pageCache.mjs. Two module-level stores would never meet.
  it('lives on globalThis, so a second copy of the module reaches the same store', () => {
    expect(keptRenders()).toBe((globalThis as { __runKeptRenders?: unknown }).__runKeptRenders)
  })
})

describe('what the cache relies on', () => {
  it('pages do not differ between browsers: every visitor gets the crawler page shape', () => {
    // If HTML_LIMITED_BOTS narrows, Next streams a different <head> to browsers than to
    // crawlers, and a copy kept from one would be served to the other.
    expect(HTML_LIMITED_BOTS).toBe('.*')
  })

  const wrangler = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ''),
  ) as {
    kv_namespaces?: { binding: string; id: string }[]
    version_metadata?: { binding: string }
    cache?: { enabled?: boolean; cross_version_cache?: boolean }
    exports?: Record<string, { type?: string; cache?: { enabled?: boolean } }>
  }

  // ⚠️ The default entrypoint serves the admin and the API too. Caching it would hand one
  // visitor's stamped page (and its nonce) to the next.
  it('caches only the SitePages entrypoint, never the default one', () => {
    expect(wrangler.cache?.enabled).toBe(false)
    expect(wrangler.exports?.default).toEqual({ type: 'worker', cache: { enabled: false } })
    expect(wrangler.exports?.SitePages).toEqual({ type: 'worker', cache: { enabled: true } })
  })

  // A page drawn by the last deploy names script files the new deploy no longer has.
  it('never serves one deploy’s copies to another', () => {
    expect(wrangler.cache?.cross_version_cache ?? false).toBe(false)
  })

  const worker = readFileSync(join(import.meta.dirname, '..', 'worker.mjs'), 'utf8')
  it('worker.mjs exports the cached entrypoint and no longer keeps pages in the per-data-centre cache', () => {
    expect(worker).toMatch(/export class SitePages extends WorkerEntrypoint/)
    expect(worker).not.toMatch(/caches\.default/)
  })

  /*
   * Live on 2026-10-25 (#247): /factory answered 200 with the factory page instead of its 308. The
   * call into the store has Fetch semantics, and its default redirect mode FOLLOWS a 3xx, out over
   * the internet (Cloudflare, Workers RPC "Reserved methods"). worker.mjs imports the Workers
   * runtime, so this reads its source, the way the test above does: every call into the store says
   * `redirect: 'manual'`, so the redirect reaches withRedirectHeaders and then the browser.
   */
  it('worker.mjs asks the store never to follow a redirect', () => {
    const calls = [...worker.matchAll(/store\.fetch\(([^)]*\([^)]*\)[^)]*)\)/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call).toMatch(/redirect:\s*'manual'/)
  })

  it('binds the KV namespace holding the content version, by a real id', () => {
    const kv = wrangler.kv_namespaces?.find((namespace) => namespace.binding === 'SITE_CACHE')
    expect(kv?.id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('binds the deploy version, without which nothing is kept', () => {
    expect(wrangler.version_metadata?.binding).toBe('CF_VERSION_METADATA')
  })

  it('reads the version through KV’s shortest cache, so a save reaches pages in about a minute', () => {
    expect(VERSION_CACHE_SECONDS).toBe(30)
    expect(CONTENT_VERSION_KEY).toBe('content-version')
  })

  it('every save of what the website shows records a change', () => {
    expect(Products.hooks?.afterChange).toContain(keptPagesAfterChange)
    expect(Products.hooks?.afterDelete).toContain(keptPagesAfterDelete)
    expect(Media.hooks?.afterChange).toContain(keptPagesAfterChange)
    expect(Media.hooks?.afterDelete).toContain(keptPagesAfterDelete)
    expect(SiteSettings.hooks?.afterChange).toContain(keptPagesAfterGlobalChange)
  })
})
