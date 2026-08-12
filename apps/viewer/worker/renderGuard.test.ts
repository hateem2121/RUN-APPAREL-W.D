import { describe, expect, it } from 'vitest'
import { isAllowedRenderModel } from './renderGuard'

/**
 * `/render` renders whatever `model` names inside our own browser with no
 * publish gate in front of it (task 13 brief, requirement 1) — this is the
 * one thing standing between that and an open redirect into arbitrary remote
 * content, so every branch is tested rather than trusted.
 */

const VIEWER_ORIGIN = 'https://viewer.wear-run.help'
const E2E_ORIGIN = 'http://localhost:4173'

describe('isAllowedRenderModel', () => {
  it('allows a path on the same origin as the page — the e2e/local-dev case', () => {
    expect(isAllowedRenderModel('/fixtures/n001.glb', E2E_ORIGIN)).toBe(true)
  })

  it('allows a full URL on the same origin as the page', () => {
    expect(isAllowedRenderModel(`${E2E_ORIGIN}/fixtures/n001.glb`, E2E_ORIGIN)).toBe(true)
  })

  it('allows the production media host even though it differs from the page origin', () => {
    expect(
      isAllowedRenderModel('https://media.wear-run.help/n001-optimized.glb', VIEWER_ORIGIN),
    ).toBe(true)
  })

  it('allows any wear-run.help subdomain, not just media. — the CSP zone this mirrors is a wildcard', () => {
    expect(isAllowedRenderModel('https://cms.wear-run.help/api/media/x.glb', VIEWER_ORIGIN)).toBe(
      true,
    )
  })

  it('REFUSES a bare wear-run.help apex mismatch — must be a subdomain match, not a substring match', () => {
    // "wear-run.help.evil.com" contains "wear-run.help" as a substring; a naive
    // .includes() or unanchored regex would wrongly allow it.
    expect(isAllowedRenderModel('https://wear-run.help.evil.com/x.glb', VIEWER_ORIGIN)).toBe(false)
    expect(isAllowedRenderModel('https://evilwear-run.help/x.glb', VIEWER_ORIGIN)).toBe(false)
  })

  it('REFUSES a third-party host — the exact attack this guards against', () => {
    expect(isAllowedRenderModel('https://example.com/evil.glb', VIEWER_ORIGIN)).toBe(false)
  })

  it('REFUSES the production media host over plain http', () => {
    // Never legitimately served that way; downgrading the scheme is not a
    // reason to let it through.
    expect(isAllowedRenderModel('http://media.wear-run.help/x.glb', VIEWER_ORIGIN)).toBe(false)
  })

  it('REFUSES a missing model', () => {
    expect(isAllowedRenderModel(null, VIEWER_ORIGIN)).toBe(false)
    expect(isAllowedRenderModel('', VIEWER_ORIGIN)).toBe(false)
  })

  it('REFUSES a value `new URL` cannot parse even against a base, rather than throwing', () => {
    // Both genuinely throw (checked against the installed URL implementation
    // before writing this test, not assumed): an absolute attempt with no
    // host, and one whose host contains a space.
    expect(isAllowedRenderModel('https://', VIEWER_ORIGIN)).toBe(false)
    expect(isAllowedRenderModel('http://a b.com/x.glb', VIEWER_ORIGIN)).toBe(false)
  })

  it('REFUSES a scheme-relative URL that resolves off our origin', () => {
    // `new URL('//evil.com/x.glb', pageOrigin)` resolves to https://evil.com —
    // same trick browsers use for protocol-relative links.
    expect(isAllowedRenderModel('//evil.com/x.glb', VIEWER_ORIGIN)).toBe(false)
  })
})
