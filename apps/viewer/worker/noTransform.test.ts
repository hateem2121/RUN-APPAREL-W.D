import { describe, expect, it } from 'vitest'
import { withNoTransform } from './noTransform'

/**
 * Tests for the `no-transform` directive on SPA HTML routes.
 *
 * THE BUG THESE PIN IS A DIRECTIVE THAT EXISTED AND NEVER APPLIED. `dist/_headers` has
 * carried `no-transform` on `/index.html` since it was written to stop Cloudflare injecting
 * script into the page — but `_headers` matches the REQUEST PATH, and no visitor requests
 * that file. They request `/rxps/wine`, which fell through to Static Assets' default and got
 * no directive at all. Measured live on 2026-09-04, same site, same second:
 *
 *     GET /index.html   cache-control: …, no-transform   → 0 injected scripts
 *     GET /rxps/wine    (no no-transform)                → 1 injected script
 *
 * So the fix is not "add the directive" — it was already there. It is "apply it where people
 * actually go", and the pair above is both the proof and its own control.
 *
 * The two least obvious assertions are the ones worth keeping: the header must be APPENDED
 * rather than replace what `_headers` set, and a non-200 must be returned untouched — a 304
 * has no body, and constructing a Response with one throws.
 */
const html = (init: ResponseInit = {}) =>
  new Response('<!doctype html><p>hi', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  })

describe('withNoTransform', () => {
  it('adds the directive to an HTML response that lacks it', () => {
    const out = withNoTransform(
      new Response('<p>hi', {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=0, must-revalidate',
        },
      }),
    )
    expect(out.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate, no-transform',
    )
  })

  it('APPENDS rather than replacing — everything _headers set must survive', () => {
    const csp = "default-src 'self'; script-src 'self' 'sha256-abc'"
    const out = withNoTransform(
      new Response('<p>hi', {
        headers: {
          'content-type': 'text/html',
          'cache-control': 'public, max-age=0, must-revalidate',
          'content-security-policy': csp,
          'x-content-type-options': 'nosniff',
        },
      }),
    )
    // The directive is added…
    expect(out.headers.get('cache-control')).toContain('no-transform')
    expect(out.headers.get('cache-control')).toContain('must-revalidate')
    // …and the headers Cloudflare's static-asset handler applied are still there. This is
    // the trap index.ts documents: a response built from scratch carries NONE of them.
    expect(out.headers.get('content-security-policy')).toBe(csp)
    expect(out.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('sets it alone when the response carried no Cache-Control', () => {
    const out = withNoTransform(html())
    expect(out.headers.get('cache-control')).toBe('no-transform')
  })

  it('is idempotent — never doubles the directive', () => {
    const once = withNoTransform(
      new Response('<p>hi', {
        headers: { 'content-type': 'text/html', 'cache-control': 'public, no-transform' },
      }),
    )
    expect(once.headers.get('cache-control')).toBe('public, no-transform')
    expect(once.headers.get('cache-control')?.match(/no-transform/g)).toHaveLength(1)
  })

  it('leaves a non-HTML response alone', () => {
    const image = new Response('binary', {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' },
    })
    const out = withNoTransform(image)
    expect(out.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(out).toBe(image)
  })

  it('returns a non-200 untouched — a 304 has no body and would throw', () => {
    const notModified = new Response(null, {
      status: 304,
      headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=0' },
    })
    const out = withNoTransform(notModified)
    expect(out).toBe(notModified)
    expect(out.headers.get('cache-control')).toBe('public, max-age=0')
  })

  it('keeps the body readable', async () => {
    const out = withNoTransform(html())
    await expect(out.text()).resolves.toBe('<!doctype html><p>hi')
  })
})
