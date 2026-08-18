import { Document } from '@gltf-transform/core'
import { KHRMaterialsVariants } from '@gltf-transform/extensions'
import { describe, expect, it } from 'vitest'
import { readVariantColours } from './variant-colour'

/**
 * Fixtures modelled on what a real CLO export turned out to contain.
 *
 * N001's file: 5 variants, 44 active materials each, split 18 / 14 / 6 / 4 —
 * a dominant body fabric, a secondary panel fabric, zipper tape, and a slider.
 * The colour a buyer means is the dominant one; the zips and the printed logo
 * are not the garment's colour and must never be sampled.
 */

/** A quad of the given area at the given position, so area weighting is testable. */
function addQuad(document: Document, size: number) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const s = size
  const positions = new Float32Array([0, 0, 0, s, 0, 0, 0, 0, s, s, 0, s])
  const indices = new Uint32Array([0, 1, 2, 1, 3, 2])
  const prim = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
    )
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
  const mesh = document.createMesh().addPrimitive(prim)
  document.createScene().addChild(document.createNode().setMesh(mesh))
  return prim
}

/** Linear RGB for an sRGB byte triple — glTF stores baseColorFactor in linear light. */
function linear(r: number, g: number, b: number): [number, number, number, number] {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return [f(r), f(g), f(b), 1]
}

describe('readVariantColours', () => {
  it('names each variant from its dominant fabric', () => {
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const navy = ext.createVariant('Colorway 2')
    const green = ext.createVariant('Colorway 3')

    const body = addQuad(document, 10) // large — this is the garment colour
    const navyBody = document.createMaterial('FABRIC 5_navy').setBaseColorFactor(linear(27, 42, 74))
    const greenBody = document
      .createMaterial('FABRIC 5_green')
      .setBaseColorFactor(linear(0, 77, 36))
    body.setExtension(
      'KHR_materials_variants',
      ext
        .createMappingList()
        .addMapping(ext.createMapping().setMaterial(navyBody).addVariant(navy))
        .addMapping(ext.createMapping().setMaterial(greenBody).addVariant(green)),
    )

    const colours = readVariantColours(document)

    expect(colours.map((c) => c.variantId)).toEqual(['Colorway 2', 'Colorway 3'])
    expect(colours[0]).toMatchObject({ name: 'Navy', confidence: 'high' })
    expect(colours[1]).toMatchObject({ name: 'Forest Green', confidence: 'high' })
  })

  it('weights by surface area, not by how many materials there are', () => {
    // The trap: a garment with many small crimson panels and one large navy body
    // is a navy garment. Counting materials would call it crimson.
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 2')

    const bigBody = addQuad(document, 20)
    const navy = document.createMaterial('FABRIC 1_body').setBaseColorFactor(linear(27, 42, 74))
    bigBody.setExtension(
      'KHR_materials_variants',
      ext.createMappingList().addMapping(ext.createMapping().setMaterial(navy).addVariant(variant)),
    )
    for (let i = 0; i < 5; i++) {
      const panel = addQuad(document, 2)
      const crimson = document
        .createMaterial(`FABRIC 2_panel_${i}`)
        .setBaseColorFactor(linear(179, 34, 47))
      panel.setExtension(
        'KHR_materials_variants',
        ext
          .createMappingList()
          .addMapping(ext.createMapping().setMaterial(crimson).addVariant(variant)),
      )
    }

    expect(readVariantColours(document)[0]).toMatchObject({ name: 'Navy' })
  })

  it('never samples the zips, and never samples the printed logo', () => {
    // Both are present on every real garment and neither is its colour. The
    // zipper slider in N001's file is #000000 on all five colourways; sampling
    // it would name every single one "Black".
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 2')

    const map = (
      prim: ReturnType<typeof addQuad>,
      material: ReturnType<Document['createMaterial']>,
    ) =>
      prim.setExtension(
        'KHR_materials_variants',
        ext
          .createMappingList()
          .addMapping(ext.createMapping().setMaterial(material).addVariant(variant)),
      )

    // The trim and the artwork cover MORE area than the fabric, so only an
    // explicit exclusion can get this right.
    map(
      addQuad(document, 4),
      document.createMaterial('FABRIC 3_body').setBaseColorFactor(linear(27, 42, 74)),
    )
    map(
      addQuad(document, 30),
      document.createMaterial('Zipper 2_Slider').setBaseColorFactor(linear(0, 0, 0)),
    )
    map(
      addQuad(document, 30),
      document.createMaterial('Zipper 2_TapeFabric').setBaseColorFactor(linear(0, 0, 0)),
    )
    const logoTexture = document
      .createTexture('RUN LOGO')
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    map(
      addQuad(document, 30),
      document
        .createMaterial('Teamwear Logo')
        .setBaseColorFactor(linear(179, 34, 47))
        .setBaseColorTexture(logoTexture),
    )

    expect(readVariantColours(document)[0]).toMatchObject({ name: 'Navy' })
  })

  it('returns nothing for a file with no variants rather than inventing one', () => {
    const document = new Document()
    addQuad(document, 5)
    expect(readVariantColours(document)).toEqual([])
  })

  it('reports which material it sampled, so a wrong answer is diagnosable', () => {
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 2')
    const body = addQuad(document, 10)
    body.setExtension(
      'KHR_materials_variants',
      ext.createMappingList().addMapping(
        ext
          .createMapping()
          .setMaterial(
            document.createMaterial('FABRIC 5_3068').setBaseColorFactor(linear(27, 42, 74)),
          )
          .addVariant(variant),
      ),
    )

    expect(readVariantColours(document)[0]!.sampledMaterial).toBe('FABRIC 5_3068')
  })
})

