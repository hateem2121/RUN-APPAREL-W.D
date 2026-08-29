import { describe, expect, it } from 'vitest'
import {
  type GltfForBytes,
  accessorBytes,
  attributeBytes,
  formatAttributeBytes,
  formatVram,
  summariseVram,
  textureVramBytes,
} from './attribute-bytes'

/**
 * ⚠️ THE MOST IMPORTANT TEST IN THIS FILE IS `plausible`. The first version of this
 * measurement reported 208 MB of indices inside a 16.56 MB file — it summed per accessor
 * where many accessors share one bufferView. Nothing flagged it; it was caught only
 * because the number was physically impossible. Every assertion about "what a garment is
 * made of" is worthless without that check, so it is pinned here in both directions.
 */

/** Two accessors sharing ONE bufferView — the shape that broke the first version. */
const shared: GltfForBytes = {
  accessors: [
    { bufferView: 0, componentType: 5126, count: 100, type: 'VEC2' },
    { bufferView: 0, componentType: 5126, count: 100, type: 'VEC2' },
    { bufferView: 1, componentType: 5123, count: 300, type: 'SCALAR' },
  ],
  bufferViews: [{ byteLength: 800 }, { byteLength: 600 }],
  meshes: [
    {
      primitives: [
        { attributes: { TEXCOORD_0: 0 }, indices: 2 },
        { attributes: { TEXCOORD_0: 1 }, indices: 2 },
      ],
    },
  ],
}

describe('attributeBytes', () => {
  it('⚠️ counts a shared bufferView ONCE, however many accessors read it', () => {
    /*
     * THE REGRESSION THIS EXISTS FOR. Two primitives read the same 800-byte view. Summing
     * per accessor gives 1,600 and inflates the whole report; the answer is 800.
     */
    const result = attributeBytes(shared, 10_000)

    expect(result.bySemantic.TEXCOORD).toBe(800)
    expect(result.bySemantic.INDICES).toBe(600)
    expect(result.geometryBytes).toBe(1400)
  })

  it('merges TEXCOORD_0 and TEXCOORD_1 into one line', () => {
    // The question is "how much of this garment is UVs", not "how many UV sets".
    const twoSets: GltfForBytes = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 10, type: 'VEC2' },
        { bufferView: 1, componentType: 5126, count: 10, type: 'VEC2' },
      ],
      bufferViews: [{ byteLength: 80 }, { byteLength: 80 }],
      meshes: [{ primitives: [{ attributes: { TEXCOORD_0: 0, TEXCOORD_1: 1 } }] }],
    }
    expect(attributeBytes(twoSets, 10_000).bySemantic.TEXCOORD).toBe(160)
  })

  it('reads the COMPRESSED size when meshopt is present, not the decompressed one', () => {
    /*
     * With EXT_meshopt_compression the extension's byteLength is what is on disk and the
     * outer one is what it expands to. Reading the outer figure would overstate every
     * garment in the catalogue, since production ships meshopt.
     */
    const compressed: GltfForBytes = {
      accessors: [{ bufferView: 0, componentType: 5126, count: 100, type: 'VEC3' }],
      bufferViews: [
        { byteLength: 1200, extensions: { EXT_meshopt_compression: { byteLength: 300 } } },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    }
    expect(attributeBytes(compressed, 10_000).bySemantic.POSITION).toBe(300)
  })

  it('counts embedded images separately from geometry', () => {
    const withImage: GltfForBytes = {
      ...shared,
      images: [{ bufferView: 2, mimeType: 'image/webp' }],
      bufferViews: [{ byteLength: 800 }, { byteLength: 600 }, { byteLength: 5000 }],
    }
    const result = attributeBytes(withImage, 10_000)
    expect(result.imageBytes).toBe(5000)
    expect(result.geometryBytes).toBe(1400)
  })

  it('⚠️ CONTROL: reports implausible when the parts exceed the whole', () => {
    // The 208-MB-in-a-16-MB-file case. A caller must be able to tell it is wrong.
    expect(attributeBytes(shared, 100).plausible).toBe(false)
  })

  it('⚠️ CONTROL: reports plausible when they do not', () => {
    // A check that can only ever fail is not a check.
    expect(attributeBytes(shared, 10_000).plausible).toBe(true)
  })

  it('treats an unknown file size as not plausible rather than assuming', () => {
    expect(attributeBytes(shared, 0).plausible).toBe(false)
  })

  it('survives a file with no meshes at all', () => {
    const empty = attributeBytes({}, 1000)
    expect(empty.geometryBytes).toBe(0)
    expect(empty.bySemantic).toEqual({})
  })
})

