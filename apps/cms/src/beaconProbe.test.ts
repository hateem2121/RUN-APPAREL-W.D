import { describe, expect, it } from 'vitest'
import { hasBeaconTag } from '../../../scripts/beacon-probe.mjs'

/**
 * SO-12 — `hasBeaconTag` reads the WHOLE body rather than grepping line by line, because
 * the viewer's own embed (`apps/viewer/index.html`) writes `src=` and `data-cf-beacon=`
 * on separate lines of the same tag, and a single-line grep misses it entirely (a
 * single-line grep was tried first, and missed it).
 */
describe('hasBeaconTag', () => {
  it('finds a single-line embed', () => {
    expect(
      hasBeaconTag('<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>'),
    ).toBe(true)
  })

  it('finds an embed whose attributes span multiple lines', () => {
    const html = [
      '<script',
      '  src="https://static.cloudflareinsights.com/beacon.min.js"',
      '  data-cf-beacon=\'{"token": "abc"}\'',
      '></script>',
    ].join('\n')
    expect(hasBeaconTag(html)).toBe(true)
  })

  it('matches the beacon address literally — a dot is not "any character"', () => {
    // GitHub's code scan (CodeQL js/incomplete-hostname-regexp, 2026-10-01): the address
    // went into the pattern with its dots unescaped, so a look-alike host matched.
    expect(
      hasBeaconTag('<script src="https://staticXcloudflareinsights.com/beacon.min.js"></script>'),
    ).toBe(false)
  })

  it('is false when no beacon script is present', () => {
    expect(hasBeaconTag('<script src="/assets/index.js"></script>')).toBe(false)
  })
})
