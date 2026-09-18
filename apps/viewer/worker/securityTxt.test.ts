import { SECURITY_TXT } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { SHARED_SECURITY_HEADERS, WORKER_RESPONSE_CSP } from './securityHeaders'
import { securityTxtResponse } from './securityTxt'

const url = (path: string) => `https://viewer.wear-run.help${path}`

/**
 * The viewer's `/.well-known/security.txt` (decided 2026-09-18, live from the merge that
 * deploys it). A Worker-built response, so it must carry the security headers itself:
 * `_headers` is applied only to responses that come out of `env.ASSETS.fetch()`
 * (securityHeaders.ts records the live measurement).
 */
describe('securityTxtResponse', () => {
  it('answers the fixed path with the shared text and every security header', async () => {
    const response = securityTxtResponse(new Request(url('/.well-known/security.txt')))
    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe(SECURITY_TXT)
    expect(response?.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response?.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(response?.headers.get('content-security-policy')).toBe(WORKER_RESPONSE_CSP)
    for (const [name, value] of Object.entries(SHARED_SECURITY_HEADERS)) {
      expect(response?.headers.get(name), name).toBe(value)
    }
  })

  it('gives HEAD the same headers and no body', async () => {
    const response = securityTxtResponse(
      new Request(url('/.well-known/security.txt'), { method: 'HEAD' }),
    )
    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe('')
    expect(response?.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })

  it.each([
    '/rxps/wine',
    '/.well-known/other.txt',
    '/.well-known/security.txt/extra',
    '/security.txt',
  ])('leaves %s to the rest of the Worker', (path) => {
    expect(securityTxtResponse(new Request(url(path)))).toBeNull()
  })

  it('leaves other methods to the rest of the Worker too', () => {
    const post = new Request(url('/.well-known/security.txt'), { method: 'POST', body: 'x' })
    expect(securityTxtResponse(post)).toBeNull()
  })
})
