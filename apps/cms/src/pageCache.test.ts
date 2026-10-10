import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HTML_LIMITED_BOTS } from '../htmlLimitedBots.mjs'
import {
  CONTENT_VERSION_KEY,
  drawingToKeep,
  KEPT_RENDER_HEADERS,
  keepablePage,
  keepablePageRequest,
  keptHeaders,
  keptRenderRequest,
  keptRenders,
  PAGE_CACHE_SECONDS,
  pageCacheKey,
  pageCacheTiming,
  SITE_HOST,
  servedHeaders,
  spoilKeptRender,
  VERSION_CACHE_SECONDS,
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
  }

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
