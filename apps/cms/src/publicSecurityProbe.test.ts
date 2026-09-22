import { SECURITY_TXT } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { REDIRECT_HEADERS, TARGETS, evaluate } from '../../../scripts/public-security-probe.mjs'
import { newNonce, withNonce } from '../cspNonce.mjs'
import { PUBLIC_PAGE_CSP } from '../publicViewerHeaders.mjs'

/**
 * The public-side security probe (decided 2026-09-18, live from the merge that deploys it):
 * security.txt on every host, and the headers the Cloudflare rule adds to the www./cms.
 * redirects. Every FAIL branch below is a planted fault the probe must catch.
 */
type Observation = {
  name: string
  kind: 'security-txt' | 'redirect' | 'page-csp' | 'admin-csp'
  status: number
  expectStatus?: number
  contentType?: string
  body?: string
  headers?: Record<string, string>
  error?: string
}

const NOW = new Date('2026-09-18T12:00:00Z')

const txt = (over: Partial<Observation> = {}): Observation => ({
  name: 'wear-run.help security.txt',
  kind: 'security-txt',
  status: 200,
  contentType: 'text/plain; charset=utf-8',
  body: SECURITY_TXT,
  ...over,
})

const redirect = (over: Partial<Observation> = {}): Observation => ({
  name: 'www. redirect',
  kind: 'redirect',
  status: 308,
  headers: Object.fromEntries(REDIRECT_HEADERS.map((name: string) => [name, 'x'])),
  ...over,
})

