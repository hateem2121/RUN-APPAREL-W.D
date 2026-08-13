import { describe, expect, it } from 'vitest'
import { auditLicences, isDenied, toCycloneDx } from '../../../scripts/sbom.mjs'

/**
 * Tests for the SBOM generator and its licence gate.
 *
 * THE ASSERTION THAT MATTERS MOST IS THE LGPL ONE. The deny pattern for GPL is
 * `/(?<!L)\bGPL-[23]/i` — a negative lookbehind whose entire job is to NOT match
 * `LGPL-3.0-or-later`. Get it wrong and the build fails on
 * `@img/sharp-libvips-darwin-arm64`, a platform binary sharp links, whose licence is
 * perfectly compatible. A licence gate that cries wolf on the first real dependency
 * gets switched off within a week, and then the AGPL it exists to catch walks in.
 *
 * So this file tests both directions deliberately: every denied family must be
 * caught, and every licence actually present in this tree on 2026-08-13 must pass.
 */

const meta = { timestamp: '2026-08-13T00:00:00.000Z', serialNumber: 'urn:uuid:test' }

const report = {
  MIT: [{ name: 'left-pad', versions: ['1.0.0'], description: 'pads', homepage: 'https://x.test' }],
  'Apache-2.0': [{ name: 'sharp', versions: ['0.35.3', '0.34.0'] }],
}

describe('isDenied', () => {
  it.each([
    'AGPL-3.0',
    'AGPL-3.0-only',
    'SSPL-1.0',
    'GPL-2.0',
    'GPL-3.0-or-later',
    'BUSL-1.1',
    'MIT AND Commons-Clause',
  ])('denies %s', (licence) => {
    expect(isDenied(licence)).toBe(true)
  })

  /**
   * Every licence measured in this repository's actual dependency tree on
   * 2026-08-13, across 1,067 components. All must pass, or the gate is unusable.
   */
  it.each([
    'MIT',
    'Apache-2.0',
    'ISC',
    'BSD-3-Clause',
    'BSD-2-Clause',
    'BlueOak-1.0.0',
    'MIT OR Apache-2.0',
    'MPL-2.0',
    'MIT-0',
    'OFL-1.1',
    'FSL-1.1-MIT',
    'CC0-1.0',
    '0BSD',
    'LGPL-3.0-or-later',
    'Python-2.0',
    'CC-BY-4.0',
    '(MPL-2.0 OR Apache-2.0)',
    'WTFPL OR ISC',
  ])('allows %s, which is present in this tree today', (licence) => {
    expect(isDenied(licence)).toBe(false)
  })

  it('does not mistake LGPL for GPL', () => {
    // The single most likely false positive, and the one that would discredit the
    // gate: @img/sharp-libvips-darwin-arm64 is LGPL-3.0-or-later, is a build-time
    // optional platform binary, and never reaches the Workers.
    expect(isDenied('LGPL-3.0-or-later')).toBe(false)
    expect(isDenied('LGPL-2.1')).toBe(false)
    expect(isDenied('GPL-3.0-or-later')).toBe(true)
  })
})

describe('toCycloneDx', () => {
  const sbom = toCycloneDx(report, meta)

  it('emits a valid CycloneDX 1.6 envelope', () => {
    expect(sbom.bomFormat).toBe('CycloneDX')
    expect(sbom.specVersion).toBe('1.6')
    expect(sbom.metadata.timestamp).toBe(meta.timestamp)
  })

  it('emits one component per name+version pair, not per package', () => {
    // sharp appears at two versions; both must be listed, because "which version were
    // we running on the day the advisory landed" is the question an SBOM answers.
    expect(sbom.components).toHaveLength(3)
    expect(sbom.components.filter((c) => c.name === 'sharp')).toHaveLength(2)
  })

  it('gives each component a purl, which is what scanners match on', () => {
    const left = sbom.components.find((c) => c.name === 'left-pad')
    expect(left?.purl).toBe('pkg:npm/left-pad@1.0.0')
  })

  it('encodes the @ in a scoped package name, keeping the namespace separator', () => {
    const scoped = toCycloneDx({ MIT: [{ name: '@run/thing', versions: ['1.0.0'] }] }, meta)

    // Per the purl spec an npm scope is the NAMESPACE component: `@scope` is
    // percent-encoded to `%40scope`, and the `/` separating it from the name stays a
    // literal `/`. Encoding that slash too would produce an identifier no scanner
    // matches — which is the whole value of emitting purls at all.
    expect(scoped.components[0]?.purl).toBe('pkg:npm/%40run/thing@1.0.0')
  })

  /**
   * Sorted output, and no clock or randomness inside the conversion. Two runs on the
   * same tree differ only in `timestamp` and `serialNumber`, so the SBOM diffs — which
   * is far more useful than a fresh one, because the interesting question is always
   * "what CHANGED since the last release".
   */
  it('is deterministic and sorted', () => {
    const a = JSON.stringify(toCycloneDx(report, meta))
    const b = JSON.stringify(toCycloneDx(report, meta))
    expect(a).toBe(b)

    const purls = toCycloneDx(report, meta).components.map((c) => c.purl)
    expect(purls).toEqual([...purls].sort())
  })
})

describe('auditLicences', () => {
  it('passes a clean tree and counts by licence', () => {
    const { denied, byLicence } = auditLicences(toCycloneDx(report, meta))

    expect(denied).toEqual([])
    expect(byLicence.get('Apache-2.0')).toBe(2)
  })

  it('names the offending package and version when a denied licence appears', () => {
    const poisoned = toCycloneDx(
      { ...report, 'AGPL-3.0': [{ name: 'copyleft-thing', versions: ['2.0.0'] }] },
      meta,
    )
    const { denied } = auditLicences(poisoned)

    expect(denied).toHaveLength(1)
    expect(denied[0]).toContain('copyleft-thing@2.0.0')
    expect(denied[0]).toContain('AGPL-3.0')
  })

  it('counts a component with no licence as UNKNOWN rather than skipping it', () => {
    // A component that silently vanishes from the audit is the failure mode an SBOM
    // is supposed to remove.
    const { byLicence } = auditLicences({
      components: [{ name: 'mystery', version: '1.0.0', purl: 'pkg:npm/mystery@1.0.0' }],
    } as ReturnType<typeof toCycloneDx>)

    expect(byLicence.get('UNKNOWN')).toBe(1)
  })
})
