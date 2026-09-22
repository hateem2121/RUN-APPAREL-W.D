import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NONCE_PATTERN, newNonce, nonceable, noncedHeaders, withNonce } from '../cspNonce.mjs'
import { PUBLIC_PAGE_CSP, notFoundCspRule, publicPageCspRules } from '../publicViewerHeaders.mjs'

/**
 * The script guard's decisions (SE-04, decided 2026-09-18, live from the merge that deploys it).
 * worker.mjs applies them with HTMLRewriter, which vitest cannot run; that is why every decision
 * lives in cspNonce.mjs. Every FAIL/null branch below is a planted fault the guard must refuse.
 */
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA=='
const ADMIN_CSP = "frame-ancestors 'none'"

const response = (headers: Record<string, string>) => ({ headers: new Headers(headers) })
const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `))

describe('newNonce', () => {
  it('is 16 random bytes as 24 base64 characters', () => {
    expect(newNonce()).toMatch(NONCE_PATTERN)
    expect(newNonce(() => new Uint8Array(16))).toBe(NONCE)
  })

  it('is fresh every call', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => newNonce()))
    expect(seen.size).toBe(1000)
  })
})

describe('nonceable: only an HTML page carrying exactly the public-page policy', () => {
  it('rewrites a page and the 404 (both carry PUBLIC_PAGE_CSP)', () => {
    expect(
      nonceable(
        response({
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': PUBLIC_PAGE_CSP,
        }),
      ),
    ).toBe(true)
  })

  it.each<[string, Record<string, string>]>([
    [
      'the Payload admin (its own policy)',
      { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': ADMIN_CSP },
    ],
    [
      'JSON from the API',
      { 'content-type': 'application/json', 'content-security-policy': PUBLIC_PAGE_CSP },
    ],
    [
      'a text file',
      { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': PUBLIC_PAGE_CSP },
    ],
    ['HTML with no policy', { 'content-type': 'text/html' }],
    // An INNER space. A trailing one cannot reach the guard: the Headers API trims leading
    // and trailing whitespace from every value (measured: the first draft planted one, and
    // it came back equal).
    [
      'a policy that differs by one inner space',
      {
        'content-type': 'text/html',
        'content-security-policy': PUBLIC_PAGE_CSP.replace('; ', ';  '),
      },
    ],
    [
      'a policy with one extra directive',
      {
        'content-type': 'text/html',
        'content-security-policy': `${PUBLIC_PAGE_CSP}; upgrade-insecure-requests`,
      },
    ],
  ])('leaves alone %s', (_label, headers) => {
    expect(nonceable(response(headers))).toBe(false)
  })
})

describe('withNonce: script-src only, and only the expected shape', () => {
  it("swaps script-src's 'unsafe-inline' for the nonce and changes nothing else", () => {
    const out = withNonce(PUBLIC_PAGE_CSP, NONCE)
    expect(out).not.toBeNull()
    const policy = out as string
    expect(directive(policy, 'script-src')).toBe(
      `script-src 'self' 'nonce-${NONCE}' https://static.cloudflareinsights.com`,
    )
    expect(directive(policy, 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
    const before = PUBLIC_PAGE_CSP.split('; ').filter((d) => !d.startsWith('script-src '))
    const after = policy.split('; ').filter((d) => !d.startsWith('script-src '))
    expect(after).toEqual(before)
  })

  it.each<[string, string, string]>([
    ['no script-src at all', "default-src 'self'", NONCE],
    ["script-src with no 'unsafe-inline'", "script-src 'self'", NONCE],
    ["script-src with two 'unsafe-inline'", "script-src 'unsafe-inline' 'unsafe-inline'", NONCE],
    ['a nonce that could inject a directive', PUBLIC_PAGE_CSP, "x'; script-src *"],
    ['an empty nonce', PUBLIC_PAGE_CSP, ''],
  ])('refuses %s (null → the shell serves the fallback)', (_label, policy, nonce) => {
    expect(withNonce(policy, nonce)).toBeNull()
  })
})

describe('noncedHeaders', () => {
  it('sets the nonced policy, drops Content-Length and ETag, keeps everything else', () => {
    const headers = new Headers({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': PUBLIC_PAGE_CSP,
      'content-length': '17947',
      // The live 404 carries one, measured 2026-09-22; the five pages do not.
      etag: '"p148o4cfqjdpe"',
      'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    })
    const out = noncedHeaders(headers, NONCE)
    expect(out?.get('content-security-policy')).toBe(withNonce(PUBLIC_PAGE_CSP, NONCE))
    expect(out?.has('content-length')).toBe(false)
    expect(out?.has('etag')).toBe(false)
    expect(out?.get('cache-control')).toBe(headers.get('cache-control'))
    expect(out?.get('content-type')).toBe('text/html; charset=utf-8')
    expect(headers.get('content-security-policy')).toBe(PUBLIC_PAGE_CSP) // input untouched
  })

  it('returns null when the policy cannot be nonced', () => {
    expect(noncedHeaders(new Headers({ 'content-security-policy': ADMIN_CSP }), NONCE)).toBeNull()
  })
})

describe('a nonced page is never cached (pinned statically here; live by the probe)', () => {
  // A cacheable page would hand one visitor's nonce to the next. All five pages render per
  // request today; the 404 cannot declare it (not-found.tsx records that `dynamic` changed
  // nothing), so the probe's live `no-store` check covers it.
  const APP = join(import.meta.dirname, 'app', '(frontend)')
  it.each([
    'page.tsx',
    'products/page.tsx',
    'contact/page.tsx',
    'privacy/page.tsx',
    'terms/page.tsx',
  ])('%s renders per request', (file) => {
    expect(
      readFileSync(join(APP, file), 'utf8'),
      `${file} could be served from a cache, reusing its nonce`,
    ).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

describe('the trigger is exactly what the site rules emit', () => {
  it('every public-page rule and the catch-all emit PUBLIC_PAGE_CSP, byte for byte', () => {
    for (const rule of [...publicPageCspRules, notFoundCspRule]) {
      const csp = rule.headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')
      expect(csp?.value, `${rule.source} would silently fall open`).toBe(PUBLIC_PAGE_CSP)
    }
  })
})
