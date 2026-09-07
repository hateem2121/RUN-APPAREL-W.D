import { describe, expect, it } from 'vitest'
import { TARGETS, evaluate } from '../../../scripts/apex-probe.mjs'

/**
 * Tests for the apex PDF probe.
 *
 * THE CHECK THIS REPLACED WAS WRONG IN THREE WAYS AT ONCE, and each has a test here.
 *
 * `.github/workflows/uptime.yml` asserted `/catalogue` returns a 301. After the PDFs
 * moved off Google Drive into R2 it returns a 200 PDF, so the check errored on every
 * run (false alarm, outage issue #47), the run still concluded `success` (false
 * green), and it could no longer distinguish a working catalogue from a dead one
 * (blind). It also never asserted what its own comment claimed: the 3xx branch tested
 * only that `Location` was non-empty, never where it pointed.
 *
 * THE TWO MOST IMPORTANT TESTS ARE THE LEAST OBVIOUS.
 *
 * 1. THE 403 CASE. Root CLAUDE.md: a 403 from a runner is *inconclusive, never a
 *    failed assertion* — free-plan Bot Fight Mode blocks datacenter IPs
 *    intermittently, and it has already forced a rollback and failed a deploy here.
 *    An alarm that fires on Cloudflare's mood gets muted, which is how the uptime
 *    check sat dead for 17 days. Paired with a control proving inconclusive is not
 *    blanket amnesty: a 404 and a 500 must still fail.
 *
 * 2. THE MAGIC-NUMBER CASE. A Cloudflare error page can be served 200 with a coerced
 *    `content-type: application/pdf`. Status and content-type together still pass it.
 *    Only the bytes settle it — a real PDF starts `%PDF-`. This is the negative
 *    control that makes the whole probe worth running, and it is why the probe reads
 *    1024 bytes rather than issuing a HEAD.
 */

type Observation = {
  name: string
  kind: 'pdf' | 'site'
  status: number
  contentType?: string
  totalBytes?: number
  magic?: string
  wordmark?: boolean
  cache?: string
  error?: string
}

/** A healthy catalogue response. Numbers are the live ones, measured 2026-08-30. */
const pdf = (over: Partial<Observation> = {}): Observation => ({
  name: 'catalogue',
  kind: 'pdf',
  status: 206,
  contentType: 'application/pdf',
  totalBytes: 54_336_461,
  magic: '%PDF-',
  cache: 'HIT',
  ...over,
})

/** The apex serving the marketing site — measured shape after 2026-09-06. */
const apexRoot = (over: Partial<Observation> = {}): Observation => ({
  name: 'apex root',
  kind: 'site',
  status: 200,
  contentType: 'text/html; charset=utf-8',
  wordmark: true,
  ...over,
})

describe('evaluate', () => {
  it('passes when both PDFs serve and the apex serves the site', () => {
    const result = evaluate([pdf(), pdf({ name: 'profile', totalBytes: 16_891_515 }), apexRoot()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('accepts 200 as well as 206 — an origin may ignore the Range header', () => {
    expect(evaluate([pdf({ status: 200 })]).ok).toBe(true)
  })

  it.each([403, 429, 503])('treats HTTP %s as INCONCLUSIVE, not an outage', (status) => {
    const result = evaluate([pdf({ status })])

    // Not merely "does not fail" — it must be recorded as inconclusive, so a human
    // reading the log can tell "we could not measure" from "we measured, it is fine".
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.inconclusive).toHaveLength(1)
    expect(result.inconclusive[0]).toContain('Bot Fight Mode')
  })

  it.each([404, 500, 502])(
    'still FAILS on HTTP %s — inconclusive is not blanket amnesty',
    (status) => {
      const result = evaluate([pdf({ status })])

      expect(result.ok).toBe(false)
      expect(result.inconclusive).toEqual([])
    },
  )

  it('names the cached-404 remedy, because a redeploy will not fix one', () => {
    const result = evaluate([pdf({ status: 404 })])

    // CLAUDE.md: a 404 from an R2-backed host can be a CACHED miss from before the
    // object existed. The fix is a Custom Purge of that exact URL. An operator who
    // redeploys instead loses an hour.
    expect(result.failures[0]).toContain('Custom Purge')
  })

  it('FAILS an error page dressed as a PDF — the magic number is the only real proof', () => {
    // 200, and content-type says application/pdf. Both weaker checks pass this.
    const result = evaluate([pdf({ magic: '<!DOC', totalBytes: 28_000 })])

    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('%PDF-')
  })

  it('FAILS a PDF that is too small to be one of ours', () => {
    const result = evaluate([pdf({ totalBytes: 28_000 })])

    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('floor')
  })

  it('FAILS a wrong content-type', () => {
    const result = evaluate([pdf({ contentType: 'text/html; charset=utf-8' })])

    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('application/pdf')
  })

  it('FAILS when the size is unknown rather than passing on absence', () => {
    const result = evaluate([pdf({ totalBytes: undefined })])

    expect(result.ok).toBe(false)
  })

  it('FAILS if the apex stops serving the site — a 404 there is the OLD behaviour', () => {
    // Until 2026-09-06 the bare apex 404'd by design and this test asserted that. The
    // site lives there now; a 404 means the CMS Worker lost its wildcard route.
    const result = evaluate([apexRoot({ status: 404 })])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('expected 200')
    expect(result.failures[0]).toContain('wildcard')
  })

  it('FAILS a 200 that is not the site — wrong type, or no wordmark in the body', () => {
    expect(evaluate([apexRoot({ contentType: 'application/pdf' })]).ok).toBe(false)
    expect(evaluate([apexRoot({ wordmark: false })]).ok).toBe(false)
    expect(evaluate([apexRoot({ wordmark: false })]).failures[0]).toContain('RUN APPAREL')
  })

  it('treats a network error as inconclusive, not an outage', () => {
    const result = evaluate([pdf({ error: 'getaddrinfo ENOTFOUND' })])

    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('inconclusive')
  })

  it('reports every target, so a silent skip is visible in the log', () => {
    const result = evaluate([pdf(), pdf({ name: 'profile' }), apexRoot()])

    expect(result.lines).toHaveLength(3)
  })
})

describe('TARGETS', () => {
  it('covers both PDFs and the bare apex', () => {
    expect(TARGETS.map((t: { name: string }) => t.name).sort()).toEqual([
      'apex root',
      'catalogue',
      'profile',
    ])
  })

  it('never targets the model — that belongs to the payload smoke test', () => {
    // Mirrors perfProbe.test.ts. R2 egress is inside a $5/month cap, and a probe that
    // pulls a model is affordable only until someone changes the schedule.
    for (const target of TARGETS as { url: string }[]) {
      expect(target.url).not.toContain('media.wear-run.help')
      expect(target.url).not.toContain('.glb')
    }
  })

  it('asserts the apex root as the SITE, not a 404', () => {
    expect(
      (TARGETS as { name: string; kind: string }[]).find((t) => t.name === 'apex root')?.kind,
    ).toBe('site')
  })

  it('points at the apex, not the viewer — the viewer is an SPA and answers anything', () => {
    for (const target of TARGETS as { url: string }[]) {
      expect(target.url.startsWith('https://wear-run.help/')).toBe(true)
    }
  })
})
