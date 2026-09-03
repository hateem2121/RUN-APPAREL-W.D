import { Document, type Material } from '@gltf-transform/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  DUPLICATE_WARNING_FRACTION,
  OVERSIZED_TEXTURE_PX,
  describeRawCensus,
  measureRawDocument,
  type RawCensus,
} from './raw-census'

/**
 * Every measurement is checked against a document built to exhibit it, and every
 * warning is checked BOTH WAYS — present on the file that earns it, absent on the file
 * that does not — so a line that never fires cannot pass for one that watches.
 */

async function png(
  width: number,
  height: number,
  alpha: number | null,
  seed = 0,
): Promise<Uint8Array> {
  const channels = alpha === null ? 3 : 4
  const raw = Buffer.alloc(width * height * channels)
  for (let i = 0; i < width * height; i++) {
    raw[i * channels] = (i + seed) % 251
    raw[i * channels + 1] = 120
    raw[i * channels + 2] = 60
    if (alpha !== null) raw[i * channels + 3] = i % 7 === 0 ? Math.round(alpha * 255) : 0
  }
  return new Uint8Array(await sharp(raw, { raw: { width, height, channels } }).png().toBuffer())
}

/** A quad drawn by `material`, mapped across `span` pattern units, on a mesh called `meshName`. */
function piece(
  document: Document,
  meshName: string,
  material: Material,
  span: number,
  triangles = 2,
) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  // `triangles` quads worth of index triples over four vertices: enough to count.
  const indices: number[] = []
  for (let t = 0; t < triangles; t++) indices.push(0, 1, 2)
  const prim = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
        .setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      document
        .createAccessor()
        .setType('VEC2')
        .setArray(new Float32Array([0, 0, span, 0, span, span, 0, span]))
        .setBuffer(buffer),
    )
    .setIndices(
      document
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array(indices))
        .setBuffer(buffer),
    )
    .setMaterial(material)
  document.createMesh(meshName).addPrimitive(prim)
  return prim
}

