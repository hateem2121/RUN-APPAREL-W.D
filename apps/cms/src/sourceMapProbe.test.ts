import { describe, expect, it } from 'vitest'
import { evaluateMapResponse, findScriptSrc } from '../../../scripts/source-map-probe.mjs'

/**
 * SO-14 — `evaluateMapResponse` is pure (a response shape in, a verdict out), so this
 * suite never touches the network; `scripts/source-map-probe.mjs`'s own header explains
 * why the viewer and site branches are NOT symmetric (a missing viewer `.map` is a 200
 * SPA shell, a missing site one is a genuine 404).
 */

const REAL_SOURCE_MAP = JSON.stringify({
  version: 3,
  sources: ['../src/index.ts'],
  names: [],
  mappings: 'AAAA',
})

describe('findScriptSrc', () => {
  it('finds a matching absolute script src', () => {
    const html = '<script type="module" src="/assets/index-DR-Q8Qk4.js"></script>'
    expect(findScriptSrc(html, '/assets/')).toBe('/assets/index-DR-Q8Qk4.js')
  })

  it('is null when nothing matches the prefix', () => {
    expect(findScriptSrc('<script src="/other/x.js"></script>', '/assets/')).toBeNull()
  })
})

describe('evaluateMapResponse — genuine-404 host (the site)', () => {
  it('accepts a real 404', () => {
    expect(evaluateMapResponse('genuine-404', { status: 404, contentType: null }).ok).toBe(true)
  })

  it('flags anything other than 404 — including a 200 that looks like a real leak', () => {
    const r = evaluateMapResponse('genuine-404', {
      status: 200,
      contentType: 'application/json',
      body: REAL_SOURCE_MAP,
    })
    expect(r.ok).toBe(false)
  })
})

describe('evaluateMapResponse — spa-fallback host (the viewer)', () => {
  /**
   * THE CASE THIS PROBE EXISTS FOR. A 200 here is the SPA fallback and proves nothing on
   * its own — only the body can. Feeding the evaluator a response shaped like a REAL
   * leaked source map (built locally rather
   * than by deploying one to production) proves the probe would catch a real leak, not
   * only today's safe case.
   */
  it('flags a 200 whose BODY is a real source map, despite the status matching the designed fallback', () => {
    const r = evaluateMapResponse('spa-fallback', {
      status: 200,
      contentType: 'application/octet-stream',
      body: REAL_SOURCE_MAP,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('looks like a real source map')
  })

  it('flags a content-type of application/json even if the body were somehow not read', () => {
    const r = evaluateMapResponse('spa-fallback', {
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: null,
    })
    expect(r.ok).toBe(false)
  })

  it('accepts the real, safe SPA-shell response (the designed 200, HTML body)', () => {
    const r = evaluateMapResponse('spa-fallback', {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head></head><body></body></html>',
    })
    expect(r.ok).toBe(true)
  })

  it('would also accept a genuine 404 on this host, if Cloudflare ever changed to one', () => {
    expect(evaluateMapResponse('spa-fallback', { status: 404, contentType: null }).ok).toBe(true)
  })
})
