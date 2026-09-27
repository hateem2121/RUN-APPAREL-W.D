import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { viewerApiPath } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { FALLBACK_API_ORIGIN } from '../scripts/csp.mjs'
import { apiPreloadLink, CMS_API_ORIGIN, withApiPreload } from './apiPreload'

/**
 * The API preload the Worker adds to a garment page (2026-09-27).
 *
 * What would have to break in production for these to fail: the preload naming a URL the
 * app does not fetch (the phone then downloads the payload twice), losing `crossorigin`
 * (measured: two requests in Chromium), or the Worker dropping the CSP that `_headers`
 * put on the page. Whether an ENGINE reuses a matching preload is a browser question and
 * is answered on all four engines by `e2e/apiPreload.spec.ts`, not here.
 */
const page = (init: ResponseInit = {}) =>
  new Response('<!doctype html><p>hi', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'",
    },
    ...init,
  })

const linkUrl = (link: string) => /^<([^>]+)>/.exec(link)?.[1]

describe('apiPreloadLink', () => {
  it('names exactly the URL the app fetches, with and without a colour', () => {
    for (const route of [
      { productSlug: 'rxps', colourSlug: 'wine' },
      { productSlug: 'rxps', colourSlug: null },
    ]) {
      expect(linkUrl(apiPreloadLink(route))).toBe(
        `${FALLBACK_API_ORIGIN}${viewerApiPath(route.productSlug, route.colourSlug)}`,
      )
    }
    expect(linkUrl(apiPreloadLink({ productSlug: 'rxps', colourSlug: null }))).toBe(
      'https://cms.wear-run.help/api/public/viewer/rxps',
    )
  })

  it('is a CORS fetch preload — without crossorigin the phone downloads it twice', () => {
    const link = apiPreloadLink({ productSlug: 'rxps', colourSlug: 'wine' })
    expect(link).toContain('rel=preload')
    expect(link).toContain('as=fetch')
    expect(link).toContain('crossorigin=anonymous')
  })

  it('points at the same API origin as the app, the CSP and the preconnect', () => {
    expect(CMS_API_ORIGIN).toBe(FALLBACK_API_ORIGIN)
    const api = readFileSync(join(import.meta.dirname, '..', 'src/lib/api.ts'), 'utf8')
    expect(api).toContain(`?? '${CMS_API_ORIGIN}'`)
    const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')
    expect(html).toContain(`<link rel="preconnect" href="${CMS_API_ORIGIN}" crossorigin />`)
  })
})

describe('withApiPreload', () => {
  const route = { productSlug: 'rxps', colourSlug: 'wine' }

  it('adds the preload to a garment page and keeps the headers _headers set', () => {
    const out = withApiPreload(page(), route)
    expect(out.headers.get('link')).toBe(apiPreloadLink(route))
    expect(out.headers.get('content-security-policy')).toBe("default-src 'self'")
  })

  it('appends to a Link header that is already there rather than replacing it', () => {
    const existing = '</assets/app.js>; rel=modulepreload'
    const out = withApiPreload(
      page({
        headers: { 'content-type': 'text/html', link: existing },
      }),
      route,
    )
    expect(out.headers.get('link')).toBe(`${existing}, ${apiPreloadLink(route)}`)
  })

  it('leaves a non-200 and a non-HTML response untouched', () => {
    const notModified = new Response(null, {
      status: 304,
      headers: { 'content-type': 'text/html' },
    })
    expect(withApiPreload(notModified, route)).toBe(notModified)
    const script = new Response('x', { headers: { 'content-type': 'text/javascript' } })
    expect(withApiPreload(script, route)).toBe(script)
  })
})