describe('measureRawDocument', () => {
  it('counts duplicate pictures by their bytes, names the worst, and spots the oversized one', async () => {
    const document = new Document()
    const fabricPng = await png(64, 64, null)
    const copies = [1, 2, 3].map((n) =>
      document.createTexture(`fabric copy ${n}`).setImage(fabricPng).setMimeType('image/png'),
    )
    const huge = document
      .createTexture('huge')
      .setImage(await png(OVERSIZED_TEXTURE_PX + 8, 4, null, 9))
      .setMimeType('image/png')
    const materials = copies.map((t, i) =>
      document
        .createMaterial(`FABRIC ${i + 1}`)
        .setBaseColorTexture(t)
        .setNormalTexture(huge),
    )
    for (const [i, m] of materials.entries()) piece(document, `Cloth_mesh_${i}`, m, 300)

    const census = await measureRawDocument(document)
    expect(census.images).toMatchObject({ total: 4, unique: 2 })
    expect(census.images.duplicateBytes).toBe(fabricPng.byteLength * 2)
    expect(census.images.duplicateFraction).toBeCloseTo(
      (fabricPng.byteLength * 2) / census.images.bytes,
      6,
    )
    expect(census.images.duplicates).toEqual([
      { name: 'fabric copy 1', copies: 3, bytes: fabricPng.byteLength * 2 },
    ])
    expect(census.oversized).toEqual([
      {
        name: 'huge',
        width: OVERSIZED_TEXTURE_PX + 8,
        height: 4,
        bytes: huge.getImage()?.byteLength,
        materials: ['FABRIC 1', 'FABRIC 2', 'FABRIC 3'],
      },
    ])
  })

  it('measures thread by MESH name and by MATERIAL name separately (ARISAN read 0% one way, 46% the other)', async () => {
    const document = new Document()
    const cloth = document.createMaterial('FABRIC 3')
    const stitchMaterial = document.createMaterial('Default Topstitch_3195')
    piece(document, 'Cloth_mesh', cloth, 300, 10)
    // Thread under a stitch material on an ordinary mesh: the mesh pattern misses it.
    piece(document, 'Cloth_mesh', stitchMaterial, 1, 30)
    // Thread on a Topstitch_* mesh with an unhelpful material name: the material pattern misses it.
    piece(document, 'Topstitch_1', document.createMaterial('Material_42'), 1, 60)
    const census = await measureRawDocument(document)
    expect(census.thread.triangles).toBe(100)
    expect(census.thread.byMesh).toBe(60)
    expect(census.thread.byMaterial).toBe(30)
    expect(census.thread.byMeshFraction).toBeCloseTo(0.6, 6)
    expect(census.thread.byMaterialFraction).toBeCloseTo(0.3, 6)
  })

  it('lists cloth drawn without a weave map, and never a print, thread or hardware', async () => {
    const document = new Document()
    const weave = document
      .createTexture('weave')
      .setImage(await png(8, 8, null))
      .setMimeType('image/png')
    const flat = document.createMaterial('cotton_interlock_190gsm')
    const textured = document.createMaterial('FABRIC 5').setNormalTexture(weave)
    const panelByShape = document.createMaterial('Material_7') // no fabric word, but a panel
    const print = document.createMaterial('RUN LOGO')
    const zipper = document.createMaterial('Zipper 2_Slider')
    piece(document, 'Cloth_mesh', flat, 300)
    piece(document, 'Cloth_mesh', textured, 300)
    piece(document, 'Cloth_mesh', panelByShape, 200)
    piece(document, 'Cloth_mesh', print, 1)
    piece(document, 'Zipper_1', zipper, 1)
    const census = await measureRawDocument(document)
    expect(census.fabricWithoutWeave).toEqual(['Material_7', 'cotton_interlock_190gsm'])
  })

  it('reports each print’s finish, opacity factor and the picture’s peak alpha', async () => {
    const document = new Document()
    const faint = document
      .createTexture('faint')
      .setImage(await png(16, 16, 0.4))
      .setMimeType('image/png')
    const solid = document
      .createTexture('solid')
      .setImage(await png(16, 16, 1))
      .setMimeType('image/png')
    const mr = document
      .createTexture('mr')
      .setImage(await png(8, 8, null))
      .setMimeType('image/png')
    const slogan = document
      .createMaterial('THE EXTRA MILE (Slogan)')
      .setBaseColorTexture(faint)
      .setBaseColorFactor([1, 1, 1, 0.5])
      .setRoughnessFactor(0.3)
    const logo = document
      .createMaterial('RUN LOGO')
      .setBaseColorTexture(solid)
      .setMetallicRoughnessTexture(mr)
      .setRoughnessFactor(0.6)
    piece(document, 'Cloth_mesh', slogan, 1)
    piece(document, 'Cloth_mesh', logo, 1)
    piece(document, 'Cloth_mesh', document.createMaterial('FABRIC 1'), 300)
    const census = await measureRawDocument(document)
    expect(census.artworkFinish).toEqual([
      {
        material: 'RUN LOGO',
        roughness: 0.6,
        metallic: 1,
        hasMrTexture: true,
        opacityFactor: 1,
        peakAlpha: 1,
      },
      {
        material: 'THE EXTRA MILE (Slogan)',
        roughness: 0.3,
        metallic: 1,
        hasMrTexture: false,
        opacityFactor: 0.5,
        peakAlpha: 0.4,
      },
    ])
  })
})

