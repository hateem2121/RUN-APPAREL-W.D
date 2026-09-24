import { describe, expect, it } from 'vitest'
import { evaluateContentType } from '../../../scripts/viewer-machine-file-headers-probe.mjs'

/**
 * SO-06 (viewer half) — see `scripts/viewer-machine-file-headers-probe.mjs`'s own header
 * for why this is a LIVE check: Cloudflare's static-asset content-type inference for
 * these three files has no local config this repo could unit-test instead.
 */
describe('evaluateContentType', () => {
  it('accepts a plain text/plain for robots.txt and llms.txt', () => {
    expect(evaluateContentType('/robots.txt', 'text/plain').ok).toBe(true)
    expect(evaluateContentType('/llms.txt', 'text/plain; charset=utf-8').ok).toBe(true)
  })

  it('accepts application/xml for sitemap.xml', () => {
    expect(evaluateContentType('/sitemap.xml', 'application/xml').ok).toBe(true)
  })

  it('flags a machine file served as a web page', () => {
    const r = evaluateContentType('/robots.txt', 'text/html; charset=utf-8')
    expect(r.ok).toBe(false)
    expect(r.actual).toBe('text/html; charset=utf-8')
  })

  it('flags a missing content-type entirely', () => {
    expect(evaluateContentType('/sitemap.xml', null).ok).toBe(false)
  })
})
