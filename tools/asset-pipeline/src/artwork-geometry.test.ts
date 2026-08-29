import { Document, type Mesh, type Material } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { ARTWORK_MAX_UV_SPAN, findArtworkTexturesByGeometry } from './artwork-geometry'

/**
 * Add one quad whose TEXCOORD_0 spans `span` in both axes.
 *
 * The UV SPAN is the signal. Measured 2026-08-27 across all 28 raw CLO exports:
 * fabric primitives have a median span of 294.81 and a 5th percentile of 69.91,
 * while artwork sits at 1.00. Two orders of magnitude apart, and it is readable
 * from the accessor's own min/max with no decode at all.
 */
function addQuad(doc: Document, mesh: Mesh, material: Material, span: number) {
  const buffer = doc.getRoot().listBuffers()[0]!
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
    .setBuffer(buffer)
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, span, 0, span, span, 0, span]))
    .setBuffer(buffer)
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer)
  mesh.addPrimitive(
    doc
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('TEXCOORD_0', uv)
      .setIndices(indices)
      .setMaterial(material),
  )
}

function textured(doc: Document, name: string) {
  const texture = doc
    .createTexture(name)
    .setImage(new Uint8Array([1]))
    .setMimeType('image/png')
  const material = doc.createMaterial(name).setBaseColorTexture(texture)
  return { texture, material }
}

describe('findArtworkTexturesByGeometry', () => {
  it('finds artwork whose material name is a SKU code no word list can match', async () => {
    // THE REASON THIS EXISTS. Measured across the 28 exports, artwork materials are
    // called things like `ZZ00000ZZZZ0`, `ZZZ00000`, `76197`, `01`, `Untitled-1` and
    // `ルン ろご。` (Japanese for "run logo"). Roughly 300 materials carry names no
    // English word list can ever match, and on 8 of 28 garments NOTHING matched, so
    // the printed artwork was compressed as if it were plain cloth.
    const doc = new Document()
    doc.createBuffer()
    const mesh = doc.createMesh('garment')
    const sku = textured(doc, 'ZZ00000ZZZZ0')
    const fabric = textured(doc, 'V2_Cut_Sew_Knit_Jersey_2')
    addQuad(doc, mesh, sku.material, 1)
    addQuad(doc, mesh, fabric.material, 300)

    const found = findArtworkTexturesByGeometry(doc)
    expect(found.has(sku.texture)).toBe(true)
    expect(found.has(fabric.texture)).toBe(false)
  })

  it('EXCLUDES topstitch, which is unit-square in UV but is thread, not artwork', async () => {
    // `Topstitch 1 Copy 1` on X-MILO measures exactly 1.000 x 1.000 — the same span
    // as the slogan. Only the name separates them, and 1,707 stitch primitives
    // across the catalogue sit at a median span of 0.83, so without this guard the
    // geometric signal would hand every one of them the artwork budget.
    const doc = new Document()
    doc.createBuffer()
    const mesh = doc.createMesh('garment')
    const stitch = textured(doc, 'Topstitch 1 Copy 1')
    addQuad(doc, mesh, stitch.material, 1)
    expect(findArtworkTexturesByGeometry(doc).has(stitch.texture)).toBe(false)
  })

  it('EXCLUDES hardware, which is also small in UV', async () => {
    const doc = new Document()
    doc.createBuffer()
    const mesh = doc.createMesh('garment')
    const zip = textured(doc, 'Zipper 1_Slider_3582')
    addQuad(doc, mesh, zip.material, 1)
    expect(findArtworkTexturesByGeometry(doc).has(zip.texture)).toBe(false)
  })

  it('catches artwork that is NOT a perfect unit square', async () => {
    // `Asset 5` on X-MILO measures 8.909 x 1.000. A strict unit-square test misses
    // it; the threshold is set well above so it does not.
    const doc = new Document()
    doc.createBuffer()
    const mesh = doc.createMesh('garment')
    const asset = textured(doc, 'Asset 5')
    addQuad(doc, mesh, asset.material, 8.909)
    expect(findArtworkTexturesByGeometry(doc).has(asset.texture)).toBe(true)
    expect(ARTWORK_MAX_UV_SPAN).toBeGreaterThan(8.909)
  })

  it('does NOT claim a texture a fabric primitive also uses', async () => {
    // A texture shared between a decal quad and a garment panel must keep the
    // fabric budget: raising it would be harmless, but claiming a 6835x5331 fabric
    // atlas as artwork would keep it at 4096 and blow the size ceiling.
    const doc = new Document()
    doc.createBuffer()
    const mesh = doc.createMesh('garment')
    const shared = textured(doc, 'Asset 2')
    const alsoFabric = doc.createMaterial('FABRIC 1').setBaseColorTexture(shared.texture)
    addQuad(doc, mesh, shared.material, 1)
    addQuad(doc, mesh, alsoFabric, 400)
    expect(findArtworkTexturesByGeometry(doc).has(shared.texture)).toBe(false)
  })

  it('ignores a primitive with no TEXCOORD_0 rather than guessing', async () => {
    const doc = new Document()
    doc.createBuffer()
    const mesh = doc.createMesh('garment')
    const m = textured(doc, 'Asset 1')
    const buffer = doc.getRoot().listBuffers()[0]!
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer)
    mesh.addPrimitive(
      doc.createPrimitive().setAttribute('POSITION', position).setMaterial(m.material),
    )
    expect(findArtworkTexturesByGeometry(doc).has(m.texture)).toBe(false)
  })
})