describe('formatAttributeBytes', () => {
  it('lists the biggest part first, with its share', () => {
    const lines = formatAttributeBytes(attributeBytes(shared, 10_000))
    expect(lines[0]).toContain('Made of:')
    expect(lines[1]).toContain('TEXCOORD')
    expect(lines[1]).toContain('57.1%')
  })

  it('⚠️ REFUSES to print numbers it cannot justify', () => {
    /*
     * The alternative is a confident, wrong table — which is how the original 208 MB
     * figure would have reached a report and been believed.
     */
    const lines = formatAttributeBytes(attributeBytes(shared, 100))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('not reported')
    expect(lines[0]).not.toContain('MB')
  })
})

describe('textureVramBytes', () => {
  it('is width x height x 4, plus a third for mipmaps', () => {
    // A 40 MB file ceiling is a DOWNLOAD limit. This is the number a phone runs out of.
    expect(textureVramBytes(1024, 1024)).toBe(Math.round(1024 * 1024 * 4 * (4 / 3)))
  })

  it('shows why a small file can still sink a phone', () => {
    /*
     * One measured real texture: 969 KB on disk, 14,576 x 10,295 pixels. That unpacks to
     * ~800 MB of graphics memory, and one garment carried six of them.
     */
    expect(textureVramBytes(14576, 10295)).toBeGreaterThan(700 * 1024 * 1024)
  })
})

describe('accessorBytes', () => {
  it('multiplies count by components by component size', () => {
    expect(accessorBytes({ componentType: 5126, count: 100, type: 'VEC2' })).toBe(800)
    expect(accessorBytes({ componentType: 5123, count: 100, type: 'VEC2' })).toBe(400)
  })

  it('returns 0 for an accessor the file does not describe, rather than NaN', () => {
    // NaN propagates silently through a total and makes the whole report meaningless.
    expect(accessorBytes({})).toBe(0)
    expect(accessorBytes({ componentType: 9999, count: 10, type: 'VEC2' })).toBe(0)
  })
})

describe('summariseVram', () => {
  const tex = (name: string, width: number | null, height: number | null) => ({
    name,
    width,
    height,
  })

  it('adds up what the textures cost on the graphics chip', () => {
    const summary = summariseVram([tex('a', 1024, 1024), tex('b', 512, 512)])
    expect(summary.totalBytes).toBe(textureVramBytes(1024, 1024) + textureVramBytes(512, 512))
  })

  it('names the heaviest, because that is where the memory actually goes', () => {
    const summary = summariseVram([tex('small', 64, 64), tex('huge', 4096, 4096)])
    expect(summary.heaviest[0]?.name).toBe('huge')
  })

  it('⚠️ COUNTS what it could not measure, rather than quietly omitting it', () => {
    /*
     * THE FAILURE THIS PROJECT KEEPS PAYING FOR. A texture with no readable dimensions
     * contributes nothing to the total, so a file full of unreadable images reports a
     * reassuringly small number and looks safe. The count has to travel with the total.
     */
    const summary = summariseVram([tex('ok', 512, 512), tex('broken', null, null)])
    expect(summary.unmeasured).toBe(1)
    expect(summary.heaviest).toHaveLength(1)
  })

  it('treats a zero dimension as unmeasured, not as a free texture', () => {
    expect(summariseVram([tex('zero', 0, 512)]).unmeasured).toBe(1)
  })
})

describe('formatVram', () => {
  it('states the expansion, because the two numbers are unrelated', () => {
    const lines = formatVram(summariseVram([{ name: 'x', width: 2048, height: 2048 }]), 5_000_000)
    expect(lines[0]).toContain('graphics memory')
    expect(lines[0]).toContain('x the')
    expect(lines[0]).toContain('only the second one is capped anywhere')
  })

  it('⚠️ says so loudly when nothing could be measured', () => {
    // Silence here would read as "no textures", which is a different and safer thing.
    expect(formatVram(summariseVram([{ name: 'x', width: null, height: null }]), 100)[0]).toContain(
      'not measured',
    )
  })

  it('warns when part of the total is missing', () => {
    const lines = formatVram(
      summariseVram([
        { name: 'ok', width: 512, height: 512 },
        { name: 'bad', width: null, height: null },
      ]),
      1_000_000,
    )
    expect(lines.some((l) => l.includes('NOT in that total'))).toBe(true)
  })
})