describe('evaluate', () => {
  it('passes the shared text and a redirect carrying every header', () => {
    const result = evaluate([txt(), redirect()], NOW)
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it.each<[string, Partial<Observation>, string]>([
    ['a missing security.txt (strict, after a deploy)', { status: 404 }, 'expected 200'],
    [
      'an HTML page where the text should be',
      { contentType: 'text/html; charset=utf-8' },
      'content-type',
    ],
    ['plain text without the UTF-8 charset', { contentType: 'text/plain' }, 'content-type'],
    ['a stale copy', { body: SECURITY_TXT.replace('Preferred-Languages: en\n', '') }, 'differs'],
  ])('FAILS %s', (_label, over, expected) => {
    const result = evaluate([txt(over)], NOW)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain(expected)
  })

  it('FAILS a file 30 days before it expires — the renewal warning', () => {
    const lateAugust = new Date('2027-08-15T00:00:00Z')
    const result = evaluate([txt()], lateAugust)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('renew')
  })

  it('FAILS an expired file', () => {
    expect(evaluate([txt()], new Date('2027-09-02T00:00:00Z')).failures[0]).toContain('expired')
  })

  it('FAILS a redirect missing a header, naming it', () => {
    const headers = Object.fromEntries(
      REDIRECT_HEADERS.filter((name: string) => name !== 'x-frame-options').map((name: string) => [
        name,
        'x',
      ]),
    )
    const result = evaluate([redirect({ headers })], NOW)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('x-frame-options')
  })

  it('FAILS a www./cms. answer that is not a redirect at all', () => {
    expect(evaluate([redirect({ status: 200 })], NOW).failures[0]).toContain('expected a redirect')
  })

  it.each([403, 429, 503])('treats HTTP %s as inconclusive, not an outage', (status) => {
    const result = evaluate([txt({ status }), redirect({ status })], NOW)
    expect(result.ok).toBe(true)
    expect(result.inconclusive).toHaveLength(2)
  })

  it('treats a request that never completed as inconclusive', () => {
    const result = evaluate([txt({ status: 0, error: 'getaddrinfo ENOTFOUND' })], NOW)
    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('inconclusive')
  })

  describe('--daily', () => {
    it('a missing file is inconclusive — a merge not yet deployed must not page the owner', () => {
      const result = evaluate([txt({ status: 404 })], NOW, { daily: true })
      expect(result.ok).toBe(true)
      expect(result.inconclusive[0]).toContain('not served as a text file yet')
    })

    it("and so is the viewer's HTML app shell answering 200 — measured before the deploy", () => {
      const shell = txt({ contentType: 'text/html', body: '<!doctype html>' })
      expect(evaluate([shell], NOW, { daily: true }).ok).toBe(true)
      // …while after a deploy the same answer is a failure (the control for the line above).
      expect(evaluate([shell], NOW).ok).toBe(false)
    })

    it('but a present file that is about to expire still FAILS daily — that is its job', () => {
      const result = evaluate([txt()], new Date('2027-08-15T00:00:00Z'), { daily: true })
      expect(result.ok).toBe(false)
      expect(result.failures[0]).toContain('renew')
    })

    it('and a redirect missing its headers still FAILS daily', () => {
      expect(evaluate([redirect({ headers: {} })], NOW, { daily: true }).ok).toBe(false)
    })
  })
})

describe('TARGETS', () => {
  const urls = (TARGETS as { url: string; kind: string }[]).map((t) => new URL(t.url))

  it('checks security.txt on all eight addresses and both redirects', () => {
    const kinds = (TARGETS as { kind: string }[]).map((t) => t.kind)
    expect(kinds.filter((k) => k === 'security-txt')).toHaveLength(8)
    expect(kinds.filter((k) => k === 'redirect')).toHaveLength(2)
    expect([...new Set(urls.map((u) => u.hostname))].sort()).toEqual([
      'catalogue.wear-run.com',
      'catalogue.wear-run.help',
      'cms.wear-run.help',
      'profile.wear-run.com',
      'profile.wear-run.help',
      'viewer.wear-run.help',
      'wear-run.help',
      'www.wear-run.help',
    ])
  })

  it('never carries a document code — its log is public — only fixed paths', () => {
    expect([...new Set(urls.map((u) => u.pathname))].sort()).toEqual([
      '/',
      '/.well-known/security.txt',
      '/admin',
      '/contact',
      '/definitely-not-a-page',
      '/privacy',
      '/products',
      '/terms',
    ])
  })
})

/*
 * The script guard, seen from outside (SE-04, decided 2026-09-18, live from the merge that
 * deploys it). apps/cms/worker.mjs gives every public page a per-request nonce. These are the
 * planted faults a live check must name: the guard fell open, an edge feature injected a
 * script, a cached page reused a nonce, or the admin's policy was touched.
 */
const N1 = 'AAAAAAAAAAAAAAAAAAAAAA=='
const N2 = 'BBBBBBBBBBBBBBBBBBBBBB=='
// The policy the guard REALLY sends (apps/cms/cspNonce.mjs), never a hand-typed copy: a change to
// the nonce's format or the policy's shape then fails here, before a deploy, instead of failing
// every post-deploy run (independent review, 2026-09-22).
const NONCED = (n: string) => withNonce(PUBLIC_PAGE_CSP, n) as string
const FALLBACK = PUBLIC_PAGE_CSP
const HTML = (n: string) =>
  `<html><head><script nonce="${n}">(self.__next_f=self.__next_f||[]).push([0])</script>` +
  `<script src="/_next/static/chunks/a.js" nonce="${n}" async=""></script></head></html>`
const NO_STORE = 'private, no-cache, no-store, max-age=0, must-revalidate'

const pageCsp = (over: Partial<Observation> = {}): Observation => ({
  name: 'site /',
  kind: 'page-csp',
  status: 200,
  headers: { 'content-security-policy': NONCED(N1), 'cache-control': NO_STORE },
  body: HTML(N1),
  ...over,
})
const adminCsp = (over: Partial<Observation> = {}): Observation => ({
  name: 'admin policy',
  kind: 'admin-csp',
  status: 200,
  headers: { 'content-security-policy': "frame-ancestors 'none'" },
  ...over,
})

describe('the script guard, seen from outside (SE-04)', () => {
  it('passes nonced pages with distinct nonces, and an unchanged admin policy', () => {
    const second = pageCsp({
      name: 'site / again',
      headers: { 'content-security-policy': NONCED(N2), 'cache-control': NO_STORE },
      body: HTML(N2),
    })
    const result = evaluate([pageCsp(), second, adminCsp()], NOW)
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
  })

  it.each<[string, Partial<Observation>, string]>([
    [
      'the fallback policy (the guard fell open)',
      { headers: { 'content-security-policy': FALLBACK, 'cache-control': NO_STORE } },
      "'unsafe-inline'",
    ],
    [
      'a policy with no nonce',
      { headers: { 'content-security-policy': "script-src 'self'", 'cache-control': NO_STORE } },
      'no nonce',
    ],
    [
      'a script without this nonce (an edge injection)',
      { body: HTML(N1).replace('</head>', '<script>injected()</script></head>') },
      'without',
    ],
    // The three below all PASSED until 2026-09-22. A page with nothing to inspect has no
    // <script> lacking the nonce, so the check measured nothing and reported ok.
    [
      'a page cut off mid-stream (an error once the rewriter had started)',
      { body: HTML(N1).slice(0, 60) },
      'cut off',
    ],
    [
      'a page compressed twice, so only bytes arrive (measured in workerd, 2026-09-22)',
      { body: '\u001f\u008b\u0008\u0000\u0000\u0000\u0000\u0000\u0000\u0003' },
      'cut off',
    ],
    [
      'a page with no <script> at all',
      { body: '<html><head></head><body><p>hello</p></body></html>' },
      'no <script>',
    ],
    [
      'a cacheable page',
      {
        headers: { 'content-security-policy': NONCED(N1), 'cache-control': 'public, max-age=60' },
      },
      'cacheable',
    ],
    ['the wrong status', { status: 500 }, 'expected 200'],
  ])('FAILS %s', (_label, over, expected) => {
    const result = evaluate([pageCsp(over)], NOW)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain(expected)
  })

  it("recognises the guard's own nonces: two fresh ones, on the real policy", () => {
    const page = (name: string, n: string) =>
      pageCsp({
        name,
        headers: { 'content-security-policy': NONCED(n), 'cache-control': NO_STORE },
        body: HTML(n),
      })
    const result = evaluate([page('site /', newNonce()), page('site / again', newNonce())], NOW)
    expect(result.failures).toEqual([])
  })

  it('FAILS a nonce served twice (a cached page)', () => {
    const result = evaluate([pageCsp(), pageCsp({ name: 'site / again' })], NOW)
    expect(result.ok).toBe(false)
    expect(result.failures.join(' ')).toContain('twice')
  })

  it('expects a 404 where a target says so', () => {
    expect(evaluate([pageCsp({ name: 'site 404', status: 404, expectStatus: 404 })], NOW).ok).toBe(
      true,
    )
  })

  it('FAILS a changed admin policy', () => {
    const result = evaluate([adminCsp({ headers: { 'content-security-policy': NONCED(N1) } })], NOW)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('admin policy changed')
  })

  it('a runner 403 on a page is inconclusive, never a failure', () => {
    const result = evaluate([pageCsp({ status: 403 })], NOW)
    expect(result.ok).toBe(true)
    expect(result.inconclusive).toHaveLength(1)
  })

  it('watches the six page types, / twice, and the admin', () => {
    const targets = TARGETS as { kind: string; url: string }[]
    const pages = targets.filter((t) => t.kind === 'page-csp')
    expect(pages.map((t) => new URL(t.url).pathname).sort()).toEqual(
      ['/', '/', '/contact', '/definitely-not-a-page', '/privacy', '/products', '/terms'].sort(),
    )
    expect(targets.filter((t) => t.kind === 'admin-csp')).toHaveLength(1)
  })
})
