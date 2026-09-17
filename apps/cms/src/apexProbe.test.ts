import { describe, expect, it } from 'vitest'
import { MESSAGE_HEADLINE } from '../../../infra/apex-404/page.js'
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
  kind: 'site' | 'retired' | 'refused' | 'redirect'
  status: number
  contentType?: string
  magic?: string
  wordmark?: boolean
  message?: boolean
  robots?: string
  cache?: string
  location?: string
  to?: string
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

/**
 * The two redirects old emails use (`/map`, `/meeting`). They are Cloudflare redirect
 * rules that exist in no file, so only this probe would notice one being deleted. The
 * target below is a placeholder path: the probe compares the HOST only.
 */
const redirect = (over: Partial<Observation> = {}): Observation => ({
  name: 'map redirect',
  kind: 'redirect',
  status: 302,
  location: 'https://maps.app.goo.gl/placeholder',
  to: 'maps.app.goo.gl',
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

  it('passes a redirect that still points at its host, whatever the 3xx', () => {
    expect(evaluate([redirect()]).ok).toBe(true)
    expect(
      evaluate([
        redirect({ status: 301, location: 'https://app.apollo.io/#/x', to: 'app.apollo.io' }),
      ]).ok,
    ).toBe(true)
  })

  it('FAILS a redirect whose rule is gone — the site answers its own 404 instead', () => {
    const result = evaluate([redirect({ status: 404, location: undefined })])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('expected a redirect')
  })

  it('FAILS a redirect that now points at another host', () => {
    expect(
      evaluate([redirect({ location: 'https://example.com/elsewhere' })]).failures[0],
    ).toContain('expected maps.app.goo.gl')
  })

  it('FAILS a redirect with no location header', () => {
    expect(evaluate([redirect({ location: undefined })]).failures[0]).toContain('(no location)')
  })

  it('treats a blocked redirect check as inconclusive, like every other target', () => {
    expect(evaluate([redirect({ status: 403, location: undefined })]).ok).toBe(true)
  })

  it('treats a network error as inconclusive', () => {
    const result = evaluate([refused({ error: 'getaddrinfo ENOTFOUND' })])
    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('inconclusive')
  })
})

describe('TARGETS', () => {
  it('covers the site, four retired addresses, five refusals and two redirects', () => {
    const kinds = TARGETS.map((t: { kind: string }) => t.kind)
    expect(kinds.filter((k: string) => k === 'site')).toHaveLength(1)
    expect(kinds.filter((k: string) => k === 'retired')).toHaveLength(4)
    expect(kinds.filter((k: string) => k === 'refused')).toHaveLength(5)
    expect(kinds.filter((k: string) => k === 'redirect')).toHaveLength(2)
  })

  it('never carries a code — its log is public — only fixed paths no link uses', () => {
    const paths = (TARGETS as { url: string }[]).map((t) => new URL(t.url).pathname)
    expect([...new Set(paths)].sort()).toEqual([
      '/',
      '/catalogue',
      '/map',
      '/meeting',
      '/not-a-real-link',
      '/profile',
    ])
  })

  it('stays on the hostnames this Worker and the site answer — both families', () => {
    const hosts = new Set((TARGETS as { url: string }[]).map((t) => new URL(t.url).hostname))
    expect([...hosts].sort()).toEqual([
      'catalogue.wear-run.com',
      'catalogue.wear-run.help',
      'profile.wear-run.com',
      'profile.wear-run.help',
      'wear-run.help',
      'www.wear-run.help',
    ])
  })

  /**
   * Owner instruction, 2026-09-17: keep these two redirects forever, because emails sent
   * long ago link to them. They live only in Cloudflare, so this is the only thing in the
   * repository that would notice one disappearing.
   */
  it('checks each email redirect against the host it has always pointed at', () => {
    const redirects = (TARGETS as { kind: string; url: string; to?: string }[]).filter(
      (t) => t.kind === 'redirect',
    )
    expect(redirects.map((t) => [new URL(t.url).pathname, t.to])).toEqual([
      ['/map', 'maps.app.goo.gl'],
      ['/meeting', 'app.apollo.io'],
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

/**
 * The probe cannot read the page's own text (it never holds a code, so it never opens
 * one) — it decides "refused" or "retired" from MESSAGE, a short substring, against
 * whatever page.js actually renders. A wording change to MESSAGE_HEADLINE that dropped
 * or reworded MESSAGE would go green in every unit test here and still turn every
 * post-deploy probe run red once the Worker was already live. Pin the relationship
 * instead of discovering it that way.
 */
describe('MESSAGE stays inside the page the Worker actually serves', () => {
  it('MESSAGE_HEADLINE contains MESSAGE', () => {
    expect(MESSAGE_HEADLINE).toContain(MESSAGE)
  })
})
