import { describe, expect, it } from 'vitest'
import { parseViewerPath } from '@run-apparel/shared'
import { shouldReturnNotFound } from './notFound'

/**
 * Every unknown URL on this host answered "200 OK" until 2026-09-04 — measured:
 * `/a/b/c`, `/rxps/nonexistent` and `/manifest.webmanifest` all returned the SPA
 * shell with a success status. To a crawler that is a soft 404.
 *
 * The narrow version was chosen deliberately: a well-formed but non-existent
 * product still returns 200, because deciding otherwise means a CMS lookup on every
 * request and that hop was measured and declined.
 */
const HTML = 'text/html; charset=utf-8'

function decide(pathname: string, contentType: string | null = HTML, method = 'GET') {
  return shouldReturnNotFound({
    pathname,
    method,
    routeParsed: parseViewerPath(pathname) !== null,
    contentType,
  })
}

describe('shouldReturnNotFound', () => {
  it('404s a path that cannot be a product page', () => {
    expect(decide('/a/b/c'), 'three segments is not /product/colour').toBe(true)
    expect(decide('/rxps/!!!'), 'a mangled colour is a broken link').toBe(true)
    expect(decide('//'), 'empty segments cannot name a product').toBe(true)
  })

  it('does NOT 404 a real product route', () => {
    expect(decide('/rxps/wine')).toBe(false)
    expect(decide('/rxps'), 'one segment is a product with no colour named').toBe(false)
    expect(decide('/rxps/wine/'), 'a trailing slash is the same page').toBe(false)
  })

  it('does NOT 404 a well-formed but unknown product — the deliberate limit', () => {
    // Deciding this needs a CMS lookup on every request: measured 0.56-0.72s and
    // explicitly declined. The page still adds its own noindex tag for this case.
    expect(decide('/nope/wine')).toBe(false)
    expect(decide('/rxps/nonexistent')).toBe(false)
  })

  it('never 404s the site root', () => {
    // `/` parses to null like every other non-product path, so without the explicit
    // exclusion this would 404 the homepage.
    expect(decide('/')).toBe(false)
  })

  it('never 404s a real file Static Assets served', () => {
    // Checked by CONTENT TYPE, not a list of known paths — that is what keeps this
    // correct as files are added, the same reasoning the /og/ branch uses.
    expect(decide('/robots.txt', 'text/plain; charset=utf-8')).toBe(false)
    expect(decide('/sitemap.xml', 'application/xml')).toBe(false)
    expect(decide('/og-default.jpg', 'image/jpeg')).toBe(false)
    expect(decide('/env/studio-soft.hdr', null)).toBe(false)
  })

  it('only applies to GET', () => {
    expect(decide('/a/b/c', HTML, 'HEAD')).toBe(false)
    expect(decide('/a/b/c', HTML, 'POST')).toBe(false)
  })

  it('agrees with the app about what a product page is — negative control', () => {
    // If these two ever disagree, the Worker 404s a URL the app renders happily, or
    // waves through one the app calls unavailable. Both are worse than the bug this
    // fixes, so the shared parser is the single definition and this pins it.
    for (const path of ['/rxps/wine', '/rxps', '/RXPS/WINE']) {
      expect(parseViewerPath(path), `${path} must parse`).not.toBeNull()
      expect(decide(path), `${path} must not 404`).toBe(false)
    }
    for (const path of ['/a/b/c', '/rxps/!!!']) {
      expect(parseViewerPath(path), `${path} must not parse`).toBeNull()
      expect(decide(path), `${path} must 404`).toBe(true)
    }
  })
})

describe('a single segment carrying a dot is a missing FILE, not a product', () => {
  /**
   * ⚠️ THE DOCBLOCK ON `shouldReturnNotFound` NAMED `/manifest.webmanifest` AS ONE
   * OF THE THREE CASES THE FIX EXISTS FOR, AND IT WAS NEVER ONE OF THEM. Measured
   * live 2026-09-05, months after that shipped:
   *
   *     GET /manifest.webmanifest -> 200 text/html
   *     GET /favicon.ico          -> 200 text/html
   *
   * `normalizeSlug('manifest.webmanifest')` yields `manifest-webmanifest`, a valid
   * slug, so `parseViewerPath` accepted it and `routeParsed` short-circuited the
   * whole guard. A comment asserting behaviour the code did not have.
   */
  for (const pathname of [
    '/manifest.webmanifest',
    '/favicon.ico',
    '/sw.js',
    '/apple-touch-icon.png',
  ]) {
    it(`404s ${pathname}`, () => {
      expect(
        shouldReturnNotFound({
          pathname,
          method: 'GET',
          // TRUE on purpose — this is the exact state that defeated the old guard.
          routeParsed: true,
          contentType: 'text/html; charset=utf-8',
        }),
      ).toBe(true)
    })
  }

  it('does NOT 404 a real product page, which has no dot (negative control)', () => {
    for (const pathname of ['/rxps/wine', '/rxps', '/r-milo-pro/bottle-green']) {
      expect(
        shouldReturnNotFound({
          pathname,
          method: 'GET',
          routeParsed: true,
          contentType: 'text/html; charset=utf-8',
        }),
        `${pathname} is a live garment URL and must never 404`,
      ).toBe(false)
    }
  })

  it('leaves a real FILE alone — a served asset is not a missing page', () => {
    // robots.txt and sitemap.xml both contain a dot and both exist. They are
    // excluded by CONTENT TYPE, not by path, which is what keeps this correct as
    // files are added — so the dot rule must not overtake that.
    expect(
      shouldReturnNotFound({
        pathname: '/robots.txt',
        method: 'GET',
        routeParsed: true,
        contentType: 'text/plain; charset=utf-8',
      }),
    ).toBe(false)
    expect(
      shouldReturnNotFound({
        pathname: '/sitemap.xml',
        method: 'GET',
        routeParsed: true,
        contentType: 'application/xml',
      }),
    ).toBe(false)
  })

  it('still refuses to 404 the site root or a non-GET', () => {
    expect(
      shouldReturnNotFound({
        pathname: '/',
        method: 'GET',
        routeParsed: false,
        contentType: 'text/html',
      }),
    ).toBe(false)
    expect(
      shouldReturnNotFound({
        pathname: '/favicon.ico',
        method: 'HEAD',
        routeParsed: true,
        contentType: 'text/html',
      }),
    ).toBe(false)
  })
})
