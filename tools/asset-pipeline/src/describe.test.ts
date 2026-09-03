import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeGlb, imageDimensions } from './describe'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'describe-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

/**
 * Write a GLB from a hand-built glTF JSON object.
 *
 * DELIBERATELY NOT gltf-transform. Its writer normalises the JSON — it fills in
 * `metallicFactor`, rewrites `asset.generator`, and re-packs bufferViews. Every
 * defect this module has to see is a shape CLO emits and gltf-transform would
 * tidy away. This is the repo's own rule: if production emits it, seed it.
 */
async function writeGlb(file: string, gltf: object, binBytes = 0): Promise<void> {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8')
  const jsonPad = (4 - (json.length % 4)) % 4
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)])
  const binPad = (4 - (binBytes % 4)) % 4
  const binChunk = Buffer.alloc(binBytes + binPad)
  const total = 12 + 8 + jsonChunk.length + (binBytes ? 8 + binChunk.length : 0)

  const head = Buffer.alloc(12)
  head.writeUInt32LE(0x46546c67, 0) // 'glTF'
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(total, 8)

  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(jsonChunk.length, 0)
  jsonHead.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

  const parts = [head, jsonHead, jsonChunk]
  if (binBytes) {
    const binHead = Buffer.alloc(8)
    binHead.writeUInt32LE(binChunk.length, 0)
    binHead.writeUInt32LE(0x004e4942, 4) // 'BIN\0'
    parts.push(binHead, binChunk)
  }
  await writeFile(file, Buffer.concat(parts))
}

/** The shape `women athlatic dress` has: 335 MB of pictures, 9,980 triangles. */
// biome-ignore lint/suspicious/noExplicitAny: hand-built glTF JSON, deliberately untyped
function textureHeavyGltf(): any {
  return {
    asset: { version: '2.0', generator: 'CLO Standalone OnlineAuth 2025.2.236' },
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 1000 }, // 0: image
      { buffer: 0, byteOffset: 1000, byteLength: 1000 }, // 1: image
      { buffer: 0, byteOffset: 2000, byteLength: 12 }, // 2: indices
      { buffer: 0, byteOffset: 2012, byteLength: 36 }, // 3: positions
    ],
    // CLO leaves EVERY image anonymous — no name, no uri. Measured: 0 of 5,048.
    images: [
      { bufferView: 0, mimeType: 'image/png' },
      { bufferView: 1, mimeType: 'image/png' },
    ],
    accessors: [
      { bufferView: 2, componentType: 5125, count: 6, type: 'SCALAR' },
      { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    meshes: [
      {
        name: 'Cloth_mesh',
        primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }],
      },
    ],
    materials: [{ name: 'Cotton_Canvas_2961', pbrMetallicRoughness: { metallicFactor: 0 } }],
    buffers: [{ byteLength: 2048 }],
  }
}

