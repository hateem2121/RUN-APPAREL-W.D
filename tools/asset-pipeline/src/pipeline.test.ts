import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIO } from './io'
import { mergeVariants, parseMergeArgs } from './merge-variants'
import {
  DEFAULT_SIMPLIFY_ERROR,
  optimizeGlb,
  parseOptimizeArgs,
  solidifyMaterials,
} from './optimize'
import {
  PLACEHOLDER_ARTWORK,
  PLACEHOLDER_COLOURWAYS,
  buildPlaceholderTee,
  generatePlaceholders,
} from './placeholders'
import { findArtworkAlphaProblems } from './texture-artwork'
import { CUTOUT_MID_FRACTION, CUTOUT_MIN_TRANSPARENT, profileAlpha } from './textures'
import { checkVariants, inspectGlb } from './validate'

/**
 * Primitives on a seeded tee: 3 body boxes + collar trim + the SVG decal, then
 * one quad per real artwork profile. Derived rather than hard-coded so growing
 * the fixture does not mean hand-editing five assertions — the count is
 * incidental; what these tests are about is ORDER, which variant merging
 * depends on.
 */
const PLACEHOLDER_PRIMITIVES = 5 + PLACEHOLDER_ARTWORK.length

/** Build a GLB carrying one large embedded PNG baseColor texture. */
async function writeTexturedGlb(file: string, sizePx = 512): Promise<void> {
  const io = await createIO()
  // A noisy PNG so it is genuinely heavy (compresses well to WebP, unlike a flat fill).
  const raw = Buffer.alloc(sizePx * sizePx * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 255
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
      indices.push(
        at(x, y),
        at(x + 1, y),
        at(x, y + 1),
        at(x + 1, y),
        at(x + 1, y + 1),
        at(x, y + 1),
      )
  const buf = doc.getRoot().listBuffers()[0]!
  const pos = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buf)
  const idx = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array(indices))
    .setBuffer(buf)
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
    // 4 fabric boxes + the printed chest graphic + one quad per real artwork
    // profile. Materials: BODY, TRIM, the SVG decal, then the five.
    expect(report.primitiveCount).toBe(PLACEHOLDER_PRIMITIVES)
    expect(report.materialCount).toBe(3 + PLACEHOLDER_ARTWORK.length)
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
    expect(report.primitiveCount).toBe(PLACEHOLDER_PRIMITIVES)
    // 2 body/trim materials per colourway differ by colour, so dedup keeps all
    // 6. Every artwork material is identical in each colourway — same texture,
    // same settings — so each dedups to one shared material that all three
    // variants map to. 6 + 1 SVG decal + 5 real profiles = 12.
    expect(report.materialCount).toBe(7 + PLACEHOLDER_ARTWORK.length)

    const check = checkVariants(
      report,
      PLACEHOLDER_COLOURWAYS.map((c) => c.variantId),
    )
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
    box
      .createScene('s')
      .addChild(box.createNode('n').setMesh(box.createMesh('m').addPrimitive(prim)))
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
    await expect(
      mergeVariants([{ file: navy, variantName: 'N001-NAVY' }], join(dir, 'x.glb')),
    ).rejects.toThrow(/at least two/)
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
  it('keeps primitive order stable across colourways', async () => {
    for (const colourway of PLACEHOLDER_COLOURWAYS) {
      const tee = await buildPlaceholderTee(colourway)
      const prims = tee
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
      expect(prims).toHaveLength(PLACEHOLDER_PRIMITIVES)
      const names = prims.map((p) => p.getMaterial()?.getName())
      expect(names).toEqual([
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-TRIM`,
        `${colourway.variantId}-GRAPHIC`,
        ...PLACEHOLDER_ARTWORK.map((a) => `${colourway.variantId}-${a.name}`),
      ])
    }
  })

  it('carries a printed graphic on a SECOND UV set, over a hard alpha cutout', async () => {
    // The fixture exists to be capable of failing. Until it did, the entire
    // artwork path — UV weighting, texture classification, alpha-mode
    // resolution — had nothing to act on, and 177 green tests said nothing
    // about any of it. Each property here is load-bearing for a different bug:
    //   TEXCOORD_1        H4, decimation protecting only the first UV set
    //   alpha cutout      H3/H6, BLEND being flattened to OPAQUE
    //   coplanar offset   H6, z-fighting after quantization
    const tee = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const prims = tee
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
    const decal = prims.at(-1)!

    expect(decal.getAttribute('TEXCOORD_1')).toBeTruthy()
    const material = decal.getMaterial()!
    expect(material.getAlphaMode()).toBe('BLEND')
    expect(material.getBaseColorTextureInfo()?.getTexCoord()).toBe(1)

    const { character } = await profileAlpha(material.getBaseColorTexture()!.getImage()!)
    expect(character).toBe('binary')

    // Fabric primitives need UVs too, or the simplifier's attribute-aware path
    // bails on every one of them and --uv-weight is silently inert.
    expect(prims.every((p) => p.getAttribute('TEXCOORD_0'))).toBe(true)
  })
})

/**
 * END TO END, on the real chain rather than a synthetic Document.
 *
 * Every artwork guard until now was asserted against in-memory fixtures built
 * inside its own unit test. That leaves the question the incident actually
 * turned on unanswered: does the protection ENGAGE when a plausible garment goes
 * through `optimizeGlb` with production flags? The audit of 2026-08-03 found the
 * seeded TEXCOORD_1 decal had never once been pushed through the real chain.
 *
 * This is deliberately the whole pipeline — solidify, artwork-aware encode,
 * attribute-aware decimation, Meshopt — at the "Balanced" settings from
 * @run-apparel/shared, on the fixture built to be capable of failing.
 */
describe('optimizeGlb — the artwork guards engage on the real chain', () => {
  it("weights the decal's UV set and reports no artwork at risk", async () => {
    const tee = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const src = join(dir, 'artwork-src.glb')
    const out = join(dir, 'artwork-out.glb')
    await writeFile(src, await (await createIO()).writeBinary(tee))

    // Through parseOptimizeArgs, exactly as apps/shrink/container/server.ts does,
    // with the "Balanced" flags from packages/shared/src/shrink.ts.
    //
    // NOT by hand-building the options object: `opaque` defaults to true in the
    // CLI parser and to false in `optimizeGlb` itself, so a hand-built object
    // silently skips the step that resolves a BLEND decal to a MASK cut-out. The
    // first draft of this test did exactly that and "failed", blaming the
    // pipeline for something only the test had done.
    const { options } = parseOptimizeArgs([
      src,
      '--out',
      out,
      '--simplify',
      '0.05',
      '--meshopt',
      '--simplify-error',
      '0.0005',
      '--uv-weight',
      '1',
    ])
    const result = await optimizeGlb(src, out, options)

    // The guard that matters: nothing carrying printed artwork was decimated
    // without its texture coordinates in the error budget.
    expect(result.simplify?.artworkAtRisk).toEqual([])
    // And the UV weighting was genuinely applied, not merely configured.
    expect(result.simplify?.attributeAware).toBeGreaterThan(0)
    expect(result.simplify?.uvSetsWeighted.length).toBeGreaterThan(0)

    // The decal is still a hard-edged cut-out, not see-through and not filled in.
    const optimized = await (await createIO()).read(out)
    expect(await findArtworkAlphaProblems(optimized)).toEqual([])
    const masked = optimized
      .getRoot()
      .listMaterials()
      .filter((m) => m.getAlphaMode() === 'MASK')
    // EVERY artwork material, not "at least one". The production refusal named
    // FIVE materials left on BLEND, so `toBeGreaterThan(0)` would have passed
    // with four of them still broken — the fixture carried one, so the weaker
    // assertion was indistinguishable from the stronger one until now.
    expect(masked.length).toBe(1 + PLACEHOLDER_ARTWORK.length)
    expect(masked.every((m) => m.getAlphaCutoff() === 0.5)).toBe(true)

    // And nothing was left behind on BLEND — the exact condition that made the
    // shrink worker throw PermanentJobError on 2026-08-04.
    expect(
      optimized
        .getRoot()
        .listMaterials()
        .filter((m) => m.getAlphaMode() === 'BLEND'),
    ).toEqual([])
  })
})

/**
 * A trap found by writing the end-to-end test above.
 *
 * `parseOptimizeArgs` defaults `opaque` to TRUE; `optimizeGlb` treats an absent
 * `opaque` as false. So a caller that hand-builds the options object silently
 * skips `solidifyMaterials` and ships a decal still on alphaMode BLEND — which
 * <model-viewer> renders see-through, i.e. exactly the reported symptom.
 *
 * apps/shrink/container/server.ts goes through the parser and is therefore safe.
 * This pins the discrepancy so it is a documented contract rather than a
 * surprise, and so anyone changing either default has to look at the other.
 */
describe('the opaque default differs between the parser and optimizeGlb', () => {
  it('parseOptimizeArgs turns the opaque step ON unless asked not to', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'out.glb']).options.opaque).toBe(true)
    expect(
      parseOptimizeArgs(['in.glb', '--out', 'out.glb', '--keep-transparency']).options.opaque,
    ).toBe(false)
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
    expect(report.primitiveCount).toBe(PLACEHOLDER_PRIMITIVES)
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
    const png = await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } })
      .png()
      .toBuffer()

    const doc = new Document()
    doc.createBuffer()
    const base = doc.createTexture('base').setImage(new Uint8Array(png)).setMimeType('image/png')
    const normal = doc
      .createTexture('normal')
      .setImage(new Uint8Array(png))
      .setMimeType('image/png')
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
    doc
      .createScene('s')
      .addChild(doc.createNode('n').setMesh(doc.createMesh('mm').addPrimitive(prim)))

    const src = join(dir, 'ktx-src.glb')
    await io.write(src, doc)
    const out = join(dir, 'ktx.glb')
    const result = await optimizeGlb(src, out, { texture: 'ktx2', maxTextureSize: 64 })

    expect(result.textureFormats).toEqual(['image/ktx2'])

    // A fresh reader sees KTX2 textures under KHR_texture_basisu.
    const reread = await createIO().then((io2) => io2.read(out))
    const used = reread
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName)
    expect(used).toContain('KHR_texture_basisu')
    for (const t of reread.getRoot().listTextures()) {
      expect(t.getMimeType()).toBe('image/ktx2')
      // Valid KTX2 identifier: 0xAB 'KTX 20' 0xBB \r \n \x1A \n
      expect(Buffer.from(t.getImage()!.slice(0, 12)).toString('hex')).toBe(
        'ab4b5458203230bb0d0a1a0a',
      )
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
    expect(report.primitiveCount).toBe(PLACEHOLDER_PRIMITIVES)

    const reread = await createIO().then((io) => io.read(out))
    const used = reread
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName)
    expect(used).toContain('EXT_meshopt_compression')
  })
})

describe('parseOptimizeArgs (CLI contract)', () => {
  it('defaults to WebP + 2048 cap, geometry none', () => {
    const parsed = parseOptimizeArgs(['in.glb', '--out', 'out.glb'])
    expect(parsed.input).toBe('in.glb')
    expect(parsed.out).toBe('out.glb')
    expect(parsed.options).toMatchObject({
      texture: 'webp',
      geometry: 'none',
      maxTextureSize: 2048,
    })
  })
  it('honours --no-webp, --meshopt, --max-texture and --quality', () => {
    const parsed = parseOptimizeArgs([
      'in.glb',
      '--out',
      'o.glb',
      '--no-webp',
      '--meshopt',
      '--max-texture',
      '1024',
      '--quality',
      '90',
    ])
    expect(parsed.options).toMatchObject({
      texture: 'none',
      geometry: 'meshopt',
      maxTextureSize: 1024,
      textureQuality: 90,
    })
  })
  it('defaults opaque on and honours --keep-transparency / --no-opaque', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb']).options.opaque).toBe(true)
    expect(
      parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--keep-transparency']).options.opaque,
    ).toBe(false)
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--no-opaque']).options.opaque).toBe(
      false,
    )
  })
  it('parses --simplify <ratio> (off by default)', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb']).options.simplify).toBeUndefined()
    expect(
      parseOptimizeArgs(['in.glb', '--out', 'o.glb', '--simplify', '0.05']).options.simplify,
    ).toBe(0.05)
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
      'in.glb',
      '--out',
      'o.glb',
      '--uv-weight',
      '2',
      '--normal-weight',
      '0.25',
    ]).options
    expect(weighted.simplifyUvWeight).toBe(2)
    expect(weighted.simplifyNormalWeight).toBe(0.25)
  })

  it('exposes the same decimation flags on merge, so the two commands cannot drift', () => {
    const parsed = parseMergeArgs([
      '--simplify',
      '0.05',
      '--simplify-error',
      '0.0005',
      '--uv-weight',
      '2',
      'a.glb=N001-A',
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
  /** A hard-edged shape on full transparency — a decal's alpha, binary by construction. */
  async function decalImage(): Promise<Uint8Array> {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: {
            create: {
              width: 16,
              height: 8,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            },
          },
          top: 12,
          left: 8,
        },
      ])
      .png()
      .toBuffer()
    return new Uint8Array(png)
  }

  /** A smooth alpha ramp — genuine translucency, e.g. a mesh panel. */
  async function sheerImage(): Promise<Uint8Array> {
    const width = 32
    const raw = Buffer.alloc(width * 4 * 4)
    for (let i = 0; i < width * 4; i++) {
      raw[i * 4] = 200
      raw[i * 4 + 1] = 200
      raw[i * 4 + 2] = 200
      raw[i * 4 + 3] = Math.round((255 * (i % width)) / (width - 1))
    }
    const png = await sharp(raw, { raw: { width, height: 4, channels: 4 } })
      .png()
      .toBuffer()
    return new Uint8Array(png)
  }

  it('converts untextured BLEND fabric → OPAQUE and double-sides it', async () => {
    // The CLO stray-opacity case: BLEND with nothing behind it. This is what the
    // whole step exists for, and it is unchanged.
    const doc = new Document()
    const blend = doc.createMaterial('blend').setAlphaMode('BLEND').setDoubleSided(false)
    const opaque = doc.createMaterial('opaque').setAlphaMode('OPAQUE').setDoubleSided(false)

    const result = await solidifyMaterials(doc)

    expect(blend.getAlphaMode()).toBe('OPAQUE')
    expect(opaque.getAlphaMode()).toBe('OPAQUE')
    expect([blend, opaque].every((m) => m.getDoubleSided())).toBe(true)
    expect(result).toMatchObject({ opaqued: 1, masked: 0, keptBlend: 0, doubleSided: 2 })
  })

  it('converts a BLEND decal with a real cutout → MASK, not OPAQUE', async () => {
    // Regression for H3/H6 in docs/OPEN-ISSUE-ARTWORK.md. Forcing this to OPAQUE
    // fills the cutout back in with the base colour, which reads as artwork that
    // is half there. MASK keeps the shape AND stays order-independent, which
    // leaving it on BLEND would not.
    const doc = new Document()
    const texture = doc
      .createTexture('chest-logo')
      .setImage(await decalImage())
      .setMimeType('image/png')
    const decal = doc.createMaterial('decal').setAlphaMode('BLEND').setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    expect(decal.getAlphaMode()).toBe('MASK')
    expect(decal.getAlphaCutoff()).toBe(0.5)
    expect(result).toMatchObject({ opaqued: 0, masked: 1, keptBlend: 0 })
  })

  it('leaves genuinely graded alpha on BLEND rather than destroying it', async () => {
    const doc = new Document()
    const texture = doc
      .createTexture('mesh-panel')
      .setImage(await sheerImage())
      .setMimeType('image/png')
    const sheer = doc.createMaterial('sheer').setAlphaMode('BLEND').setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    expect(sheer.getAlphaMode()).toBe('BLEND')
    expect(result).toMatchObject({ opaqued: 0, masked: 0, keptBlend: 1 })
  })

  it('respects a deliberate baseColorFactor alpha', async () => {
    const doc = new Document()
    const half = doc.createMaterial('half').setAlphaMode('BLEND').setBaseColorFactor([1, 1, 1, 0.5])

    const result = await solidifyMaterials(doc)

    expect(half.getAlphaMode()).toBe('BLEND')
    expect(result).toMatchObject({ keptBlend: 1 })
  })

  /**
   * A mostly-solid fabric map carrying one uniformly translucent region — an
   * organza inset, a tinted window. ~3% of the map at alpha 90, and crucially
   * NO fully-transparent pixels at all: it is translucent everywhere, not
   * cut out anywhere.
   */
  async function sheerInsetImage(): Promise<Uint8Array> {
    const width = 128
    const height = 128
    const raw = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      raw[i * 4] = 180
      raw[i * 4 + 1] = 180
      raw[i * 4 + 2] = 180
      raw[i * 4 + 3] = 255
    }
    // 22x22 ≈ 2.95% of 128x128.
    for (let y = 10; y < 32; y++) {
      for (let x = 10; x < 32; x++) raw[(y * width + x) * 4 + 3] = 90
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer()
    return new Uint8Array(png)
  }

  /**
   * The alpha channel of the REAL `THE EXTRA MILE (Slogan)` texture, 1944x121,
   * lifted straight out of the 364 MB raw CLO export on 2026-08-05.
   *
   * This replaced a synthetic approximation — painted stripes at 400x50 tuned to
   * land near the real proportions — which is the version of this fixture that
   * let the bug through in the first place. The whole repeating failure in this
   * repo is fixtures that cannot exhibit the production shape, and "close enough
   * to 3.58% mid" is exactly that failure in miniature: the margin under
   * CUTOUT_MID_FRACTION is 28%, so an approximation drifting by a point and a
   * half changes the answer.
   *
   * Extracted alpha-only with RGB flattened to black, which is why a
   * real-garment texture is 13 KB and committable. It is taken from the RAW
   * export deliberately: solidifyMaterials (optimize.ts:300) runs BEFORE texture
   * compression (line 305), so profileAlpha never sees the WebP.
   */
  async function wordmarkImage(): Promise<Uint8Array> {
    return new Uint8Array(
      await readFile(join(import.meta.dirname, '__fixtures__', 'wordmark-alpha.png')),
    )
  }

  it('the real wordmark fixture still measures what the fix was calibrated against', async () => {
    // Guards the FIXTURE, not the code. Every threshold decision below is
    // calibrated against these three numbers, measured off the raw CLO export;
    // if the file is ever re-generated, re-compressed or swapped, the tests that
    // depend on it would keep passing while silently testing a different image.
    //
    // `character` is asserted as 'graded' on purpose: BINARY_MID_FRACTION stays
    // 0.02 because it also feeds isArtworkTexture → findArtworkAlphaProblems,
    // which throws and saves nothing. The wordmark is MEANT to still look
    // 'graded' here — CUTOUT_MID_FRACTION is what rescues it, and only inside
    // solidifyMaterials.
    const profile = await profileAlpha(await wordmarkImage())

    expect(profile.transparentFraction).toBeCloseTo(0.6638, 4)
    expect(profile.opaqueFraction).toBeCloseTo(0.3004, 4)
    expect(profile.midFraction).toBeCloseTo(0.0358, 4)
    expect(profile.character).toBe('graded')

    // 3.58% against a 5% ceiling. Stated as an assertion rather than a comment
    // because "the margin is comfortable" was the assumption that made 0.02 look
    // safe for months.
    expect(profile.midFraction).toBeLessThan(CUTOUT_MID_FRACTION)
    expect(profile.transparentFraction).toBeGreaterThan(CUTOUT_MIN_TRANSPARENT)
  })

  it('converts a high-ink-coverage WORDMARK → MASK, not sheer fabric', async () => {
    // THE REGRESSION THIS WHOLE PAIR OF CONSTANTS EXISTS FOR, and the one that
    // reached a paying customer. `THE EXTRA MILE (Slogan)` measured 66.38%
    // transparent / 30.04% opaque / 3.58% mid — 96.42% at the extremes, plainly
    // a cutout — but 3.58% > BINARY_MID_FRACTION (0.02), so `character` is
    // `graded` and it took the "genuine translucency, leave it on BLEND" branch.
    // <model-viewer> has no OIT, so BLEND artwork renders half-visible; the
    // structural gate then refuses to save the job at all.
    //
    // Before 2026-07-31 the same material was forced OPAQUE instead, which
    // ignores the alpha channel entirely and painted the 66% transparent
    // background as its underlying RGB — measured (240,240,240), a near-white
    // box across the garment. Both shipped. MASK/0.5 is the third answer and
    // the correct one.
    const doc = new Document()
    const texture = doc
      .createTexture('slogan-strip')
      .setImage(await wordmarkImage())
      .setMimeType('image/png')
    const wordmark = doc
      .createMaterial('THE EXTRA MILE (Slogan)')
      .setAlphaMode('BLEND')
      .setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    expect(wordmark.getAlphaMode()).toBe('MASK')
    expect(wordmark.getAlphaCutoff()).toBe(0.5)
    expect(result).toMatchObject({ masked: 1, keptBlend: 0, opaqued: 0 })
  })

  it('does NOT hard-discard a small uniformly translucent inset', async () => {
    // The counterexample that nearly shipped. Widening the cutout band to 0.05
    // to rescue the wordmark also swept up this shape: ~3% of the map at alpha
    // 90 measures midFraction ≈ 0.029, so it read as "a cutout" and became
    // MASK/alphaCutoff 0.5. But 90/255 = 0.353 < 0.5, so EVERY fragment fails
    // the alpha test and the inset is not hardened — it is deleted, leaving a
    // hole in the garment. Nothing downstream catches it: MASK at 0.5 is
    // precisely what findArtworkAlphaProblems considers correct.
    //
    // What separates it from real artwork is not how much alpha is
    // intermediate, it is whether anything is CUT OUT: the damaged wordmark is
    // 66% fully transparent, this is 0%.
    const doc = new Document()
    const texture = doc
      .createTexture('organza-inset')
      .setImage(await sheerInsetImage())
      .setMimeType('image/png')
    const inset = doc.createMaterial('inset').setAlphaMode('BLEND').setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    expect(inset.getAlphaMode()).toBe('BLEND')
    expect(result).toMatchObject({ masked: 0, keptBlend: 1 })
  })

  it('lets an explicit baseColorFactor alpha beat an inferred cutout', async () => {
    // glTF effective alpha is factor.a * texel.a, so a material that declares
    // itself sheer at 0.4 can never reach alphaCutoff 0.5 no matter how binary
    // its texture looks — MASK would discard every fragment and the material
    // would render as nothing at all, silently, passing every gate.
    //
    // The stated intent on the material wins over the shape inferred from its
    // pixels. Pre-existing, but widening the cutout band increases its reach.
    const doc = new Document()
    const texture = doc
      .createTexture('logo')
      .setImage(await decalImage())
      .setMimeType('image/png')
    const sheerDecal = doc
      .createMaterial('sheer-decal')
      .setAlphaMode('BLEND')
      .setBaseColorFactor([1, 1, 1, 0.4])
      .setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    expect(sheerDecal.getAlphaMode()).toBe('BLEND')
    expect(result).toMatchObject({ masked: 0, keptBlend: 1 })
  })

  it('does NOT double-side MASK materials', async () => {
    // A decal is a thin surface sitting a fraction of a millimetre off the
    // fabric. Drawing its back faces is a source of the speckled z-fighting that
    // damages printed graphics — and double-siding it buys nothing, because
    // there is no inside of a decal to see.
    const doc = new Document()
    const mask = doc.createMaterial('mask').setAlphaMode('MASK').setDoubleSided(false)
    const fabric = doc.createMaterial('fabric').setAlphaMode('OPAQUE').setDoubleSided(false)

    const result = await solidifyMaterials(doc)

    expect(mask.getDoubleSided()).toBe(false)
    expect(fabric.getDoubleSided()).toBe(true)
    expect(result.doubleSided).toBe(1)
  })

  it('never forces a material single-sided', async () => {
    // Materials are only ever set double-sided, never back, so a source that
    // already double-sided its cutouts keeps that.
    const doc = new Document()
    const mask = doc.createMaterial('mask').setAlphaMode('MASK').setDoubleSided(true)

    await solidifyMaterials(doc)

    expect(mask.getDoubleSided()).toBe(true)
  })

  it('preserves source sidedness on a material that BECOMES MASK in this call', async () => {
    // The gap left open on 2026-08-04 and closed here.
    //
    // The two tests above cover materials that arrive ALREADY on MASK. Nothing
    // covered the conversion: a decal arriving on BLEND, resolved to MASK by the
    // cutout branch, and then reaching the sidedness step in the same pass — by
    // which point it is MASK, so the `!== 'MASK'` guard skips it.
    //
    // Under the pre-2026-08-04 path these same materials stayed BLEND and were
    // double-sided unconditionally, so the fix silently changed their sidedness.
    // That matters because a CLO decal whose normals face inward renders as
    // NOTHING once single-sided — the failure looks identical to the artwork bug
    // it was meant to fix. Measured on the real garment the same day: 10 of 26
    // MASK materials double-sided, each matching its source, so the code is
    // correct. It was simply unasserted.
    const doc = new Document()
    const texture = doc
      .createTexture('decal')
      .setImage(await wordmarkImage())
      .setMimeType('image/png')

    const twoSided = doc
      .createMaterial('decal-two-sided')
      .setAlphaMode('BLEND')
      .setDoubleSided(true)
      .setBaseColorTexture(texture)
    const oneSided = doc
      .createMaterial('decal-one-sided')
      .setAlphaMode('BLEND')
      .setDoubleSided(false)
      .setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    // Both converted...
    expect(twoSided.getAlphaMode()).toBe('MASK')
    expect(oneSided.getAlphaMode()).toBe('MASK')
    expect(result.masked).toBe(2)

    // ...and neither had its sidedness rewritten by the conversion.
    expect(twoSided.getDoubleSided()).toBe(true)
    expect(oneSided.getDoubleSided()).toBe(false)
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
    const materials = reread.getRoot().listMaterials()

    // Fabric goes solid and double-sided — the see-through-CLO fix, unchanged.
    const fabric = materials.filter((m) => !m.getBaseColorTexture())
    expect(fabric.length).toBeGreaterThan(0)
    for (const m of fabric) {
      expect(m.getAlphaMode()).toBe('OPAQUE')
      expect(m.getDoubleSided()).toBe(true)
    }

    // The printed graphic does NOT. Its alpha is a real cutout, so flattening it
    // to OPAQUE would fill the shape back in with the base colour — artwork that
    // is half there. MASK keeps the shape and is still order-independent, and it
    // is deliberately not double-sided: a decal sits a fraction of a millimetre
    // off the fabric, and drawing its back faces invites z-fighting.
    const graphic = materials.filter((m) => m.getBaseColorTexture())
    // The SVG decal plus the five measured artwork profiles. Asserting EVERY one
    // rather than the first is the point: the gate that blocked production
    // refused FIVE materials at once, and a fixture carrying one could never
    // have shown whether the pipeline resolves all of them or merely the first.
    expect(graphic).toHaveLength(1 + PLACEHOLDER_ARTWORK.length)
    for (const m of graphic) {
      expect(m.getAlphaMode()).toBe('MASK')
      expect(m.getAlphaCutoff()).toBe(0.5)
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
    for (const prim of reread
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())) {
      const ml = prim.getExtension<MappingList>('KHR_materials_variants')
      if (!ml) continue
      for (const mapping of ml.listMappings()) {
        expect(mapping.getMaterial()).not.toBeNull()
      }
    }
  })
})
