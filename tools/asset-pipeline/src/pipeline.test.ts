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
  assertFlagsOnly,
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

/**
 * Build a GLB carrying one large embedded PNG baseColor texture, shaped like FABRIC.
 *
 * ⚠️ THE UV SPAN AND THE MATERIAL NAME ARE BOTH LOAD-BEARING, since 2026-08-27.
 * This helper used to build a unit-square quad on a material called `m`, which is
 * the shape of a DECAL, not of cloth — so once artwork was detected geometrically
 * every texture it produced took the artwork budget and the maxTextureSize tests
 * stopped measuring what they claimed to.
 *
 * A real CLO fabric panel is mapped across a large atlas: measured over all 28 raw
 * exports, fabric primitives have a median UV span of 294.81 against artwork's 1.00.
 * The span of 120 below sits squarely in the fabric population. Same rule as the
 * rest of this file — if production looks like that, seed that.
 */
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
  const material = doc.createMaterial('Cotton_Jersey_m').setBaseColorTexture(texture)
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(doc.getRoot().listBuffers()[0]!)
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 120, 0, 0, 120]))
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
    // ⚠️ THIS WAS 12 UNTIL 2026-08-27, AND THE DIFFERENCE IS THE WHOLE POINT.
    // Every colourway used to build byte-identical artwork materials, so `dedup()`
    // merged each into ONE shared material bound as the primitive default — always
    // eager, always reachable. Real CLO exports tint the ink per colourway, so
    // nothing merges and every colourway but the first sits behind
    // KHR_materials_variants, where model-viewer loads it LAZILY. A fixture
    // without that could not exhibit the bug where a viewer-side material fix
    // reached 6 of 26 decals; see `ink` on PlaceholderColourway.
    // Per colourway: body + trim + 1 SVG decal + 5 real profiles = 8, x 3 = 24.
    expect(report.materialCount).toBe(
      PLACEHOLDER_COLOURWAYS.length * (3 + PLACEHOLDER_ARTWORK.length),
    )

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

/**
 * ⚠️ THE SAME SHAPE, A SECOND TIME, AND NOBODY HAD WRITTEN IT DOWN.
 *
 * `texture` behaves exactly like `opaque` above: `parseOptimizeArgs` defaults it to
 * 'webp', while `optimizeGlb` only re-encodes when `options.texture === 'webp'` is
 * explicitly true. So a hand-built options object skips the image-compression step
 * ENTIRELY — every texture ships as the raw PNG or JPEG CLO exported.
 *
 * That is a bigger miss than the opaque one it mirrors: on the live cycling suit the
 * WebP pass is the difference between 1.71 MB of images and tens of megabytes, and
 * nothing downstream would object. The size gate measures the total and would simply
 * report a fatter file; no gate tests the texture format.
 *
 * Found by the 2026-08-28 audit, pinned here 2026-08-29. Untested until now, which is
 * why it was undocumented: the opaque mismatch was found the same way and written up,
 * and this one sat beside it unnoticed.
 */
