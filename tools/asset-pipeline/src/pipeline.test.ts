import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIO } from './io'
import { mergeVariants, parseMergeArgs } from './merge-variants'
import { DEFAULT_SIMPLIFY_ERROR, optimizeGlb, parseOptimizeArgs, solidifyMaterials } from './optimize'
import {
  PLACEHOLDER_COLOURWAYS,
  buildPlaceholderTee,
  generatePlaceholders,
} from './placeholders'
import { checkVariants, inspectGlb } from './validate'

/** Build a GLB carrying one large embedded PNG baseColor texture. */
async function writeTexturedGlb(file: string, sizePx = 512): Promise<void> {
  const io = await createIO()
  // A noisy PNG so it is genuinely heavy (compresses well to WebP, unlike a flat fill).
  const raw = Buffer.alloc(sizePx * sizePx * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 255
  const png = await sharp(raw, { raw: { width: sizePx, height: sizePx, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()

  const doc = new Document()
  doc.createBuffer()
  const texture = doc.createTexture('tex').setImage(new Uint8Array(png)).setMimeType('image/png')
  const material = doc.createMaterial('m').setBaseColorTexture(texture)
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(doc.getRoot().listBuffers()[0]!)
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
    .setBuffer(doc.getRoot().listBuffers()[0]!)
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('TEXCOORD_0', uv)
    .setMaterial(material)
  material.getBaseColorTextureInfo()?.setTexCoord(0)
  doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)))
  await io.write(file, doc)
}

/** Build a minimal GLB with a single material of the given alphaMode (double-sided off). */
async function writeMaterialGlb(
  file: string,
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND',
): Promise<void> {
  const io = await createIO()
  const doc = new Document()
  doc.createBuffer()
  const material = doc
    .createMaterial('m')
    .setBaseColorFactor([0.4, 0.4, 0.4, 1])
    .setAlphaMode(alphaMode)
    .setDoubleSided(false)
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(doc.getRoot().listBuffers()[0]!)
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material)
  doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)))
  await io.write(file, doc)
}

/** Build a GLB carrying a flat n×n triangle grid (2·n² triangles) — enough geometry to decimate. */
async function writeGridGlb(file: string, n: number): Promise<void> {
  const io = await createIO()
  const doc = new Document()
  doc.createBuffer()
  const positions: number[] = []
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) positions.push(x / n, y / n, 0)
  const indices: number[] = []
  const at = (x: number, y: number) => y * (n + 1) + x
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      indices.push(at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1))
  const buf = doc.getRoot().listBuffers()[0]!
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buf)
  const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buf)
  const mat = doc.createMaterial('m').setBaseColorFactor([0.5, 0.5, 0.5, 1])
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx).setMaterial(mat)
  doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)))
  await io.write(file, doc)
}

/** Total triangle count across every primitive in a GLB. */
async function countTriangles(file: string): Promise<number> {
  const io = await createIO()
  const doc = await io.read(file)
  let indices = 0
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) indices += p.getIndices()?.getCount() ?? 0
  return indices / 3
}

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'run-pipeline-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('placeholder generation', () => {
  it('writes one GLB and two posters per colourway', async () => {
    const out = await generatePlaceholders(join(dir, 'placeholders'))
    expect(out.glbFiles).toHaveLength(3)
    expect(out.posterFiles).toHaveLength(6)
    const report = await inspectGlb(out.glbFiles[0]!)
    expect(report.primitiveCount).toBe(4)
    expect(report.materialCount).toBe(2)
    expect(report.variants).toEqual([]) // raw exports carry no variants — merging binds them
  })
})

