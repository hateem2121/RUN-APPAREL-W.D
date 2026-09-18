import { SECURITY_TXT } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { REDIRECT_HEADERS, TARGETS, evaluate } from '../../../scripts/public-security-probe.mjs'

/**
 * The public-side security probe (decided 2026-09-18, live from the merge that deploys it):
 * security.txt on every host, and the headers the Cloudflare rule adds to the www./cms.
 * redirects. Every FAIL branch below is a planted fault the probe must catch.
 */
type Observation = {
  name: string
  kind: 'security-txt' | 'redirect'
  status: number
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
    ])
  })
})
