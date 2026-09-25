import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluate,
  extractGlbJsonChunk,
  findLeftovers,
  judgeModelSizes,
  modelUrlsFromPayload,
  probe,
} from '../../../scripts/glb-provenance-probe.mjs'

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

/**
 * `probe()` itself — a stubbed `fetch`, never production. Only a 206 proves the server
 * honoured the Range header; a 200 answering the same request is the FULL body arriving
 * instead of a bounded slice, and reading it would defeat the whole point of ranging a
 * request against a model that can be tens of MB.
 */
describe('probe — a 200 answering a ranged request is never read as the whole file', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports it distinctly from a genuine failure, and never attempts to parse the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const href = String(url)
        if (href.includes('/api/public/viewer/')) {
          return new Response(
            JSON.stringify({ product: { glbUrl: 'https://media.wear-run.help/fake.glb' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        // The model URL itself: answers 200, ignoring the Range header, instead of 206.
        return new Response('x'.repeat(1000), { status: 200 })
      }),
    )
    const observations = await probe([{ key: 'fake/model', slug: 'fake', colourway: 'model' }])
    const observation = observations[0]
    if (!observation) throw new Error('expected exactly one observation')
    expect(observation.status).toBe(200)
    expect(observation.error).toContain('206')
    expect(observation.jsonChunk).toBeUndefined()

    const result = evaluate([observation])
    expect(result.ok).toBe(true) // inconclusive, never a failure
    expect(result.failures).toEqual([])
    expect(result.measured).toBe(0)
  })
})

/**
 * IM-10 — CLO's leftover KEYS, which the text blocklist cannot see. The allow-list is by
 * name AND place: `depthBias` on a material, `uvRemap` on a mesh primitive, each written by
 * our own pipeline (measured on all 16 live models 2026-09-25: 183 and 1,592 of them, and
 * nothing else in any `extras`).
 */
describe('findLeftovers — structure a string search cannot see (IM-10)', () => {
  const clean = {
    asset: { version: '2.0', copyright: '© RUN Apparel. All rights reserved.' },
    materials: [{ name: 'Print', extras: { depthBias: -8 } }],
    meshes: [{ primitives: [{ attributes: {}, extras: { uvRemap: { offset: [0, 0] } } }] }],
    images: [{ uri: 'texture.webp' }],
  }

  it('passes a model carrying only our own two extras keys, each in its own place', () => {
    expect(findLeftovers(clean)).toEqual([])
  })

  it('FAILS on a CLO key anywhere, e.g. a MetaData block', () => {
    const hits = findLeftovers({ ...clean, extras: { MetaData: { author: 'x' } } })
    expect(hits.join(' ')).toContain('MetaData')
  })

  it('FAILS on each CLO key it names', () => {
    for (const key of ['globalMap', 'PhysicalPropertyList', 'SeamLinePairList', 'MetaData']) {
      expect(findLeftovers({ scenes: [{ [key]: {} }] }).join(' ')).toContain(key)
    }
  })

  it("FAILS on a raw drive path, the author's disk leaking into the file", () => {
    const hits = findLeftovers({ ...clean, images: [{ uri: 'D:/CLO/export/print.png' }] })
    expect(hits).toEqual(['images[0].uri (a raw drive path)'])
  })

  it('FAILS on an allowed key in the WRONG place: depthBias on a primitive', () => {
    const hits = findLeftovers({
      ...clean,
      meshes: [{ primitives: [{ extras: { depthBias: -8 } }] }],
    })
    expect(hits.join(' ')).toContain('meshes[0].primitives[0].extras.depthBias')
  })

  it('FAILS on any other extras key, so extras is never allow-listed wholesale', () => {
    const hits = findLeftovers({
      ...clean,
      materials: [{ extras: { depthBias: -8, cloFabric: 3 } }],
    })
    expect(hits).toEqual(['materials[0].extras.cloFabric (unexpected extras key)'])
  })
})

