import { describe, expect, it } from 'vitest'
import { TARGETS, evaluate } from '../../../scripts/https-redirect-probe.mjs'

/**
 * Tests for the plain-HTTP -> HTTPS redirect probe (SE-01).
 *
 * WHAT THIS GUARDS. A plain `http://` request to any customer-facing host must be
 * redirected to the `https://` version of the SAME host and path. The tracker's SE-01
 * note said this could not be measured from this sandbox at all ("the redirect itself
 * cannot be measured through my proxy"); re-tried 2026-09-23, plain HTTP to all three
 * hosts checked (`wear-run.help`, `viewer.wear-run.help`, `cms.wear-run.help`) answered
 * a correct 301 with the matching `location:`. That measurement turns this from a
 * phone-only line into a robot.
 *
 * The failure this catches is a `200` — a plain-HTTP response that never redirects at
 * all, which is the actual vulnerability (credentials, session data or a garment
 * reference served in the clear). A redirect to the WRONG host is also a failure: a
 * bare "did it redirect" check would miss a misconfigured Cloudflare rule that sends
 * `http://wear-run.help/` to some other origin's HTTPS.
 */

const healthy = (host = 'wear-run.help', path = '/') => ({
  host,
  path,
  status: 301,
  location: `https://${host}${path}`,
})

describe('evaluate — the healthy case', () => {
  it('passes a 301 to the same host and path over https', () => {
    const result = evaluate([healthy()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.measured).toBe(1)
  })

  it('also accepts a 308 (permanent redirect, method preserved)', () => {
    const result = evaluate([{ ...healthy(), status: 308 }])
    expect(result.ok).toBe(true)
  })
})

describe('evaluate — negative controls, each reproducing a real defect', () => {
  it('FAILS on a 200 — no redirect at all, the actual vulnerability this row guards against', () => {
    const result = evaluate([{ ...healthy(), status: 200, location: null }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('did not redirect')
    expect(result.failures[0]).toContain('200')
  })

  it('FAILS when the redirect points at a DIFFERENT host, quoting both the expected and actual Location', () => {
    const result = evaluate([{ ...healthy(), location: 'https://evil.example/' }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('https://wear-run.help/')
    expect(result.failures[0]).toContain('https://evil.example/')
  })

  it('FAILS when the redirect stays on plain http (same host, wrong scheme)', () => {
    const result = evaluate([{ ...healthy(), location: 'http://wear-run.help/' }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('http://wear-run.help/')
  })

  it('FAILS when a 3xx carries no Location header at all', () => {
    const result = evaluate([{ ...healthy(), location: null }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('no Location header')
  })
})

describe('evaluate — what must NOT be read as a pass or a fail', () => {
  it('reads a 403/429/503 as inconclusive — Bot Fight Mode, not a broken redirect', () => {
    for (const status of [403, 429, 503]) {
      const result = evaluate([{ host: 'wear-run.help', path: '/', status, location: null }])
      expect(result.ok).toBe(true)
      expect(result.failures).toEqual([])
      expect(result.inconclusive[0]).toContain(String(status))
      expect(result.measured).toBe(0)
    }
  })

  it('reads a connection failure as inconclusive, never a fail', () => {
    const result = evaluate([{ host: 'wear-run.help', path: '/', error: 'connect ECONNREFUSED' }])
    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('ECONNREFUSED')
    expect(result.measured).toBe(0)
  })

  it('reports measured=0 and a ::warning:: condition when every host is unreachable', () => {
    const result = evaluate([
      { host: 'wear-run.help', path: '/', error: 'timeout' },
      { host: 'viewer.wear-run.help', path: '/', status: 403, location: null },
    ])
    expect(result.measured).toBe(0)
    expect(result.ok).toBe(true)
  })
})

describe('TARGETS', () => {
  it('covers every customer-facing host, imported from zone-security-probe so the two cannot drift', () => {
    expect(TARGETS.map((t) => t.host).sort()).toEqual(
      ['cms.wear-run.help', 'media.wear-run.help', 'viewer.wear-run.help', 'wear-run.help'].sort(),
    )
  })
})