describe('describeGlb — family classification', () => {
  it('calls a file that is mostly pictures TEXTURE', async () => {
    const file = join(dir, 'texture.glb')
    await writeGlb(file, textureHeavyGltf(), 2048)
    const d = await describeGlb(file)
    expect(d.error).toBeNull()
    expect(d.family).toBe('texture')
    expect(d.textureBytes).toBe(2000)
    expect(d.geometryBytes).toBe(48)
    expect(d.textureFraction).toBeGreaterThan(0.6)
  })

  it('calls a file that is mostly mesh GEOMETRY', async () => {
    const g = textureHeavyGltf()
    g.bufferViews[0].byteLength = 10
    g.bufferViews[1].byteLength = 10
    g.bufferViews[3].byteLength = 4000
    const file = join(dir, 'geometry.glb')
    await writeGlb(file, g, 4096)
    const d = await describeGlb(file)
    expect(d.family).toBe('geometry')
    expect(d.textureFraction).toBeLessThan(0.4)
  })

  it('calls the band between the two thresholds MIXED', async () => {
    // Mantra Ray Proflex measured 50.2% and is the one real file in this band.
    const g = textureHeavyGltf()
    g.bufferViews[0].byteLength = 500
    g.bufferViews[1].byteLength = 500
    g.bufferViews[2].byteLength = 12
    g.bufferViews[3].byteLength = 988
    const file = join(dir, 'mixed.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.family).toBe('mixed')
  })
})

describe('describeGlb — triangles and topstitch', () => {
  it('counts indexed triangles and attributes them to topstitch by mesh name', async () => {
    const g = textureHeavyGltf()
    g.accessors.push({ bufferView: 2, componentType: 5125, count: 300, type: 'SCALAR' })
    g.meshes.push({
      name: 'Topstitch_01',
      primitives: [{ attributes: { POSITION: 1 }, indices: 2, material: 0 }],
    })
    const file = join(dir, 'stitch.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.triangles).toBe(102) // 6/3 cloth + 300/3 stitch
    expect(d.stitchTriangles).toBe(100)
    expect(d.stitchFraction).toBeCloseTo(100 / 102, 5)
  })

  it('counts NON-indexed triangles from POSITION count', async () => {
    const g = textureHeavyGltf()
    delete g.meshes[0].primitives[0].indices
    const file = join(dir, 'nonindexed.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.triangles).toBe(1) // POSITION count 3 -> 1 triangle
  })

  it('ignores primitives that are not triangles (mode !== 4)', async () => {
    const g = textureHeavyGltf()
    g.meshes[0].primitives[0].mode = 1 // LINES
    const file = join(dir, 'lines.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.triangles).toBe(0)
    expect(d.stitchFraction).toBe(0) // must not divide by zero
  })

  it('falls back to NODE names when meshes are unnamed', async () => {
    const g = textureHeavyGltf()
    g.meshes[0].name = ''
    g.nodes = [{ name: 'Topstitch_Hem', mesh: 0 }]
    const file = join(dir, 'nodename.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.stitchTriangles).toBe(2)
  })
})

describe('describeGlb — the material census', () => {
  it('counts alpha modes the way CLO actually emits them', async () => {
    // Measured across all 28 exports: 0 MASK, 4,200 BLEND. OPAQUE is the glTF
    // default when alphaMode is absent, which is how CLO writes solid fabric.
    const g = textureHeavyGltf()
    g.materials = [
      { name: 'A', pbrMetallicRoughness: { metallicFactor: 0 } },
      { name: 'B', alphaMode: 'BLEND', pbrMetallicRoughness: { metallicFactor: 0 } },
      {
        name: 'C',
        alphaMode: 'BLEND',
        doubleSided: true,
        pbrMetallicRoughness: { metallicFactor: 0 },
      },
      { name: 'D', alphaMode: 'MASK', pbrMetallicRoughness: { metallicFactor: 0 } },
    ]
    const file = join(dir, 'alpha.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.materials).toEqual({ total: 4, opaque: 1, blend: 2, mask: 1, doubleSided: 1 })
  })

  it('counts images and how many carry a name or URI', async () => {
    const g = textureHeavyGltf()
    g.images = [
      { bufferView: 0, mimeType: 'image/png' },
      { bufferView: 1, mimeType: 'image/png', name: 'RUN LOGO' },
    ]
    const file = join(dir, 'named.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.images).toEqual({ total: 2, named: 1 })
  })
})

describe('describeGlb — PBR suspects', () => {
  it('flags a FABRIC material that is metallic with no metallicRoughnessTexture', async () => {
    // METRO-SHIELD SUIT's real shape: metallicFactor ABSENT, which glTF defaults
    // to 1.0, and roughness 0.10 — a mirror. No MR texture to override it.
    const g = textureHeavyGltf()
    g.materials = [
      { name: 'Nylon_Canvas Copy 1_5511', pbrMetallicRoughness: { roughnessFactor: 0.1 } },
    ]
    const file = join(dir, 'suspect.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(1)
    expect(d.pbrSuspects[0]).toEqual({
      index: 0,
      name: 'Nylon_Canvas Copy 1_5511',
      metallicFactor: 1,
      roughnessFactor: 0.1,
    })
  })

  it('does NOT flag a material that carries a metallicRoughnessTexture', async () => {
    // THE LOAD-BEARING NEGATIVE CONTROL. 3,593 materials are metallic-by-omission
    // AND carry an MR texture whose BLUE channel supplies metalness per pixel.
    // Counting those is what produced the false "hundreds of materials" figure.
    const g = textureHeavyGltf()
    g.materials = [
      {
        name: 'Nylon_Canvas Copy 1_5511',
        pbrMetallicRoughness: { roughnessFactor: 0.1, metallicRoughnessTexture: { index: 0 } },
      },
    ]
    const file = join(dir, 'mrtex.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
  })

  it('does NOT flag hardware, which is legitimately metal', async () => {
    // 440 of the 515 metallic-with-no-texture materials are these.
    const g = textureHeavyGltf()
    g.materials = [{ name: 'Zipper 1_Slider_3582', pbrMetallicRoughness: { roughnessFactor: 0.2 } }]
    const file = join(dir, 'hardware.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
    expect(d.unclassifiedMetallic).toHaveLength(0)
  })

  it('does NOT flag an unclassified name, and reports it separately instead', async () => {
    // Owner decision 2026-08-26: Trim is reported, never rewritten.
    const g = textureHeavyGltf()
    g.materials = [{ name: 'Trim_0091', pbrMetallicRoughness: { roughnessFactor: 0.1 } }]
    const file = join(dir, 'trim.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
    expect(d.unclassifiedMetallic).toEqual([
      { index: 0, name: 'Trim_0091', metallicFactor: 1, roughnessFactor: 0.1 },
    ])
  })

  it('does NOT flag fabric that is already correctly non-metallic', async () => {
    const g = textureHeavyGltf() // Cotton_Canvas_2961 at metallicFactor 0
    const file = join(dir, 'clean.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
  })
})

describe('describeGlb — colourways', () => {
  it('reads KHR_materials_variants and whether every primitive is mapped', async () => {
    const g = textureHeavyGltf()
    g.extensions = {
      KHR_materials_variants: { variants: [{ name: 'Colorway 1' }, { name: 'Colorway 2' }] },
    }
    g.meshes[0].primitives[0].extensions = {
      KHR_materials_variants: { mappings: [{ material: 0, variants: [0] }] },
    }
    const file = join(dir, 'variants.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.colourways.count).toBe(2)
    expect(d.colourways.names).toEqual(['Colorway 1', 'Colorway 2'])
    expect(d.colourways.fullyMapped).toBe(true)
  })

  it('reports fullyMapped false when some primitive has no mapping', async () => {
    const g = textureHeavyGltf()
    g.extensions = { KHR_materials_variants: { variants: [{ name: 'Colorway 1' }] } }
    g.meshes.push({
      name: 'Unmapped',
      primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }],
    })
    const file = join(dir, 'partial.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.colourways.fullyMapped).toBe(false)
  })
})

describe('describeGlb — never throws', () => {
  // "one bad garment cannot break a batch readout" — the design's error rule.
  it('returns an error for a file that is not a GLB', async () => {
    const file = join(dir, 'notglb.glb')
    await writeFile(file, Buffer.from('this is not a GLB at all'))
    const d = await describeGlb(file)
    expect(d.error).toMatch(/not a GLB/i)
    expect(d.family).toBe('mixed')
  })

  it('returns an error for a file that does not exist', async () => {
    const d = await describeGlb(join(dir, 'nope.glb'))
    expect(d.error).toBeTruthy()
  })

  it('returns an error for a truncated header', async () => {
    const file = join(dir, 'short.glb')
    await writeFile(file, Buffer.alloc(8))
    const d = await describeGlb(file)
    expect(d.error).toBeTruthy()
  })

  it('returns an error for malformed JSON in the chunk', async () => {
    const file = join(dir, 'badjson.glb')
    const json = Buffer.from('{ this is not json', 'utf8')
    const head = Buffer.alloc(12)
    head.writeUInt32LE(0x46546c67, 0)
    head.writeUInt32LE(2, 4)
    head.writeUInt32LE(20 + json.length, 8)
    const jh = Buffer.alloc(8)
    jh.writeUInt32LE(json.length, 0)
    jh.writeUInt32LE(0x4e4f534a, 4)
    await writeFile(file, Buffer.concat([head, jh, json]))
    const d = await describeGlb(file)
    expect(d.error).toBeTruthy()
  })

  it('refuses a JSON chunk longer than the file, rather than allocating it', async () => {
    // A corrupt length field must not become a multi-gigabyte Buffer.alloc.
    const file = join(dir, 'lying.glb')
    const head = Buffer.alloc(12)
    head.writeUInt32LE(0x46546c67, 0)
    head.writeUInt32LE(2, 4)
    head.writeUInt32LE(100, 8)
    const jh = Buffer.alloc(8)
    jh.writeUInt32LE(0xfffffff0, 0) // claims ~4 GB
    jh.writeUInt32LE(0x4e4f534a, 4)
    await writeFile(file, Buffer.concat([head, jh, Buffer.alloc(80)]))
    const d = await describeGlb(file)
    expect(d.error).toBeTruthy()
  })

  it('reports the real byte size from the filesystem, not the header', async () => {
    const file = join(dir, 'size.glb')
    await writeGlb(file, textureHeavyGltf(), 2048)
    const d = await describeGlb(file)
    expect(d.bytes).toBeGreaterThan(2048)
  })

  it('reports the CLO generator string', async () => {
    const file = join(dir, 'gen.glb')
    await writeGlb(file, textureHeavyGltf(), 2048)
    const d = await describeGlb(file)
    expect(d.generator).toBe('CLO Standalone OnlineAuth 2025.2.236')
  })
})

/**
 * THE FAMILY BY GPU MEMORY (fix plan Rank 10, audit F2-10). A picture is compressed on
 * the wire and uncompressed on the GPU, so a small PNG of many pixels is a big phone
 * problem the byte fraction cannot see. Where every image header is readable the GPU
 * fraction decides; where it is not, bytes decide and the reason says so.
 */
describe('describeGlb — the family judged by GPU memory', () => {
  const glbWith = async (file: string, png: Buffer, geometryBytes: number) => {
    const pad = (4 - (png.length % 4)) % 4
    const bin = Buffer.concat([png, Buffer.alloc(pad), Buffer.alloc(geometryBytes)])
    const gltf = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: png.length },
        { buffer: 0, byteOffset: png.length + pad, byteLength: geometryBytes },
      ],
      images: [{ bufferView: 0, mimeType: 'image/png' }],
      textures: [{ source: 0 }],
      accessors: [
        { bufferView: 1, componentType: 5126, count: Math.floor(geometryBytes / 12), type: 'VEC3' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    }
    const json = Buffer.from(JSON.stringify(gltf))
    const jsonPad = (4 - (json.length % 4)) % 4
    const header = Buffer.alloc(12)
    header.writeUInt32LE(0x46546c67, 0)
    header.writeUInt32LE(2, 4)
    header.writeUInt32LE(12 + 8 + json.length + jsonPad + 8 + bin.length, 8)
    const jsonChunk = Buffer.alloc(8)
    jsonChunk.writeUInt32LE(json.length + jsonPad, 0)
    jsonChunk.writeUInt32LE(0x4e4f534a, 4)
    const binChunk = Buffer.alloc(8)
    binChunk.writeUInt32LE(bin.length, 0)
    binChunk.writeUInt32LE(0x004e4942, 4)
    await writeFile(
      file,
      Buffer.concat([header, jsonChunk, json, Buffer.alloc(jsonPad, 0x20), binChunk, bin]),
    )
  }

  it('reports the GPU share beside a family that stays decided by bytes', async () => {
    // A 512x512 solid PNG is a few hundred bytes on disk and 1.4 MB on a GPU.
    const png = await sharp({
      create: { width: 512, height: 512, channels: 3, background: '#808080' },
    })
      .png()
      .toBuffer()
    const file = join(dir, 'gpu-texture.glb')
    await glbWith(file, png, 200_000)
    const d = await describeGlb(file)
    expect(d.textureFraction).toBeLessThan(0.4) // bytes: geometry-heavy
    expect(d.imagesMeasured).toBe(1)
    expect(d.textureGpuBytes).toBe(Math.round(512 * 512 * 4 * (4 / 3)))
    // Every raw CLO export is 74–100% pictures by GPU memory, so the share cannot pick a
    // family; the file stays geometry by bytes and the reason carries both numbers.
    expect(d.family).toBe('geometry')
    expect(d.gpuTextureFraction).toBeGreaterThan(0.8)
    expect(d.familyReason).toContain('geometry by file bytes')
    expect(d.familyReason).toContain('% of GPU memory (1 MB before resizing)')
  })

  it('says so when an image header cannot be read', async () => {
    const file = join(dir, 'gpu-unreadable.glb')
    await glbWith(file, Buffer.alloc(300), 200_000) // no PNG signature
    const d = await describeGlb(file)
    expect(d.imagesMeasured).toBe(0)
    expect(d.family).toBe('geometry')
    expect(d.familyReason).toContain('0 of 1 image header(s) readable')
  })

  it('reads PNG, WebP and JPEG headers without decoding', async () => {
    const make = (format: 'png' | 'webp' | 'jpeg') =>
      sharp({ create: { width: 33, height: 17, channels: 3, background: '#fff' } })
        [format]()
        .toBuffer()
    expect(imageDimensions(await make('png'))).toEqual({ width: 33, height: 17 })
    expect(imageDimensions(await make('webp'))).toEqual({ width: 33, height: 17 })
    expect(imageDimensions(await make('jpeg'))).toEqual({ width: 33, height: 17 })
    expect(imageDimensions(Buffer.alloc(64))).toBeNull()
  })
})
