import { describe, expect, it } from 'vitest'
import { REDIRECT_SECURITY_HEADERS, withRedirectHeaders } from '../redirectHeaders.mjs'

const redirect = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { location: 'https://wear-run.com/', ...extra } })

describe('every redirect the site answers carries its security headers (domain move, 2026-09-28)', () => {
  it.each([301, 302, 307, 308])('adds all five to a %i', async (status) => {
    const out = withRedirectHeaders(redirect(status))
    expect(out.status).toBe(status)
    expect(out.headers.get('location')).toBe('https://wear-run.com/')
    for (const [name, value] of Object.entries(REDIRECT_SECURITY_HEADERS)) {
      expect(out.headers.get(name), name).toBe(value)
    }
  })

  // The same five, word for word, that the wear-run.help zone's Transform Rule sets on the
  // www./cms. redirects — measured live 2026-09-28 — so a probe cannot tell the two apart.
  it('matches what the .help zone rule sends today', () => {
    expect(REDIRECT_SECURITY_HEADERS).toEqual({
      'content-security-policy':
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'permissions-policy':
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
      'x-content-type-options': 'nosniff',
    })
  })

  // Negative controls: a page or a 404 keeps its own policy, which the nonce guard reads.
  it.each([200, 304, 404, 410])('leaves a %i exactly as it was', (status) => {
    const response = new Response(status === 304 ? null : 'x', {
      status,
      headers: { 'content-security-policy': "script-src 'self'" },
    })
    expect(withRedirectHeaders(response)).toBe(response)
  })
})
