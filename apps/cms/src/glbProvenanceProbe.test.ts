import { describe, expect, it } from 'vitest'
import { evaluate, extractGlbJsonChunk } from '../../../scripts/glb-provenance-probe.mjs'

/**
 * Tests for the live GLB provenance probe (SE-16).
 *
 * WHAT THIS GUARDS. `tools/asset-pipeline/src/strip-live-metadata.ts` writes
 * `asset.copyright` at build time, only when absent, so every processed model
 * SHOULD carry it and never a CLO/Marvelous Designer leftover string — but nothing
 * re-checks this on the LIVE files after the fact. A spot check on one live model
 * (2026-09-23) found `"copyright":"© RUN Apparel. All rights reserved."` and no
 * leftover strings — correct, but one product out of sixteen, and a one-time check
 * proves nothing about tomorrow's re-export.
 */

/** A small, real-shaped GLB JSON chunk — the `asset` block is always first. */
function glbBytes(jsonText: string): Uint8Array {
  const json = new TextEncoder().encode(jsonText)
  const padded = new Uint8Array(Math.ceil(json.byteLength / 4) * 4)
  padded.set(json)
  padded.fill(0x20, json.byteLength)

  const header = new Uint8Array(12)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, 0x46546c67, true) // 'glTF'
  headerView.setUint32(4, 2, true) // version
  headerView.setUint32(8, 12 + 8 + padded.byteLength, true) // total length (no BIN chunk needed for this test)

  const chunkHeader = new Uint8Array(8)
  const chunkView = new DataView(chunkHeader.buffer)
  chunkView.setUint32(0, padded.byteLength, true)
  chunkView.setUint32(4, 0x4e4f534a, true) // 'JSON'

  const out = new Uint8Array(header.byteLength + chunkHeader.byteLength + padded.byteLength)
  out.set(header, 0)
  out.set(chunkHeader, header.byteLength)
  out.set(padded, header.byteLength + chunkHeader.byteLength)
  return out
}

const HEALTHY_JSON = JSON.stringify({
  asset: {
    version: '2.0',
    generator: 'glTF-Transform v4.4.2',
    copyright: '© RUN Apparel. All rights reserved.',
  },
  extensionsUsed: ['EXT_texture_webp', 'KHR_materials_emissive_strength'],
})

describe('extractGlbJsonChunk — pure GLB header parsing', () => {
  it('reads the JSON chunk out of a real-shaped GLB prefix', () => {
    const result = extractGlbJsonChunk(glbBytes(HEALTHY_JSON))
    expect('text' in result && JSON.parse(result.text)).toEqual(JSON.parse(HEALTHY_JSON))
  })

  it('names a truncated fetch rather than silently reading a partial chunk', () => {
    const full = glbBytes(HEALTHY_JSON)
    const truncated = full.subarray(0, 25) // header + chunk header, but not the whole declared length
    const result = extractGlbJsonChunk(truncated)
    expect('error' in result && result.error).toContain('truncated')
  })

  it('names a bad magic number rather than throwing', () => {
    const bytes = new Uint8Array(20)
    const result = extractGlbJsonChunk(bytes)
    expect('error' in result && result.error).toContain('not a GLB')
  })

  it('does not throw on too few bytes to hold a header', () => {
    expect(() => extractGlbJsonChunk(new Uint8Array(4))).not.toThrow()
    const result = extractGlbJsonChunk(new Uint8Array(4))
    expect('error' in result).toBe(true)
  })
})

const healthy = (key = 'rxps/wine') => ({ key, status: 206, jsonChunk: HEALTHY_JSON })

describe('evaluate — the healthy case', () => {
  it('passes a model whose copyright is set and carries no CLO leftover', () => {
    const result = evaluate([healthy()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.measured).toBe(1)
  })
})

describe('evaluate — negative controls, each reproducing a real defect', () => {
  it('FAILS when asset.copyright is an empty string', () => {
    const chunk = JSON.stringify({ asset: { version: '2.0', copyright: '' } })
    const result = evaluate([{ ...healthy(), jsonChunk: chunk }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('copyright')
  })

  it('FAILS when asset.copyright is missing entirely', () => {
    const chunk = JSON.stringify({ asset: { version: '2.0' } })
    const result = evaluate([{ ...healthy(), jsonChunk: chunk }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('copyright')
  })

  it('FAILS and names the field when "Marvelous Designer" appears in an unrelated string, e.g. a stray material name', () => {
    const chunk = JSON.stringify({
      asset: { version: '2.0', copyright: '© RUN Apparel. All rights reserved.' },
      materials: [{ name: 'Marvelous Designer Fabric 04' }],
    })
    const result = evaluate([{ ...healthy(), jsonChunk: chunk }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]?.toLowerCase()).toContain('marvelous')
  })

  it.each(['clo3d', 'CLO Standalone', 'clo virtual', 'Style3D'])(
    'FAILS case-insensitively on the blocklist string %s',
    (needle) => {
      const chunk = JSON.stringify({
        asset: { version: '2.0', copyright: 'ok', generator: `exported by ${needle}` },
      })
      const result = evaluate([{ ...healthy(), jsonChunk: chunk }])
      expect(result.ok).toBe(false)
    },
  )
})

describe('evaluate — what must NOT be read as a pass', () => {
  it('reads a 403/429/503 as inconclusive, never a pass or a failure', () => {
    for (const status of [403, 429, 503]) {
      const result = evaluate([{ key: 'rxps/wine', status, jsonChunk: '' }])
      expect(result.failures).toEqual([])
      expect(result.inconclusive[0]).toContain(String(status))
      expect(result.measured).toBe(0)
    }
  })

  it('reads an unparseable chunk as inconclusive, not a silent pass', () => {
    const result = evaluate([{ ...healthy(), jsonChunk: '{not json' }])
    expect(result.ok).toBe(true) // ok means "no FAILURES", not "everything measured"
    expect(result.failures).toEqual([])
    expect(result.inconclusive[0]).toContain('unparseable')
    expect(result.measured).toBe(0)
  })

  it('reads a network error as inconclusive', () => {
    const result = evaluate([{ key: 'rxps/wine', error: 'fetch failed' }])
    expect(result.failures).toEqual([])
    expect(result.inconclusive[0]).toContain('fetch failed')
    expect(result.measured).toBe(0)
  })
})