describe('mergeVariants', () => {
  it('binds every colourway as a KHR_materials_variants entry named by variantId', async () => {
    const inputs = PLACEHOLDER_COLOURWAYS.map((c) => ({
      file: join(dir, 'placeholders', `n001-${c.slug}.glb`),
      variantName: c.variantId,
    }))
    const merged = join(dir, 'n001.glb')
    const result = await mergeVariants(inputs, merged)

    expect(result.variants).toEqual(['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON'])

    const report = await inspectGlb(merged)
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY']) // sorted
    expect(report.primitiveCount).toBe(4)
    // 2 materials per colourway, colours differ so dedup keeps all 6
    expect(report.materialCount).toBe(6)

    const check = checkVariants(report, PLACEHOLDER_COLOURWAYS.map((c) => c.variantId))
    expect(check).toEqual({ ok: true, missing: [], extra: [] })
  })

  it('reports variants in FILE order as well as sorted', async () => {
    // The CMS shows `variantsInFileOrder` back to the owner so they can say which
    // of their colours is which. If it ever silently became sorted, "the second
    // colourway in the file" would point at the wrong colour and the colour
    // buttons would swap on the live page — with nothing failing anywhere.
    // NAVY/BLACK/CRIMSON is deliberately not alphabetical, so the two lists differ.
    const inputs = PLACEHOLDER_COLOURWAYS.map((c) => ({
      file: join(dir, 'placeholders', `n001-${c.slug}.glb`),
      variantName: c.variantId,
    }))
    const merged = join(dir, 'n001-file-order.glb')
    await mergeVariants(inputs, merged)

    const report = await inspectGlb(merged)
    expect(report.variantsInFileOrder).toEqual(['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON'])
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY'])
    // Same set, different order — never a different set.
    expect([...report.variantsInFileOrder].sort()).toEqual(report.variants)
  })

  it('reports no file-order variants for a raw export that binds none', async () => {
    const report = await inspectGlb(join(dir, 'placeholders', 'n001-navy.glb'))
    expect(report.variants).toEqual([])
    expect(report.variantsInFileOrder).toEqual([])
  })

  it('detects a missing variant against the CMS list', async () => {
    const report = await inspectGlb(join(dir, 'n001.glb'))
    const check = checkVariants(report, ['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON', 'N001-SAGE'])
    expect(check.ok).toBe(false)
    expect(check.missing).toEqual(['N001-SAGE'])
  })

  it('refuses to merge GLBs with different geometry', async () => {
    const io = await createIO()
    // A single-box document — different primitive count than the tee.
    const box = new Document()
    box.createBuffer()
    const material = box.createMaterial('m').setBaseColorFactor([1, 0, 0, 1])
    const position = box
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(box.getRoot().listBuffers()[0]!)
    const prim = box.createPrimitive().setAttribute('POSITION', position).setMaterial(material)
    box.createScene('s').addChild(box.createNode('n').setMesh(box.createMesh('m').addPrimitive(prim)))
    const boxFile = join(dir, 'box.glb')
    await io.write(boxFile, box)

    await expect(
      mergeVariants(
        [
          { file: join(dir, 'placeholders', 'n001-navy.glb'), variantName: 'N001-NAVY' },
          { file: boxFile, variantName: 'N001-BOX' },
        ],
        join(dir, 'broken.glb'),
      ),
    ).rejects.toThrow(/do not share the same geometry/)
  })

  it('rejects fewer than two inputs and duplicate variant names', async () => {
    const navy = join(dir, 'placeholders', 'n001-navy.glb')
    await expect(mergeVariants([{ file: navy, variantName: 'N001-NAVY' }], join(dir, 'x.glb'))).rejects.toThrow(
      /at least two/,
    )
    await expect(
      mergeVariants(
        [
          { file: navy, variantName: 'N001-NAVY' },
          { file: navy, variantName: 'N001-NAVY' },
        ],
        join(dir, 'x.glb'),
      ),
    ).rejects.toThrow(/Duplicate/)
  })

  it('writes a GLB a fresh reader can parse (round-trip sanity)', async () => {
    const io = await createIO()
    const document = await io.read(join(dir, 'n001.glb'))
    expect(document.getRoot().listScenes()).toHaveLength(1)
  })

  it('rejects invalid file paths cleanly', async () => {
    await expect(
      mergeVariants(
        [
          { file: join(dir, 'missing-a.glb'), variantName: 'N001-A' },
          { file: join(dir, 'missing-b.glb'), variantName: 'N001-B' },
        ],
        join(dir, 'x.glb'),
      ),
    ).rejects.toThrow()
  })
})

