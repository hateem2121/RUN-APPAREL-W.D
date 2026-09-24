import { describe, expect, it } from 'vitest'
import {
  applyCrawlerCacheHeaders,
  carriesNoTransform,
  variesOnUserAgent,
} from './crawlerCacheHeaders'

/**
 * SO-02 / SO-03 — the crawler-rewritten response must vary on User-Agent and refuse
 * Cloudflare's injection, extracted from `index.ts`'s fetch handler so it is testable at
 * all (HTMLRewriter is not available under vitest, which is why this logic used to be
 * provable only by the live smoke probe, `scripts/smoke-viewer-preview.mjs`).
 */
describe('applyCrawlerCacheHeaders', () => {
  it('appends Vary: User-Agent to a response with no Vary header', () => {
    const headers = applyCrawlerCacheHeaders(new Headers({ 'content-type': 'text/html' }))
    expect(headers.get('vary')).toBe('User-Agent')
  })

  it('appends rather than replaces an existing Vary header', () => {
    const headers = applyCrawlerCacheHeaders(new Headers({ vary: 'Accept-Encoding' }))
    // Headers.append joins with ", " per the Fetch spec.
    expect(headers.get('vary')).toBe('Accept-Encoding, User-Agent')
  })

  it('adds no-transform when the response carries no Cache-Control', () => {
    const headers = applyCrawlerCacheHeaders(new Headers())
    expect(headers.get('cache-control')).toBe('no-transform')
  })

  it('appends no-transform to an existing Cache-Control rather than replacing it', () => {
    const headers = applyCrawlerCacheHeaders(
      new Headers({ 'cache-control': 'public, max-age=0, must-revalidate' }),
    )
    expect(headers.get('cache-control')).toBe('public, max-age=0, must-revalidate, no-transform')
  })

  it('is idempotent on Cache-Control — never doubles the directive', () => {
    const headers = applyCrawlerCacheHeaders(
      new Headers({ 'cache-control': 'public, no-transform' }),
    )
    expect(headers.get('cache-control')).toBe('public, no-transform')
    expect(headers.get('cache-control')?.match(/no-transform/g)).toHaveLength(1)
  })
})

describe('carriesNoTransform', () => {
  it('is false for null, empty, and a Cache-Control without the directive', () => {
    expect(carriesNoTransform(null)).toBe(false)
    expect(carriesNoTransform('')).toBe(false)
    expect(carriesNoTransform('public, max-age=0')).toBe(false)
  })

  it('is true wherever the directive appears in the list', () => {
    expect(carriesNoTransform('no-transform')).toBe(true)
    expect(carriesNoTransform('public, no-transform')).toBe(true)
    expect(carriesNoTransform('no-transform, public')).toBe(true)
  })
})

describe('variesOnUserAgent', () => {
  it('is false for null, empty, and a Vary that omits it', () => {
    expect(variesOnUserAgent(null)).toBe(false)
    expect(variesOnUserAgent('')).toBe(false)
    expect(variesOnUserAgent('Accept-Encoding')).toBe(false)
  })

  it('is true wherever User-Agent appears in the comma list, whitespace and all', () => {
    expect(variesOnUserAgent('User-Agent')).toBe(true)
    expect(variesOnUserAgent('Accept-Encoding, User-Agent')).toBe(true)
    expect(variesOnUserAgent('Accept-Encoding,User-Agent')).toBe(true)
  })

  /*
   * ⚠️ NOT A SUBSTRING MATCH. "User-Agent-Hint" or a case-mismatched header value must not
   * satisfy this — a name close enough to look right is exactly the drift this check exists
   * to catch, and a naive `.includes('User-Agent')` on the raw string would pass it.
   */
  it('is false for a header that merely contains the substring', () => {
    expect(variesOnUserAgent('X-User-Agent-Hint')).toBe(false)
  })
})