describe('a white factor over a texture is not a confident "White"', () => {
  /** One variant whose dominant fabric is pure white, optionally textured. */
  function whiteGarment(textured: boolean) {
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 1')

    const body = addQuad(document, 10)
    const material = document
      .createMaterial('FABRIC 5_white')
      .setBaseColorFactor(linear(255, 255, 255))
    if (textured) {
      material.setBaseColorTexture(
        document
          .createTexture('print')
          .setImage(new Uint8Array([1, 2, 3, 4]))
          .setMimeType('image/png'),
      )
    }
    body.setExtension(
      'KHR_materials_variants',
      ext
        .createMappingList()
        .addMapping(ext.createMapping().setMaterial(material).addVariant(variant)),
    )
    return document
  }

  it('a WHITE FACTOR WITH a base-colour texture returns low confidence', () => {
    // L9. #FFFFFF matches GREY_RAMP's White at deltaE ~ 0, so this used to return
    // confidence 'high' — confidently wrong rather than uncertain, which is
    // precisely what the blanking in importColours.ts cannot catch.
    const colours = readVariantColours(whiteGarment(true))
    expect(colours[0]).toMatchObject({ confidence: 'low' })
  })

  it('a WHITE FACTOR WITHOUT a texture keeps high confidence', () => {
    // A genuinely white garment must keep its name. Widening the rule to every
    // white factor would blank real colourways — a worse bug than the one fixed.
    const colours = readVariantColours(whiteGarment(false))
    expect(colours[0]).toMatchObject({ confidence: 'high' })
  })

  it('a NON-white factor with a texture is unaffected', () => {
    // Every printed garment has a base-colour texture. Only the white-factor case
    // is ambiguous; navy with a print is still navy.
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 1')
    const body = addQuad(document, 10)
    const material = document
      .createMaterial('FABRIC 5_navy')
      .setBaseColorFactor(linear(27, 42, 74))
      .setBaseColorTexture(
        document
          .createTexture('print')
          .setImage(new Uint8Array([1, 2, 3, 4]))
          .setMimeType('image/png'),
      )
    body.setExtension(
      'KHR_materials_variants',
      ext
        .createMappingList()
        .addMapping(ext.createMapping().setMaterial(material).addVariant(variant)),
    )

    expect(readVariantColours(document)[0]).toMatchObject({ name: 'Navy', confidence: 'high' })
  })
})