describe('placeholder tee document', () => {
  it('keeps primitive order stable across colourways', () => {
    for (const colourway of PLACEHOLDER_COLOURWAYS) {
      const tee = buildPlaceholderTee(colourway)
      const prims = tee.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
      expect(prims).toHaveLength(4)
      const names = prims.map((p) => p.getMaterial()?.getName())
      expect(names).toEqual([
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-TRIM`,
      ])
    }
  })
})

describe('parseMergeArgs (CLI contract)', () => {
  it('parses --out, --draco and <file>=<VARIANT-ID> tokens', () => {
    const parsed = parseMergeArgs([
      '--out',
      'output/n001.glb',
      '--draco',
      'raw/navy.glb=N001-NAVY',
      'raw/black.glb=N001-BLACK',
    ])
    expect(parsed.out).toBe('output/n001.glb')
    expect(parsed.draco).toBe(true)
    expect(parsed.inputs).toEqual([
      { file: 'raw/navy.glb', variantName: 'N001-NAVY' },
      { file: 'raw/black.glb', variantName: 'N001-BLACK' },
    ])
  })
  it('splits on the LAST "=" so a path may itself contain "="', () => {
    const parsed = parseMergeArgs(['weird=dir/navy.glb=N001-NAVY'])
    expect(parsed.inputs).toEqual([{ file: 'weird=dir/navy.glb', variantName: 'N001-NAVY' }])
  })
  it('defaults draco off and out null', () => {
    const parsed = parseMergeArgs(['a.glb=N001-A', 'b.glb=N001-B'])
    expect(parsed.draco).toBe(false)
    expect(parsed.out).toBeNull()
  })
  it('throws on a token missing "=" when --from-cms is absent', () => {
    expect(() => parseMergeArgs(['--out', 'x.glb', 'no-equals-here.glb'])).toThrow(
      /Expected <file\.glb>=<VARIANT-ID>/,
    )
  })
  it('points at --from-cms in that error, so the fix is in the message', () => {
    expect(() => parseMergeArgs(['bare.glb'])).toThrow(/--from-cms <product-slug>/)
  })
})

describe('parseMergeArgs — --from-cms (names come from the CMS, not from CLO)', () => {
  it('accepts bare file paths and leaves the names to be filled in positionally', () => {
    const parsed = parseMergeArgs([
      '--from-cms',
      'n001',
      '--out',
      'output/n001.glb',
      'raw/navy.glb',
      'raw/black.glb',
    ])
    expect(parsed.fromCms).toBe('n001')
    expect(parsed.out).toBe('output/n001.glb')
    expect(parsed.inputs).toEqual([
      { file: 'raw/navy.glb', variantName: '' },
      { file: 'raw/black.glb', variantName: '' },
    ])
  })

  it('does not care where the flag appears — a flag after the files still counts', () => {
    // Resolved before the arg loop on purpose: parsing it inline meant
    // `merge a.glb --from-cms n001` rejected "a.glb" for having no "=".
    const parsed = parseMergeArgs(['a.glb', 'b.glb', '--from-cms', 'n001'])
    expect(parsed.fromCms).toBe('n001')
    expect(parsed.inputs.map((i) => i.file)).toEqual(['a.glb', 'b.glb'])
  })

  it('still honours an explicit name given alongside --from-cms', () => {
    const parsed = parseMergeArgs(['--from-cms', 'n001', 'a.glb=EXPLICIT', 'b.glb'])
    expect(parsed.inputs).toEqual([
      { file: 'a.glb', variantName: 'EXPLICIT' },
      { file: 'b.glb', variantName: '' },
    ])
  })

  it('defaults fromCms to null so the historic form is untouched', () => {
    expect(parseMergeArgs(['a.glb=N001-A']).fromCms).toBeNull()
  })
})

describe('mergeVariants — Draco', () => {
  it('applies Draco compression when requested and stays parseable with variants intact', async () => {
    const inputs = PLACEHOLDER_COLOURWAYS.map((c) => ({
      file: join(dir, 'placeholders', `n001-${c.slug}.glb`),
      variantName: c.variantId,
    }))
    const out = join(dir, 'n001-draco.glb')
    const result = await mergeVariants(inputs, out, { draco: true })
    expect(result.variants).toEqual(['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON'])
    // A Draco-encoded GLB must still round-trip through the IO with its
    // KHR_materials_variants bindings preserved.
    const report = await inspectGlb(out)
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY'])
    expect(report.primitiveCount).toBe(4)
  })
})

describe('inspectGlb — publish-readiness warnings', () => {
  it('flags a raw CLO generator and uncompressed PNG textures', async () => {
    const src = join(dir, 'raw-clo.glb')
    await writeTexturedGlb(src, 256)
    // The writer always stamps its own generator, so a raw-CLO file can't be
    // produced via io.write. Patch the generator bytes in-place (equal length)
    // to mimic a genuine raw CLO export, which inspectGlb reads without rewriting.
    const gen = (await inspectGlb(src)).generator
    const clo = 'CLO'.padEnd(gen.length, ' ')
    const patched = (await readFile(src))
      .toString('latin1')
      .replace(`"generator":"${gen}"`, `"generator":"${clo}"`)
    await writeFile(src, Buffer.from(patched, 'latin1'))

    const report = await inspectGlb(src)
    expect(report.generator).toMatch(/CLO/)
    expect(report.uncompressedTextureCount).toBe(1)
    expect(report.warnings.some((w) => /RAW CLO export/.test(w))).toBe(true)
    expect(report.warnings.some((w) => /raw PNG\/JPEG/.test(w))).toBe(true)
  })

  it('reports no CLO/texture warnings for a WebP-optimised GLB', async () => {
    const src = join(dir, 'clean-src.glb')
    await writeTexturedGlb(src, 256)
    const out = join(dir, 'clean.glb')
    await optimizeGlb(src, out, { texture: 'webp' })
    const report = await inspectGlb(out)
    expect(report.uncompressedTextureCount).toBe(0)
    expect(report.warnings.some((w) => /raw PNG\/JPEG/.test(w))).toBe(false)
  })
})

describe('optimizeGlb — texture compression', () => {
  it('re-encodes embedded PNG textures to WebP and shrinks the file', async () => {
    const src = join(dir, 'textured.glb')
    await writeTexturedGlb(src, 512)
    const out = join(dir, 'textured.webp.glb')
    const result = await optimizeGlb(src, out, { texture: 'webp', maxTextureSize: 2048 })

    expect(result.textureFormats).toEqual(['image/webp'])
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore)

    // The written GLB really carries a WebP texture a fresh reader can see.
    const report = await inspectGlb(out)
    expect(report.textureCount).toBe(1)
    const reread = await createIO().then((io) => io.read(out))
    expect(reread.getRoot().listTextures()[0]!.getMimeType()).toBe('image/webp')
  })

  it('caps texture dimensions to the requested maximum, preserving aspect', async () => {
    const src = join(dir, 'big-texture.glb')
    await writeTexturedGlb(src, 1024)
    const out = join(dir, 'big-texture.capped.glb')
    await optimizeGlb(src, out, { texture: 'webp', maxTextureSize: 256 })
    const reread = await createIO().then((io) => io.read(out))
    const size = reread.getRoot().listTextures()[0]!.getSize()
    expect(size).not.toBeNull()
    expect(Math.max(size![0], size![1])).toBeLessThanOrEqual(256)
  })

  it('leaves textures untouched when texture compression is off', async () => {
    const src = join(dir, 'untouched.glb')
    await writeTexturedGlb(src, 256)
    const out = join(dir, 'untouched.out.glb')
    const result = await optimizeGlb(src, out, { texture: 'none' })
    expect(result.textureFormats).toEqual(['image/png'])
  })
})

describe('optimizeGlb — KTX2 / Basis Universal textures', () => {
  it('encodes base colour + normal maps to KTX2 (KHR_texture_basisu)', async () => {
    const io = await createIO()
    // Small (64px) textures keep Basis encoding fast in the test.
    const raw = Buffer.alloc(64 * 64 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.sin(i * 0.7) * 128 + 128) & 255
    const png = await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer()

    const doc = new Document()
    doc.createBuffer()
    const base = doc.createTexture('base').setImage(new Uint8Array(png)).setMimeType('image/png')
    const normal = doc.createTexture('normal').setImage(new Uint8Array(png)).setMimeType('image/png')
    const m = doc.createMaterial('m').setBaseColorTexture(base).setNormalTexture(normal)
    const pos = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(doc.getRoot().listBuffers()[0]!)
    const uv = doc
      .createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
      .setBuffer(doc.getRoot().listBuffers()[0]!)
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', pos)
      .setAttribute('TEXCOORD_0', uv)
      .setMaterial(m)
    m.getBaseColorTextureInfo()?.setTexCoord(0)
    m.getNormalTextureInfo()?.setTexCoord(0)
    doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('mm').addPrimitive(prim)))

    const src = join(dir, 'ktx-src.glb')
    await io.write(src, doc)
    const out = join(dir, 'ktx.glb')
    const result = await optimizeGlb(src, out, { texture: 'ktx2', maxTextureSize: 64 })

    expect(result.textureFormats).toEqual(['image/ktx2'])

    // A fresh reader sees KTX2 textures under KHR_texture_basisu.
    const reread = await createIO().then((io2) => io2.read(out))
    const used = reread.getRoot().listExtensionsUsed().map((e) => e.extensionName)
    expect(used).toContain('KHR_texture_basisu')
    for (const t of reread.getRoot().listTextures()) {
      expect(t.getMimeType()).toBe('image/ktx2')
      // Valid KTX2 identifier: 0xAB 'KTX 20' 0xBB \r \n \x1A \n
      expect(Buffer.from(t.getImage()!.slice(0, 12)).toString('hex')).toBe('ab4b5458203230bb0d0a1a0a')
    }
  }, 60_000)
})

describe('optimizeGlb — Meshopt geometry', () => {
  it('applies Meshopt compression and stays parseable with variants intact', async () => {
    const merged = join(dir, 'n001.glb') // produced by the mergeVariants suite above
    const out = join(dir, 'n001.meshopt.glb')
    const result = await optimizeGlb(merged, out, { texture: 'none', geometry: 'meshopt' })
    expect(result.geometry).toBe('meshopt')

    const report = await inspectGlb(out)
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY'])
    expect(report.primitiveCount).toBe(4)

    const reread = await createIO().then((io) => io.read(out))
    const used = reread.getRoot().listExtensionsUsed().map((e) => e.extensionName)
    expect(used).toContain('EXT_meshopt_compression')
  })
})

describe('parseOptimizeArgs (CLI contract)', () => {
  it('defaults to WebP + 2048 cap, geometry none', () => {
    const parsed = parseOptimizeArgs(['in.glb', '--out', 'out.glb'])
    expect(parsed.input).toBe('in.glb')
    expect(parsed.out).toBe('out.glb')
    expect(parsed.options).toMatchObject({ texture: 'webp', geometry: 'none', maxTextureSize: 2048 })
  })
  it('honours --no-webp, --meshopt, --max-texture and --quality', () => {
    const parsed = parseOptimizeArgs([
      'in.glb', '--out', 'o.glb', '--no-webp', '--meshopt', '--max-texture', '1024', '--quality', '90',
    ])
    expect(parsed.options).toMatchObject({
      texture: 'none', geometry: 'meshopt', maxTextureSize: 1024, textureQuality: 90,
    })
  })
  it('defaults opaque on and honours --keep-transparency / --no-opaque', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb']).options.opaque).toBe(true)
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--keep-transparency']).options.opaque).toBe(false)
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--no-opaque']).options.opaque).toBe(false)
  })
  it('parses --simplify <ratio> (off by default)', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb']).options.simplify).toBeUndefined()
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--simplify', '0.05']).options.simplify).toBe(0.05)
    expect(parseMergeArgs(['--simplify', '0.1', 'a.glb=N001-A']).options.simplify).toBe(0.1)
  })

  // Regression: --simplify originally ran with a hard-coded error budget of
  // 0.001 — 10x the glTF-Transform default — and without lockBorder. On a real
  // garment that visibly tore printed logos apart, because the artwork is a
  // texture and the UV islands under it were free to collapse. Keep the default
  // conservative; --simplify-error is the deliberate opt-out.
  it('defaults the simplify error budget to the conservative value', () => {
    expect(DEFAULT_SIMPLIFY_ERROR).toBe(0.0001)
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb']).options.simplifyError).toBeUndefined()
  })

  it('parses --simplify-error <ratio> for the rare case fidelity does not matter', () => {
    expect(
      parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--simplify-error', '0.001']).options
        .simplifyError,
    ).toBe(0.001)
  })

  // The knobs that replaced `lockBorder`. Undefined means "use the module
  // defaults" — the shrink container passes them explicitly per detail level.
  it('parses --uv-weight / --normal-weight, unset by default', () => {
    const bare = parseOptimizeArgs(['in.glb', '--out', 'o.glb']).options
    expect(bare.simplifyUvWeight).toBeUndefined()
    expect(bare.simplifyNormalWeight).toBeUndefined()

    const weighted = parseOptimizeArgs([
      'in.glb', '--out', 'o.glb', '--uv-weight', '2', '--normal-weight', '0.25',
    ]).options
    expect(weighted.simplifyUvWeight).toBe(2)
    expect(weighted.simplifyNormalWeight).toBe(0.25)
  })

  it('exposes the same decimation flags on merge, so the two commands cannot drift', () => {
    const parsed = parseMergeArgs([
      '--simplify', '0.05', '--simplify-error', '0.0005', '--uv-weight', '2', 'a.glb=N001-A',
    ]).options
    expect(parsed).toMatchObject({
      simplify: 0.05,
      simplifyError: 0.0005,
      simplifyUvWeight: 2,
    })
  })
})

describe('parseMergeArgs — compression flags', () => {
  it('defaults to WebP textures with geometry opt-in', () => {
    const parsed = parseMergeArgs(['a.glb=N001-A', 'b.glb=N001-B'])
    expect(parsed.options).toMatchObject({ texture: 'webp', geometry: 'none' })
    expect(parsed.draco).toBe(false)
  })
  it('maps --meshopt / --draco / --no-webp onto options', () => {
    expect(parseMergeArgs(['--meshopt', 'a.glb=N001-A']).options.geometry).toBe('meshopt')
    const draco = parseMergeArgs(['--draco', 'a.glb=N001-A'])
    expect(draco.options.geometry).toBe('draco')
    expect(draco.draco).toBe(true)
    expect(parseMergeArgs(['--no-webp', 'a.glb=N001-A']).options.texture).toBe('none')
  })
  it('defaults opaque on and honours --keep-transparency / --no-opaque', () => {
    expect(parseMergeArgs(['a.glb=N001-A']).options.opaque).toBe(true)
    expect(parseMergeArgs(['--keep-transparency', 'a.glb=N001-A']).options.opaque).toBe(false)
    expect(parseMergeArgs(['--no-opaque', 'a.glb=N001-A']).options.opaque).toBe(false)
  })
})

describe('solidifyMaterials (opaque + double-sided)', () => {
  it('converts BLEND → OPAQUE, leaves MASK cutouts, and makes every material double-sided', () => {
    const doc = new Document()
    const blend = doc.createMaterial('blend').setAlphaMode('BLEND').setDoubleSided(false)
    const mask = doc.createMaterial('mask').setAlphaMode('MASK').setDoubleSided(false)
    const opaque = doc.createMaterial('opaque').setAlphaMode('OPAQUE').setDoubleSided(false)

    const result = solidifyMaterials(doc)

    expect(blend.getAlphaMode()).toBe('OPAQUE') // the see-through fabric, fixed
    expect(mask.getAlphaMode()).toBe('MASK') // hard cutout (logo/mesh hole) left intentional
    expect(opaque.getAlphaMode()).toBe('OPAQUE')
    expect([blend, mask, opaque].every((m) => m.getDoubleSided())).toBe(true)
    expect(result).toEqual({ opaqued: 1, doubleSided: 3 })
  })
})

describe('optimizeGlb — opaque + double-sided step', () => {
  it('forces a BLEND material solid and double-sided when opaque is set', async () => {
    const src = join(dir, 'blend-src.glb')
    await writeMaterialGlb(src, 'BLEND')
    const out = join(dir, 'blend.opaque.glb')

    const result = await optimizeGlb(src, out, { texture: 'none', opaque: true })
    expect(result.opaque).toBe(true)

    const reread = await createIO().then((io) => io.read(out))
    const m = reread.getRoot().listMaterials()[0]!
    expect(m.getAlphaMode()).toBe('OPAQUE')
    expect(m.getDoubleSided()).toBe(true)
  })

  it('leaves transparency intact when opaque is not requested (--keep-transparency)', async () => {
    const src = join(dir, 'blend-keep-src.glb')
    await writeMaterialGlb(src, 'BLEND')
    const out = join(dir, 'blend.keep.glb')

    const result = await optimizeGlb(src, out, { texture: 'none' }) // opaque omitted
    expect(result.opaque).toBe(false)

    const reread = await createIO().then((io) => io.read(out))
    expect(reread.getRoot().listMaterials()[0]!.getAlphaMode()).toBe('BLEND')
  })
})

describe('mergeVariants — opaque step preserves variants', () => {
  it('makes every merged material opaque + double-sided without dropping variant bindings', async () => {
    const inputs = PLACEHOLDER_COLOURWAYS.map((c) => ({
      file: join(dir, 'placeholders', `n001-${c.slug}.glb`),
      variantName: c.variantId,
    }))
    const out = join(dir, 'n001-opaque.glb')
    const result = await mergeVariants(inputs, out, { opaque: true })
    expect(result.variants).toEqual(['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON'])

    const reread = await createIO().then((io) => io.read(out))
    for (const m of reread.getRoot().listMaterials()) {
      expect(m.getAlphaMode()).toBe('OPAQUE')
      expect(m.getDoubleSided()).toBe(true)
    }
    const report = await inspectGlb(out)
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY']) // still bound
  })
})

describe('optimizeGlb — simplify (geometry decimation)', () => {
  it('cuts the triangle count when a simplify ratio is given', async () => {
    const src = join(dir, 'grid.glb')
    await writeGridGlb(src, 40) // 40×40×2 = 3200 triangles
    const before = await countTriangles(src)
    expect(before).toBe(3200)

    const out = join(dir, 'grid.simplified.glb')
    await optimizeGlb(src, out, { texture: 'none', simplify: 0.25 })
    const after = await countTriangles(out)

    expect(after).toBeGreaterThan(0) // still a mesh, not obliterated
    expect(after).toBeLessThan(before * 0.6) // meaningfully decimated
  })

  it('leaves geometry untouched when no simplify ratio is given', async () => {
    const src = join(dir, 'grid-keep.glb')
    await writeGridGlb(src, 20) // 800 triangles
    const out = join(dir, 'grid-keep.out.glb')
    await optimizeGlb(src, out, { texture: 'none' }) // simplify omitted
    expect(await countTriangles(out)).toBe(800)
  })
})

describe('inspectGlb — translucent material warning', () => {
  it('flags alphaMode BLEND materials as see-through', async () => {
    const src = join(dir, 'translucent.glb')
    await writeMaterialGlb(src, 'BLEND')
    const report = await inspectGlb(src)
    expect(report.translucentMaterialCount).toBe(1)
    expect(report.warnings.some((w) => /alphaMode BLEND \(translucent\)/.test(w))).toBe(true)
  })

  it('does not flag an opaque GLB', async () => {
    const src = join(dir, 'opaque-src.glb')
    await writeMaterialGlb(src, 'OPAQUE')
    const report = await inspectGlb(src)
    expect(report.translucentMaterialCount).toBe(0)
    expect(report.warnings.some((w) => /alphaMode BLEND/.test(w))).toBe(false)
  })
})

describe('mergeVariants — primitive with no material', () => {
  it('skips the variant mapping instead of binding a spec-invalid null material', async () => {
    const io = await createIO()
    // Two primitives; `mats` marks whether each primitive carries a material.
    const makeDoc = (mats: boolean[]): Document => {
      const doc = new Document()
      doc.createBuffer()
      const mesh = doc.createMesh('m')
      mats.forEach((hasMat, idx) => {
        const position = doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
          .setBuffer(doc.getRoot().listBuffers()[0]!)
        let prim = doc.createPrimitive().setAttribute('POSITION', position)
        if (hasMat) {
          prim = prim.setMaterial(doc.createMaterial(`m${idx}`).setBaseColorFactor([1, 0, 0, 1]))
        }
        mesh.addPrimitive(prim)
      })
      doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh))
      return doc
    }
    const baseFile = join(dir, 'nm-base.glb')
    const otherFile = join(dir, 'nm-other.glb')
    await io.write(baseFile, makeDoc([true, true]))
    await io.write(otherFile, makeDoc([true, false])) // primitive #1 has no material here

    const out = join(dir, 'nm-merged.glb')
    await mergeVariants(
      [
        { file: baseFile, variantName: 'N001-BASE' },
        { file: otherFile, variantName: 'N001-NOMAT' },
      ],
      out,
    )

    // Both variants exist (the second is still bound where it has a material)…
    const report = await inspectGlb(out)
    expect(report.variants).toEqual(['N001-BASE', 'N001-NOMAT'])
    // …and no mapping was written with a null material (which would be spec-invalid).
    const reread = await io.read(out)
    for (const prim of reread.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
      const ml = prim.getExtension<MappingList>('KHR_materials_variants')
      if (!ml) continue
      for (const mapping of ml.listMappings()) {
        expect(mapping.getMaterial()).not.toBeNull()
      }
    }
  })
})
