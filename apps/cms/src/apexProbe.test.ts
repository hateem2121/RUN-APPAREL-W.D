import { describe, expect, it } from 'vitest'
import { MESSAGE, RETRY_DELAYS_MS, TARGETS, evaluate } from '../../../scripts/apex-probe.mjs'

/**
 * Tests for the public-side apex probe (rewritten 2026-09-11).
 *
 * THE PROBE HOLDS NO CODE, AND THESE TESTS ENFORCE IT. The documents now live at
 * catalogue./profile.wear-run.help/<code>; the codes are Worker secrets, and GitHub
 * Actions logs are public. So this probe checks only what is safe to check from a public
 * log: the old addresses stay retired, the private hosts refuse without a code, and the
 * apex still serves the site. UptimeRobot checks the real links.
 *
 * THE MOST IMPORTANT NEGATIVE CONTROL is a retired address serving a PDF again — that is
 * the guessable link reopened, and it must fail even if the status and content-type
 * look fine.
 */

type Observation = {
  name: string
  kind: 'site' | 'retired' | 'refused'
  status: number
  contentType?: string
  magic?: string
  wordmark?: boolean
  message?: boolean
  robots?: string
  cache?: string
  error?: string
}

const site = (over: Partial<Observation> = {}): Observation => ({
  name: 'apex root',
  kind: 'site',
  status: 200,
  contentType: 'text/html; charset=utf-8',
  wordmark: true,
  ...over,
})

const retired = (over: Partial<Observation> = {}): Observation => ({
  name: 'old catalogue',
  kind: 'retired',
  status: 410,
  contentType: 'text/html; charset=utf-8',
  magic: '<!doc',
  message: true,
  robots: 'noindex, nofollow',
  ...over,
})

const refused = (over: Partial<Observation> = {}): Observation => ({
  name: 'catalogue host',
  kind: 'refused',
  status: 404,
  contentType: 'text/html; charset=utf-8',
  magic: '<!doc',
  message: true,
  robots: 'noindex, nofollow',
  ...over,
})

describe('evaluate', () => {
  it('passes when the site answers, the old addresses are retired and the hosts refuse', () => {
    const result = evaluate([site(), retired(), refused()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.lines).toHaveLength(3)
  })

  it('FAILS a retired address that serves a PDF again, whatever else it says', () => {
    const result = evaluate([retired({ magic: '%PDF-', status: 410, message: true })])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('open again')
  })

  it('FAILS a retired address that answers 200', () => {
    expect(evaluate([retired({ status: 200 })]).failures[0]).toContain('expected 410')
  })

  it('FAILS a private host that answers 200 without a code', () => {
    expect(evaluate([refused({ status: 200 })]).failures[0]).toContain('expected 404')
  })

  it('FAILS a private host that serves a PDF without a code', () => {
    expect(evaluate([refused({ magic: '%PDF-' })]).failures[0]).toContain('without a code')
  })

  it('FAILS a private host that drops noindex', () => {
    expect(evaluate([refused({ robots: undefined })]).failures[0]).toContain('noindex')
  })

  it('FAILS a refusal that does not show the not-active message', () => {
    expect(evaluate([refused({ message: false })]).failures[0]).toContain(MESSAGE)
  })

  it.each([403, 429, 503])('treats HTTP %s as INCONCLUSIVE, not an outage', (status) => {
    const result = evaluate([refused({ status })])
    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('Bot Fight Mode')
  })

  it.each([404, 500, 502])('still FAILS the site on HTTP %s', (status) => {
    const result = evaluate([site({ status })])
    expect(result.ok).toBe(false)
    expect(result.inconclusive).toEqual([])
  })

  it('names the lost wildcard when the apex stops serving the site', () => {
    const result = evaluate([site({ status: 404 })])
    expect(result.failures[0]).toContain('expected 200')
    expect(result.failures[0]).toContain('wildcard')
  })

  it('FAILS a 200 at the apex that is not the site', () => {
    expect(evaluate([site({ contentType: 'application/pdf' })]).ok).toBe(false)
    expect(evaluate([site({ wordmark: false })]).failures[0]).toContain('RUN APPAREL')
  })

  it('treats a network error as inconclusive', () => {
    const result = evaluate([refused({ error: 'getaddrinfo ENOTFOUND' })])
    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('inconclusive')
  })
})

describe('TARGETS', () => {
  it('covers the site, four retired addresses and three refusals', () => {
    const kinds = TARGETS.map((t: { kind: string }) => t.kind)
    expect(kinds.filter((k: string) => k === 'site')).toHaveLength(1)
    expect(kinds.filter((k: string) => k === 'retired')).toHaveLength(4)
    expect(kinds.filter((k: string) => k === 'refused')).toHaveLength(3)
  })

  it('never carries a code — its log is public — only fixed paths no link uses', () => {
    const paths = (TARGETS as { url: string }[]).map((t) => new URL(t.url).pathname)
    expect([...new Set(paths)].sort()).toEqual(['/', '/catalogue', '/not-a-real-link', '/profile'])
  })

  it('stays on the four hostnames this Worker and the site answer', () => {
    const hosts = new Set((TARGETS as { url: string }[]).map((t) => new URL(t.url).hostname))
    expect([...hosts].sort()).toEqual([
      'catalogue.wear-run.help',
      'profile.wear-run.help',
      'wear-run.help',
      'www.wear-run.help',
    ])
  })

  it('never targets a model or the viewer', () => {
    for (const target of TARGETS as { url: string }[]) {
      expect(target.url).not.toContain('media.wear-run.help')
      expect(target.url).not.toContain('viewer.wear-run.help')
      expect(target.url).not.toContain('.glb')
    }
  })

  it('waits before re-checking a failure, because a new custom domain takes a moment', () => {
    expect(RETRY_DELAYS_MS).toEqual([15_000, 30_000])
  })
})