describe('modelUrlsFromPayload — every colourway, not only the default (IM-10)', () => {
  it('reads the shared file in single-GLB mode, once', () => {
    expect(
      modelUrlsFromPayload({
        product: { glbUrl: 'https://m/a.glb' },
        colourways: [{ glbUrl: null }, { glbUrl: null }],
      }),
    ).toEqual(['https://m/a.glb'])
  })

  it("reads each colourway's own file in separate-file mode", () => {
    expect(
      modelUrlsFromPayload({
        product: { glbUrl: null },
        colourways: [{ glbUrl: 'https://m/1.glb' }, { glbUrl: 'https://m/2.glb' }],
      }),
    ).toEqual(['https://m/1.glb', 'https://m/2.glb'])
  })

  it('is empty when the payload names no model', () => {
    expect(modelUrlsFromPayload({ product: {} })).toEqual([])
  })
})

describe("judgeModelSizes — the posters' family-median rule, for models (IM-02b)", () => {
  const MB = 1e6
  it('passes the live catalogue as measured 2026-09-25 (worst 1.66x its family median)', () => {
    const live = [
      ['rxps', 'Teamwear', 3.84],
      ['r-xmp', 'Teamwear', 8.14],
      ['r-mm', 'Teamwear', 4.42],
      ['r-aj', 'Teamwear', 5.14],
      ['r-ajm', 'Teamwear', 7.83],
      ['r-css', 'Teamwear', 5.05],
      ['r-gtd', 'Teamwear', 5.11],
      ['r-au', 'Teamwear', 7.85],
      ['r-afp', 'Sportswear', 1.89],
      ['r-wzu', 'Sportswear', 4.23],
      ['r-asb', 'Sportswear', 2.58],
      ['r-ect', 'Sportswear', 5.64],
    ] as const
    const result = judgeModelSizes(
      live.map(([key, family, mb]) => ({ key, family, bytes: mb * MB })),
    )
    expect(result.flagged).toEqual([])
  })

  it('FLAGS a model three times its family median', () => {
    const result = judgeModelSizes([
      { key: 'a', family: 'Sportswear', bytes: 2 * MB },
      { key: 'b', family: 'Sportswear', bytes: 2 * MB },
      { key: 'c', family: 'Sportswear', bytes: 6 * MB },
    ])
    expect(result.flagged.map((row) => row.slug)).toEqual(['c'])
  })

  it("never lets the vest's poster exception excuse a model", () => {
    const result = judgeModelSizes([
      { key: 'r-wzu/blush', slug: 'r-wzu', family: 'Sportswear', bytes: 5 * MB },
      { key: 'x', family: 'Sportswear', bytes: 2 * MB },
      { key: 'y', family: 'Sportswear', bytes: 2 * MB },
    ])
    // 2.5x its family median: inside the poster exception's 3x, so only `exceptions: []`
    // flags it.
    expect(result.flagged.map((row) => row.slug)).toEqual(['r-wzu'])
  })
})

describe('evaluate — leftovers and the edge cache (IM-10)', () => {
  const ok = { key: 'p/c', status: 206, jsonChunk: HEALTHY_JSON }

  it('passes a clean model served from the edge on the repeat GET', () => {
    expect(evaluate([{ ...ok, cache: ['MISS', 'HIT'] }]).ok).toBe(true)
  })

  it('FAILS a model the edge never caches', () => {
    const result = evaluate([{ ...ok, cache: ['MISS', 'MISS'] }])
    expect(result.ok).toBe(false)
    expect(result.failures.join(' ')).toContain('not served from the edge cache')
  })

  it('FAILS a model carrying a CLO key, even with a clean copyright', () => {
    const chunk = JSON.stringify({ ...JSON.parse(HEALTHY_JSON), globalMap: {} })
    const result = evaluate([{ ...ok, jsonChunk: chunk, cache: ['HIT', 'HIT'] }])
    expect(result.ok).toBe(false)
    expect(result.failures.join(' ')).toContain('globalMap')
  })
})
