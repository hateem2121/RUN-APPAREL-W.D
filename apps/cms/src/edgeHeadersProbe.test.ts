import { describe, expect, it } from 'vitest'
import {
  evaluateCacheControl,
  extractHashedAssetPath,
  isRefusal,
  hasH3AltSvc,
} from '../../../scripts/edge-headers-probe.mjs'

/**
 * PF-12 + PF-14 — see `scripts/edge-headers-probe.mjs`'s own header for why this is a
 * LIVE check with no local-runtime equivalent (Cloudflare's cache substrate and HTTP/3
 * negotiation are edge-only). Unit tests here cover the probe's own parsing/judging
 * logic, the pattern every `*-probe.mjs` in this repo pairs with — its NETWORK calls
 * are only exercised live/manually.
 */
describe('extractHashedAssetPath', () => {
  it('finds the entry chunk path in the built viewer HTML', () => {
    const html = '<script type="module" crossorigin src="/assets/index-DeYxRu4g.js"></script>'
    expect(extractHashedAssetPath(html)).toBe('/assets/index-DeYxRu4g.js')
  })

  it('is null when no such script tag exists', () => {
    expect(extractHashedAssetPath('<script src="/other.js"></script>')).toBeNull()
  })
})

describe('hasH3AltSvc', () => {
  it('accepts the h3 advertisement Cloudflare appends a max-age to', () => {
    expect(hasH3AltSvc('h3=":443"; ma=86400')).toBe(true)
  })

  it('rejects a missing or empty alt-svc header', () => {
    expect(hasH3AltSvc(undefined)).toBe(false)
    expect(hasH3AltSvc('')).toBe(false)
  })

  it('rejects an alt-svc that does not advertise h3 on 443', () => {
    expect(hasH3AltSvc('h2=":443"')).toBe(false)
  })
})

describe('evaluateCacheControl', () => {
  it('accepts a hashed asset with immutable + a year-plus max-age', () => {
    expect(evaluateCacheControl('hashed-immutable', 'public, max-age=31536000, immutable').ok).toBe(
      true,
    )
  })

  it('flags a hashed asset missing immutable', () => {
    const r = evaluateCacheControl('hashed-immutable', 'public, max-age=31536000')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('immutable')
  })

  it('flags a hashed asset with too short a max-age', () => {
    const r = evaluateCacheControl('hashed-immutable', 'public, max-age=3600, immutable')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('max-age')
  })

  it('accepts HTML that must-revalidate', () => {
    expect(evaluateCacheControl('html', 'public, max-age=0, must-revalidate').ok).toBe(true)
  })

  it('flags HTML that never revalidates', () => {
    const r = evaluateCacheControl('html', 'public, max-age=31536000, immutable')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('must-revalidate')
  })

  it('accepts a poster/model response with at least a day of TTL', () => {
    expect(evaluateCacheControl('long-ttl', 'public, max-age=86400').ok).toBe(true)
  })

  it('flags a poster/model response with a too-short TTL', () => {
    const r = evaluateCacheControl('long-ttl', 'public, max-age=0, must-revalidate')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('TTL')
  })

  it('throws on an unknown kind rather than judging silently', () => {
    expect(() => evaluateCacheControl('bogus', 'public')).toThrow(/unknown kind/)
  })
})

describe('isRefusal', () => {
  it('reads Bot Fight Mode refusals (403, 429) as inconclusive, never as a failed check', () => {
    expect(isRefusal(403)).toBe(true)
    expect(isRefusal(429)).toBe(true)
  })
  it('treats every real answer, good or bad, as a result to judge', () => {
    for (const status of [200, 206, 301, 404, 500]) expect(isRefusal(status)).toBe(false)
  })
})
