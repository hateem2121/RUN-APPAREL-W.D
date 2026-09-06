import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { binChunkSha256, stripLiveMetadata } from './strip-live-metadata'

/**
 * Build a GLB by hand so the tests own every byte. The BIN payload is deliberately
 * NOT valid geometry — nothing here decodes it, and that is the point: this module
 * must copy those bytes without looking at them.
 */
function glb(json: object, bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json))
  const pad = (4 - (encoded.byteLength % 4)) % 4
  const jsonChunk = new Uint8Array(encoded.byteLength + pad)
  jsonChunk.set(encoded)
  jsonChunk.fill(0x20, encoded.byteLength)
  const total = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonChunk.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.set(jsonChunk, 20)
  const binStart = 20 + jsonChunk.byteLength
  view.setUint32(binStart, bin.byteLength, true)
  view.setUint32(binStart + 4, 0x004e4942, true)
  out.set(bin, binStart + 8)
  return out
}

const laden = () =>
  glb({
    asset: { generator: 'glTF-Transform v4.4.2', version: '2.0' },
    extras: {
      MetaData: {
        PhysicalPropertyList: [
          { PhysicalPropertyName: 'Woven Elastic_0', 'Stretch-Warp': 3700000 },
        ],
        SeamLinePairList: [[3, 9]],
        globalMap: { FilePath: 'D:/New File/X-MILO PRO BIB/SUPPLIER_A_BASE.png' },
      },
    },
    materials: [{ name: 'Material_Graphic__overlay', extras: { depthBias: { factor: -8 } } }],
    meshes: [{ primitives: [{ extras: { uvRemap: { originalTexCoord: 1 } } }] }],
  })

const parseJson = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)))
}

describe('stripLiveMetadata', () => {
  it('removes root extras and shrinks the file', () => {
    const before = laden()
    const { output, result } = stripLiveMetadata(before, '© RUN Apparel')
    expect(result.removedKeys).toEqual(['MetaData'])
    expect(result.after).toBeLessThan(result.before)
    expect(parseJson(output).extras).toBeUndefined()
  })

  /**
   * ⚠️ THE ASSERTION THE WHOLE MODULE EXISTS TO EARN. These files are meshopt
   * compressed; the root CLAUDE.md forbids running the pipeline on its own output
   * because a decode/re-encode silently loses artwork protection. This is only safe
   * because the geometry is copied, never touched.
   */
  it('leaves the BIN chunk byte-for-byte identical', () => {
    const bin = new Uint8Array(1024).map((_, i) => (i * 7) % 251)
    const before = glb(
      { asset: { version: '2.0' }, extras: { MetaData: { a: 'x'.repeat(400) } } },
      bin,
    )
    const { output } = stripLiveMetadata(before, null)
    expect(binChunkSha256(output)).toBe(binChunkSha256(before))
    expect(binChunkSha256(output)).toBe(createHash('sha256').update(bin).digest('hex'))
  })

  it('keeps material and primitive extras — only the ROOT is stripped', () => {
    const { output } = stripLiveMetadata(laden(), null)
    const doc = parseJson(output)
    expect(doc.materials[0].extras).toEqual({ depthBias: { factor: -8 } })
    expect(doc.meshes[0].primitives[0].extras).toEqual({ uvRemap: { originalTexCoord: 1 } })
  })

  it('rewrites both lengths so the file is still parseable', () => {
    const { output } = stripLiveMetadata(laden(), '© RUN Apparel')
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength)
    expect(view.getUint32(0, true), 'magic').toBe(0x46546c67)
    expect(view.getUint32(8, true), 'total length header must match the real length').toBe(
      output.byteLength,
    )
    const jsonLength = view.getUint32(12, true)
    expect(jsonLength % 4, 'the JSON chunk must stay 4-byte aligned').toBe(0)
    // The BIN chunk header must land exactly where the new JSON chunk ends.
    expect(view.getUint32(20 + jsonLength + 4, true), 'BIN chunk type').toBe(0x004e4942)
  })

  it('adds a copyright, and never overwrites one', () => {
    const { output } = stripLiveMetadata(laden(), '© RUN Apparel')
    expect(parseJson(output).asset.copyright).toBe('© RUN Apparel')

    const owned = glb({ asset: { version: '2.0', copyright: '© Someone Else' }, extras: { M: 1 } })
    const second = stripLiveMetadata(owned, '© RUN Apparel')
    expect(parseJson(second.output).asset.copyright).toBe('© Someone Else')
    expect(second.result.copyrightSet).toBe(false)
  })

  it('returns the input untouched when there is nothing to do', () => {
    // Every already-clean garment takes this path. Rewriting it anyway would mint a
    // new object for no reason and invite a needless cache purge.
    const clean = glb({ asset: { version: '2.0', copyright: '© RUN Apparel' } })
    const { output, result } = stripLiveMetadata(clean, '© RUN Apparel')
    expect(result.removedKeys).toEqual([])
    expect(result.before).toBe(result.after)
    expect(output).toBe(clean)
  })

  it('refuses anything that is not a GLB rather than writing nonsense', () => {
    expect(() => stripLiveMetadata(new Uint8Array([1, 2, 3, 4]), null)).toThrow(/not a GLB/)
    expect(() => stripLiveMetadata(new Uint8Array(), null)).toThrow(/not a GLB/)
  })

  it('handles a GLB with no BIN chunk at all', () => {
    const encoded = new TextEncoder().encode(
      JSON.stringify({ asset: { version: '2.0' }, extras: { M: 1 } }),
    )
    const pad = (4 - (encoded.byteLength % 4)) % 4
    const chunk = new Uint8Array(encoded.byteLength + pad)
    chunk.set(encoded)
    chunk.fill(0x20, encoded.byteLength)
    const total = 12 + 8 + chunk.byteLength
    const bytes = new Uint8Array(total)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, total, true)
    view.setUint32(12, chunk.byteLength, true)
    view.setUint32(16, 0x4e4f534a, true)
    bytes.set(chunk, 20)
    const { output, result } = stripLiveMetadata(bytes, null)
    expect(result.removedKeys).toEqual(['M'])
    expect(parseJson(output).extras).toBeUndefined()
  })

  it('the BIN comparison can FAIL (negative control)', () => {
    // Without this, `binChunkSha256` returning a constant would make the identity
    // assertion above pass on any input at all.
    const a = glb({ asset: { version: '2.0' } }, new Uint8Array([1, 1, 1, 1]))
    const b = glb({ asset: { version: '2.0' } }, new Uint8Array([1, 1, 1, 2]))
    expect(binChunkSha256(a)).not.toBe(binChunkSha256(b))
  })
})