describe('describeRawCensus — warnings both ways', () => {
  const base = (): RawCensus => ({
    images: {
      total: 5,
      bytes: 1000,
      unique: 5,
      duplicateBytes: 0,
      duplicateFraction: 0,
      duplicates: [],
    },
    oversized: [],
    thread: {
      triangles: 100,
      byMesh: 0,
      byMaterial: 46,
      byMeshFraction: 0,
      byMaterialFraction: 0.46,
    },
    fabricWithoutWeave: [],
    artworkFinish: [],
  })

  it('warns about duplicates only past the threshold', () => {
    const quiet = describeRawCensus(base()).join('\n')
    expect(quiet).toMatch(/Raw export pictures: 5 \(5 distinct\)/)
    expect(quiet).not.toMatch(/DUPLICATES/)
    const loud = base()
    loud.images.duplicateBytes = 730
    loud.images.duplicateFraction = 0.73
    loud.images.unique = 2
    loud.images.duplicates = [{ name: 'fabric', copies: 4, bytes: 730 }]
    const text = describeRawCensus(loud).join('\n')
    expect(text).toMatch(/⚠️ 73\.0% of the picture bytes are DUPLICATES/)
    expect(text).toMatch(/fabric ×4/)
    expect(DUPLICATE_WARNING_FRACTION).toBeLessThan(0.73)
  })

  it('names oversized pictures with their sizes and the guide’s limits', () => {
    const census = base()
    census.oversized = [
      { name: 'weave', width: 6835, height: 5331, bytes: 12_900_000, materials: ['FABRIC 3'] },
    ]
    const text = describeRawCensus(census).join('\n')
    expect(text).toMatch(
      /⚠️ Pictures beyond 4096 px in the export: weave 6835×5331 \(12\.3 MB\) on FABRIC 3/,
    )
    expect(text).toMatch(/1024 for trim, 2048 for fabric, 4096 for artwork/)
    expect(describeRawCensus(base()).join('\n')).not.toMatch(/Pictures beyond/)
  })

  it('prints the thread line every run, both ways, and flags a stitch dial that matched nothing', () => {
    expect(describeRawCensus(base(), 0).join('\n')).toMatch(
      /Thread: 0\.0% of the triangles by mesh name \(Topstitch_\*\), 46\.0% by material name\. ⚠️ The --stitch pass matched NO mesh/,
    )
    expect(describeRawCensus(base(), 3).join('\n')).toMatch(
      /The --stitch pass matched 3 mesh\(es\)/,
    )
    const noThread = base()
    noThread.thread = {
      triangles: 100,
      byMesh: 0,
      byMaterial: 0,
      byMeshFraction: 0,
      byMaterialFraction: 0,
    }
    expect(describeRawCensus(noThread, 0).join('\n')).toMatch(
      /matched no mesh \(nothing to match\)/,
    )
    expect(describeRawCensus(noThread).join('\n')).toMatch(
      /Thread: 0\.0% .* 0\.0% by material name\.$/m,
    )
  })

  it('lists flat cloth and print finishes, flagging a translucent print', () => {
    const census = base()
    census.fabricWithoutWeave = ['cotton_interlock_190gsm']
    census.artworkFinish = [
      {
        material: 'RUN LOGO',
        roughness: 0.6,
        metallic: 0,
        hasMrTexture: false,
        opacityFactor: 1,
        peakAlpha: 1,
      },
      {
        material: 'Slogan',
        roughness: 0.3,
        metallic: 0,
        hasMrTexture: true,
        opacityFactor: 0.4,
        peakAlpha: 0.4,
      },
    ]
    const text = describeRawCensus(census).join('\n')
    expect(text).toMatch(
      /Cloth pieces with no weave \(normal\) map, so they render flat: cotton_interlock_190gsm/,
    )
    expect(text).toMatch(/RUN LOGO: roughness 0\.60, opacity 100\.0%, ink to 100\.0% alpha/)
    expect(text).toMatch(
      /Slogan: finish from its own map, opacity 40\.0%, ink to 40\.0% alpha ⚠️ translucent as exported/,
    )
    expect(text).toMatch(/CLO does not export a graphic’s opacity map/)
  })
})
