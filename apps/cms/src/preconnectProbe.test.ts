import { describe, expect, it } from 'vitest'
import {
  EXPECTED_HOST,
  evaluatePreconnect,
  extractPreconnectHosts,
  UNEXPECTED_HOST,
} from '../../../scripts/preconnect-probe.mjs'

/**
 * SO-05 — see `scripts/preconnect-probe.mjs`'s own header for why this is a LIVE check
 * with no local-runtime equivalent (the decision function it watches cannot be
 * exercised under `next dev`/`next start`/`opennextjs-cloudflare preview`).
 */
describe('extractPreconnectHosts', () => {
  it('reads every preconnect host from a page', () => {
    const html =
      `<link rel="preconnect" href="https://media.wear-run.help">` +
      '<link rel="icon" href="/icon.svg">'
    expect(extractPreconnectHosts(html)).toEqual(['media.wear-run.help'])
  })

  it('is empty when the page declares none', () => {
    expect(extractPreconnectHosts('<link rel="icon" href="/icon.svg">')).toEqual([])
  })

  it('ignores an unparseable href rather than throwing', () => {
    expect(extractPreconnectHosts('<link rel="preconnect" href="not a url">')).toEqual([])
  })
})

describe('evaluatePreconnect', () => {
  it('accepts exactly the expected host and nothing else', () => {
    expect(evaluatePreconnect([EXPECTED_HOST]).ok).toBe(true)
  })

  it('flags a missing preconnect to the media host', () => {
    const r = evaluatePreconnect([])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain(EXPECTED_HOST)
  })

  it('flags a wasted preconnect to the viewer host, which is only ever linked to', () => {
    const r = evaluatePreconnect([EXPECTED_HOST, UNEXPECTED_HOST])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain(UNEXPECTED_HOST)
  })
})