describe('the texture default differs the same way — the undocumented sibling', () => {
  it('parseOptimizeArgs turns WebP re-encoding ON unless asked not to', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'out.glb']).options.texture).toBe('webp')
  })

  it('⚠️ optimizeGlb SKIPS image compression entirely when texture is absent', async () => {
    /*
     * ⚠️ THIS TEST WAS A TAUTOLOGY UNTIL 2026-08-29, and an independent check caught it.
     * It asserted `handBuilt.texture === undefined` on a local object literal it had just
     * declared, and never called optimizeGlb — so it passed regardless of what the
     * production code did, and would still pass if optimize.ts:557 were rewritten to
     * `options.texture !== 'none'`. It pinned nothing.
     *
     * This calls the real function with NO texture codec and asserts the observable
     * consequence: the images come out in the format CLO wrote them, un-re-encoded. That
     * is the actual hazard — a hand-built options object ships every texture as the raw
     * PNG or JPEG, and on the live cycling suit the WebP pass is the difference between
     * 1.71 MB of images and tens of megabytes. No gate tests the texture FORMAT; the size
     * gate would simply report a fatter file.
     */
    const tee = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const src = join(dir, 'texture-default-src.glb')
    const out = join(dir, 'texture-default-out.glb')
    await writeFile(src, await (await createIO()).writeBinary(tee))

    const result = await optimizeGlb(src, out, {})

    // Whatever the fixture ships as, it must come back UNCHANGED — no WebP anywhere.
    expect(result.textureFormats).not.toContain('image/webp')

    // ...and the parser's default really would have re-encoded them, which is the
    // half that makes the mismatch a mismatch rather than just a default.
    const { options } = parseOptimizeArgs([src, '--out', out])
    expect(options.texture).toBe('webp')
  })

  it('still honours an explicit codec choice', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'out.glb', '--ktx2']).options.texture).toBe('ktx2')
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

  // 2026-08-29. merge-variants.ts claimed, above its flag loop, that it was
  // "kept in step with parseOptimizeArgs: the two commands share one compression
  // policy, so a decimation flag that works on `optimize` must work here too."
  // It was not, and the claim is what made the gap invisible: six flags that
  // `optimize` accepts made `merge` exit 1, because an unrecognised token falls
  // through to the positional branch and is read as <file>=<VARIANT-ID>.
  //
  // Found by trying to merge a five-colourway CLO export with the flag list
  // production actually uses. `shrinkFlagsFor('fidelity')` contains --stitch,
  // --stitch-error and --data-max-texture, so the exact arguments every shrink
  // job runs could not be passed to `merge` at all.
  const OPTIMIZE_VALUE_FLAGS: readonly (readonly [string, string])[] = [
    ['--max-texture', '4096'],
    ['--quality', '75'],
    ['--artwork-quality', '95'],
    ['--artwork-max-texture', '4096'],
    ['--simplify', '0.05'],
    ['--simplify-error', '0.0002'],
    ['--uv-weight', '2'],
    ['--normal-weight', '1'],
    ['--stitch', '0.03'],
    ['--stitch-error', '0.0005'],
    ['--data-max-texture', '2048'],
  ]

  it.each(OPTIMIZE_VALUE_FLAGS)('accepts %s, exactly as optimize does', (flag, value) => {
    // parseOptimizeArgs is the positive control: if IT rejects the flag the
    // table is wrong, not the parser under test.
    expect(() => parseOptimizeArgs(['in.glb', flag, value])).not.toThrow()
    const parsed = parseMergeArgs([flag, value, 'a.glb=N001-A'])
    expect(parsed.inputs).toHaveLength(1)
    expect(parsed.inputs[0]).toEqual({ file: 'a.glb', variantName: 'N001-A' })
  })

  it('accepts the production flag list verbatim', () => {
    // Mirrors shrinkFlagsFor('fidelity') in packages/shared/src/shrink.ts. Copied
    // rather than imported: this package installs with plain npm inside
    // apps/shrink/Dockerfile, so it cannot depend on @run-apparel/shared. If the
    // two drift, the per-flag table above still catches the class.
    const fidelity = [
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--simplify',
      '0.05',
      '--simplify-error',
      '0.0002',
      '--uv-weight',
      '2',
      '--meshopt',
      '--max-texture',
      '4096',
      '--data-max-texture',
      '2048',
      '--quality',
      '75',
    ]
    const parsed = parseMergeArgs([...fidelity, 'a.glb=N001-A', 'b.glb=N001-B'])
    expect(parsed.inputs).toHaveLength(2)
    expect(parsed.options).toMatchObject({
      geometry: 'meshopt',
      maxTextureSize: 4096,
      textureQuality: 75,
      dataMaxTextureSize: 2048,
      simplify: 0.05,
      simplifyError: 0.0002,
      simplifyUvWeight: 2,
      stitch: 0.03,
      stitchError: 0.0005,
    })
  })

  // The defect 390ff27 fixed in parseOptimizeArgs, still live here on 2026-08-29:
  // merge used bare Number(), so "--quality garbage" became NaN and was used as a
  // real value. The `?? DEFAULT` spellings made it worse by looking deliberate —
  // they only catch a MISSING token, never a malformed one.
  it.each(['--max-texture', '--quality', '--simplify', '--stitch', '--data-max-texture'])(
    'refuses garbage after %s instead of silently using NaN',
    (flag) => {
      expect(() => parseMergeArgs([flag, 'garbage', 'a.glb=N001-A'])).toThrow(/needs a number/)
      expect(() => parseMergeArgs(['a.glb=N001-A', flag])).toThrow(/needs a number/)
    },
  )

  it('still accepts 0 for a flag whose 0 is meaningful', () => {
    // The other half of 390ff27: a falsy-but-valid 0 must survive.
    expect(parseMergeArgs(['--simplify', '0', 'a.glb=N001-A']).options.simplify).toBe(0)
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
  /**
   * A halftone print: dots of solid ink on a fully transparent ground, with the
   * dot edges antialiased. Thousands of small dots means far more edge per unit
   * area than a wordmark, which is exactly why this shape sat just outside the
   * old cutout band. Measured on the real Cycling-Bib print: 73.33% fully
   * transparent, 19.73% opaque, 6.94% mid.
   */
  async function halftoneImage(): Promise<Uint8Array> {
    const width = 128
    const height = 128
    const raw = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      raw[i * 4] = 20
      raw[i * 4 + 1] = 20
      raw[i * 4 + 2] = 20
      raw[i * 4 + 3] = 0 // transparent ground -- this is what CUTS OUT
    }
    // Dots on an 8px grid: solid core, one antialiased ring.
    for (let cy = 4; cy < height; cy += 8) {
      for (let cx = 4; cx < width; cx += 8) {
        for (let y = cy - 3; y <= cy + 3; y++) {
          for (let x = cx - 3; x <= cx + 3; x++) {
            if (x < 0 || y < 0 || x >= width || y >= height) continue
            const d = Math.hypot(x - cx, y - cy)
            // Radii chosen by MEASURING the resulting alpha profile against the
            // real print (73.33/19.73/6.94), not by eye: this gives 79.69%
            // transparent, 14.06% opaque, 6.25% mid -- inside the same band, and
            // above the old 0.05 ceiling so the test genuinely exercises the change.
            const a = d <= 1.8 ? 255 : d <= 2.1 ? 128 : 0
            if (a) raw[(y * width + x) * 4 + 3] = a
          }
        }
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer()
    return new Uint8Array(png)
  }

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

  it('MASKs a halftone print, whose many soft dot edges sit past the old ceiling', async () => {
    // Found 2026-08-21 by the owner looking at the garment, not by any gate. The
    // Cycling-Bib halftone measures 6.94% mid -- just past the old 0.05 ceiling --
    // so it stayed BLEND, and with no order-independent transparency in
    // <model-viewer> it sorted badly against the geometry behind it. The reported
    // symptom was "sometimes it feels like the stitches are see through".
    const doc = new Document()
    const texture = doc
      .createTexture('halftone')
      .setImage(await halftoneImage())
      .setMimeType('image/png')
    const print = doc
      .createMaterial('Material_Graphic')
      .setAlphaMode('BLEND')
      .setBaseColorTexture(texture)

    const result = await solidifyMaterials(doc)

    expect(print.getAlphaMode()).toBe('MASK')
    expect(print.getAlphaCutoff()).toBe(0.5)
    expect(result).toMatchObject({ masked: 1, keptBlend: 0 })
  })

  it('does NOT double-side a material named as printed artwork', async () => {
    // A care label is authored on the INSIDE and single-sided, so backface culling
    // hides it from outside. Forcing it double-sided rendered its back face through
    // the fabric -- MIRRORED, text reversed, on the outside of the garment.
    //
    // Matched on the MATERIAL name because a CLO export leaves every texture
    // anonymous: 0 of 24 textures in the measured file had a name or URI, which is
    // why a texture-name-only check was silently inert.
    const doc = new Document()
    const texture = doc
      .createTexture()
      .setImage(await sheerImage())
      .setMimeType('image/png')
    const label = doc
      .createMaterial('White Black Bold Minimalist Clothing Label_9946645')
      .setAlphaMode('BLEND')
      .setBaseColorTexture(texture)
      .setDoubleSided(false)

    await solidifyMaterials(doc)

    expect(label.getDoubleSided()).toBe(false)
  })

  it('NEGATIVE CONTROL: an identically-shaped FABRIC material is still double-sided', async () => {
    // Without this, the test above would pass even if double-siding had been
    // switched off altogether -- which would reintroduce the see-through fabric
    // the whole solidify step exists to fix.
    const doc = new Document()
    const texture = doc
      .createTexture()
      .setImage(await sheerImage())
      .setMimeType('image/png')
    const fabric = doc
      .createMaterial('SUPPLIER_DOBBY_A_8132292')
      .setAlphaMode('BLEND')
      .setBaseColorTexture(texture)
      .setDoubleSided(false)

    await solidifyMaterials(doc)

    expect(fabric.getDoubleSided()).toBe(true)
  })

  it('NEGATIVE CONTROL: a FABRIC whose name merely contains "text" is still double-sided', async () => {
    // The artwork word list contains `text` and `type`, which is fine for TEXTURE
    // names but not for MATERIAL names: CLO writes `Textile_Cotton`,
    // `Texture_Map_01`, `Polyester_Textured`. Matching those as artwork would
    // exempt real fabric from double-siding and silently reinstate the
    // see-through-garment bug. Hence the tighter, token-boundary pattern.
    const doc = new Document()
    const texture = doc
      .createTexture()
      .setImage(await sheerImage())
      .setMimeType('image/png')
    const fabric = doc
      .createMaterial('Textile_Cotton_190gsm')
      .setAlphaMode('BLEND')
      .setBaseColorTexture(texture)
      .setDoubleSided(false)

    await solidifyMaterials(doc)

    expect(fabric.getDoubleSided()).toBe(true)
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
    // The SVG decal plus the five measured artwork profiles, ONCE PER COLOURWAY —
    // they no longer dedup, because each carries its colourway's ink. Asserting
    // EVERY one rather than the first is the point: the gate that blocked
    // production refused FIVE materials at once, and a fixture carrying one could
    // never have shown whether the pipeline resolves all of them or merely the
    // first. Now it also proves the pipeline resolves them in every colourway,
    // not just the one bound as the default.
    expect(graphic).toHaveLength(PLACEHOLDER_COLOURWAYS.length * (1 + PLACEHOLDER_ARTWORK.length))
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

describe('malformed numeric flags fail loudly instead of becoming NaN', () => {
  // L8, 2026-08-18. `??` tests for null/undefined, not NaN — `NaN ?? 0.0001` is
  // NaN — so the downstream defaults could never catch a mistyped value. The four
  // dials that matter most are the ones with no fallback at all.
  it('parses well-formed values unchanged', () => {
    const { options } = parseOptimizeArgs([
      'in.glb',
      '--simplify-error',
      '0.001',
      '--uv-weight',
      '1',
    ])
    expect(options.simplifyError).toBe(0.001)
    expect(options.simplifyUvWeight).toBe(1)
  })

  it('accepts ZERO — --uv-weight 0 is the artwork eval negative control', () => {
    // Rejecting 0 as falsy would break the one case that represents destroyed
    // artwork, which is how this guard could quietly make the eval useless.
    const { options } = parseOptimizeArgs(['in.glb', '--uv-weight', '0'])
    expect(options.simplifyUvWeight).toBe(0)
  })

  it('rejects a missing value and names the flag', () => {
    expect(() => parseOptimizeArgs(['in.glb', '--simplify-error'])).toThrow(/--simplify-error/)
  })

  it('rejects a letter-O typed for a zero', () => {
    expect(() => parseOptimizeArgs(['in.glb', '--simplify-error', '0.OO1'])).toThrow(
      /--simplify-error/,
    )
  })

  it('rejects a letter-l on the axis that decides whether artwork survives', () => {
    expect(() => parseOptimizeArgs(['in.glb', '--uv-weight', 'l'])).toThrow(/--uv-weight/)
  })
})

describe('the container rejects a bare path in its flags array', () => {
  // M6, 2026-08-18. server.ts commented that only `--`-prefixed flags and their
  // values are accepted. It filtered on typeof === 'string' only, and
  // parseOptimizeArgs ends its loop with `else if (!arg.startsWith('--')) input =
  // arg` — so a bare string in the flags array silently became the INPUT PATH.
  it('documents the parser behaviour that made this reachable', () => {
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb']).input).toBe('in.glb')
    expect(parseOptimizeArgs(['in.glb', '--out', 'o.glb', '/etc/passwd']).input).toBe('/etc/passwd')
  })

  it('accepts a well-formed flag list', () => {
    expect(() => assertFlagsOnly(['--opaque', '--simplify-error', '0.001'])).not.toThrow()
  })

  it('accepts a value that would look like a bare token on its own', () => {
    // '0.001' does not start with `--`; it is legal because it FOLLOWS a
    // value-taking flag. Getting this wrong would reject every real invocation.
    expect(() => assertFlagsOnly(['--simplify-error', '0.001'])).not.toThrow()
  })

  it('rejects a bare path and names it', () => {
    expect(() => assertFlagsOnly(['--opaque', '/etc/passwd'])).toThrow(/etc\/passwd/)
  })
})

describe('an alpha profile that could not be measured does not become OPAQUE', () => {
  // N8, 2026-08-18. profileAlpha returns character 'unknown' with every fraction 0
  // when sharp cannot decode an image. Through solidifyMaterials that meant:
  // cutout false (0 >= CUTOUT_MIN_TRANSPARENT fails), character not 'graded', so
  // a BLEND material fell through to OPAQUE — a cutout rendered as a solid
  // rectangle. Reachable only on a SECOND pass with --ktx2.
  async function documentWithBlendMaterial(imageBytes: Uint8Array) {
    const document = new Document()
    const texture = document
      .createTexture('undecodable')
      .setImage(imageBytes)
      .setMimeType('image/png')
    document
      .createMaterial('decal')
      .setAlphaMode('BLEND')
      .setBaseColorFactor([1, 1, 1, 1])
      .setBaseColorTexture(texture)
    return document
  }

  it('leaves alphaMode untouched when the image cannot be decoded', async () => {
    // Bytes sharp cannot read at all — the exact condition behind 'unknown'.
    const document = await documentWithBlendMaterial(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
    const material = document.getRoot().listMaterials()[0]!
    const profile = await profileAlpha(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(profile.character, 'fixture must actually produce the unknown case').toBe('unknown')

    await solidifyMaterials(document)
    expect(material.getAlphaMode()).toBe('BLEND')
  })

  it('still opaques an UNTEXTURED blend material — the CLO stray-opacity case', async () => {
    // 'none' is not 'unknown'. An untextured material has genuinely no pixels and
    // must keep falling through to OPAQUE; that is what this step was built for,
    // and the new branch must not swallow it.
    const document = new Document()
    const material = document
      .createMaterial('stray')
      .setAlphaMode('BLEND')
      .setBaseColorFactor([1, 1, 1, 1])

    await solidifyMaterials(document)
    expect(material.getAlphaMode()).toBe('OPAQUE')
  })
})

/**
 * THE SEE-THROUGH-ON-ROTATION DEFECT, 2026-08-27.
 *
 * Reported as "upon rotating the product, it becomes see-through", and previously
 * believed fixed. It was fixed — on the garment it was verified against. The live
 * product (`cycling-all-colours-optimized-4.glb`, 200 materials) ships with ZERO
 * BLEND materials and is unaffected, which is why the fix looked complete.
 *
 * MEASURED 2026-08-26/27 on the raw X-MILO CORE OVERSIZE export. Its main fabric
 * texture is 6835x5331 and its alpha channel contains, across all 36,437,385
 * pixels:
 *
 *     fully clear (0)      0.000%   <- NOT ONE PIXEL
 *     1-191                0.699%
 *     192-247              5.971%
 *     248-255 (solid)     93.330%
 *
 * The alpha channel is anti-aliasing the garment panel edges inside a texture
 * atlas. It is not translucency: a texture with no clear pixels cannot be seen
 * through. But `profileAlpha` calls a texture 'opaque' only at >= 99.9% solid, and
 * 'binary' only at <= 2% partial, so 93.33%/6.67% falls through to 'graded' and
 * solidifyMaterials deliberately keeps it BLEND. <model-viewer> has no
 * order-independent transparency, so those materials depth-sort per object and the
 * garment turns see-through as it rotates. 99 BLEND in, 50 BLEND out.
 *
 * The discriminator is the pair, not either half. Measured across three garments,
 * every genuinely translucent or cut-out texture carries at least 9.29% fully-clear
 * pixels; this one carries 0.00%. And a uniformly sheer fabric — chiffon — also has
 * no clear pixels but almost no SOLID ones either, so requiring both halves leaves
 * it alone.
 */
describe('fabric whose alpha is only anti-aliasing must not stay see-through', () => {
  /**
   * A texture shaped exactly like X-MILO's fabric: no fully-clear pixel anywhere,
   * a large solid interior, and a soft band around the border.
   */
  async function antiAliasedFabric(size = 128, band = 3): Promise<Uint8Array> {
    const raw = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        raw[i] = 120
        raw[i + 1] = 130
        raw[i + 2] = 150
        const edge = Math.min(x, y, size - 1 - x, size - 1 - y)
        // 200..250 in the band — visibly solid, but under the 248 "fully solid" line.
        raw[i + 3] = edge < band ? 200 + edge * 16 : 255
      }
    }
    return new Uint8Array(
      await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toBuffer(),
    )
  }

  /** Uniformly half-transparent: real sheer fabric. No clear pixels AND no solid ones. */
  async function uniformlySheer(size = 64): Promise<Uint8Array> {
    const raw = Buffer.alloc(size * size * 4)
    for (let i = 0; i < raw.length; i += 4) {
      raw[i] = 200
      raw[i + 1] = 200
      raw[i + 2] = 200
      raw[i + 3] = 128
    }
    return new Uint8Array(
      await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toBuffer(),
    )
  }

  function blendMaterialWith(document: Document, image: Uint8Array, name: string) {
    const texture = document.createTexture(name).setImage(image).setMimeType('image/png')
    return document.createMaterial(name).setAlphaMode('BLEND').setBaseColorTexture(texture)
  }

  it('seeds a fixture with the SHAPE measured on the real export', async () => {
    // Guards the fixture itself. If this drifts, the test below stops reproducing
    // the defect and would pass for the wrong reason.
    const profile = await profileAlpha(await antiAliasedFabric())
    expect(profile.transparentFraction).toBe(0)
    expect(profile.opaqueFraction).toBeGreaterThan(0.8)
    expect(profile.midFraction).toBeGreaterThan(CUTOUT_MID_FRACTION)
    expect(profile.character).toBe('graded')
  })

  it('forces anti-aliased fabric OPAQUE instead of leaving it see-through', async () => {
    const document = new Document()
    document.createBuffer()
    const fabric = blendMaterialWith(document, await antiAliasedFabric(), 'Cloth_mesh_1')
    const result = await solidifyMaterials(document)
    expect(fabric.getAlphaMode()).toBe('OPAQUE')
    expect(result.opaqued).toBe(1)
    expect(result.keptBlend).toBe(0)
  })

  it('LEAVES uniformly sheer fabric alone — the negative control', async () => {
    // Without this the fix is indistinguishable from "force everything opaque",
    // which is the blanket rule solidifyMaterials was written to replace.
    const document = new Document()
    document.createBuffer()
    const sheer = blendMaterialWith(document, await uniformlySheer(), 'Mesh_Panel_1')
    const result = await solidifyMaterials(document)
    expect(sheer.getAlphaMode()).toBe('BLEND')
    expect(result.keptBlend).toBe(1)
  })

  it('still resolves a real cut-out to MASK, not OPAQUE', async () => {
    // A cutout has plenty of fully-clear pixels, so the new rule must not reach it.
    const size = 64
    const raw = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        raw[i] = 250
        raw[i + 1] = 250
        raw[i + 2] = 250
        raw[i + 3] = x < size / 2 ? 255 : 0
      }
    }
    const png = new Uint8Array(
      await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toBuffer(),
    )
    const document = new Document()
    document.createBuffer()
    const decal = blendMaterialWith(document, png, 'RUN LOGO_1')
    const result = await solidifyMaterials(document)
    expect(decal.getAlphaMode()).toBe('MASK')
    expect(decal.getAlphaCutoff()).toBe(0.5)
    expect(result.masked).toBe(1)
  })

  it('still respects an explicit sheer baseColorFactor over the pixels', async () => {
    // women athlatic dress has exactly 3 materials at baseColorFactor.a = 0.4, and
    // exactly 3 survive as BLEND today. An explicit declaration must keep winning:
    // MASK at 0.5 would discard every fragment and render it as nothing.
    const document = new Document()
    document.createBuffer()
    const sheer = blendMaterialWith(document, await antiAliasedFabric(), 'Cotton_Voile_1')
    sheer.setBaseColorFactor([1, 1, 1, 0.4])
    const result = await solidifyMaterials(document)
    expect(sheer.getAlphaMode()).toBe('BLEND')
    expect(result.keptBlend).toBe(1)
  })
})
