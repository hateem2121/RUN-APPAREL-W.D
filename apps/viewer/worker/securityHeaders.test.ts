import { describe, expect, it } from 'vitest'
import {
  SHARED_SECURITY_HEADERS,
  WORKER_RESPONSE_CSP,
  workerResponseHeaders,
} from './securityHeaders'

/**
 * Added 2026-08-12, after measuring on the live edge that `/render`'s 400 carried
 * NONE of the five security headers its 200 carried — `_headers` is applied by
 * the static asset handler, and a `new Response(...)` never passes through it.
 * See securityHeaders.ts's own header for the measurement.
 *
 * The drift half of this — that these values still match what `_headers`
 * actually ships — is in scripts/csp.test.ts, which already imports the builder
 * that writes that file. It lives there rather than here because `scripts/` is
 * outside the app tsconfig's `include` (so it may import the untyped csp.mjs),
 * and this file is inside it.
 */
describe('Referrer-Policy (2026-09-18)', () => {
  it('is same-origin, as on the site — internet.nl rates it good', () => {
    // scripts/csp.test.ts then proves `_headers` ships the same value.
    expect(SHARED_SECURITY_HEADERS['Referrer-Policy']).toBe('same-origin')
  })
})

describe('workerResponseHeaders', () => {
  it('carries every header the /* rule sets, so a Worker-built response is not bare', () => {
    const headers = workerResponseHeaders()
    for (const name of Object.keys(SHARED_SECURITY_HEADERS)) {
      expect(headers[name]).toBe(SHARED_SECURITY_HEADERS[name])
    }
    expect(headers['Content-Security-Policy']).toBe(WORKER_RESPONSE_CSP)
  })

  it('sets a content type explicitly rather than leaving it to the runtime', () => {
    // It also carries nosniff, so the declared type is what the browser must use.
    expect(workerResponseHeaders()['Content-Type']).toBe('text/plain; charset=utf-8')
    expect(workerResponseHeaders('application/json')['Content-Type']).toBe('application/json')
  })

  it('refuses framing and every subresource — this is not the SPA policy', () => {
    // Deliberately tighter than the app's CSP: these responses are plain text
    // and load nothing, so anything looser would be a copy of a policy that
    // exists for a different document. Pinned so a future edit that "aligns"
    // the two has to argue with a test.
    expect(WORKER_RESPONSE_CSP).toContain("default-src 'none'")
    expect(WORKER_RESPONSE_CSP).toContain("frame-ancestors 'none'")
    expect(WORKER_RESPONSE_CSP).not.toContain('unsafe-inline')
    expect(WORKER_RESPONSE_CSP).not.toContain('cms.wear-run.help')
  })

  it('names HSTS with a preload-eligible max-age', () => {
    // Two years. Matching _headers is asserted in scripts/csp.test.ts; this
    // catches the value being emptied or shortened on its own.
    expect(SHARED_SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age=63072000')
    expect(SHARED_SECURITY_HEADERS['Strict-Transport-Security']).toContain('preload')
  })
})
