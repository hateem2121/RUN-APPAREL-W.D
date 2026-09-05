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
