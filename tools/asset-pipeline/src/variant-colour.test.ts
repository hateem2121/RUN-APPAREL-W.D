import { Document } from '@gltf-transform/core'
import { KHRMaterialsVariants } from '@gltf-transform/extensions'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  BUSY_TEXTURE_NOTE,
  readVariantColours,
  readVariantColoursSampled,
  SHARED_TEXTURE_NOTE,
} from './variant-colour'

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

/** TEXCOORD_0 for a quad: a print maps its picture once (span 1); cloth tiles its swatch. */
function withUv(document: Document, prim: ReturnType<typeof addQuad>, span: number) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const uvs = new Float32Array([0, 0, span, 0, 0, span, span, span])
  return prim.setAttribute(
    'TEXCOORD_0',
    document.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer),
  )
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

  it('excludes an all-over PRINT whose texture is ANONYMOUS, as CLO exports them', () => {
    // ⚠️ THE TEST ABOVE CANNOT CATCH THIS, and that is the point. It names its
    // texture 'RUN LOGO', so the texture-name check fires. A real CLO export names
    // the MATERIAL and leaves every texture anonymous -- measured on the
    // Cycling-Bib file, **0 of 24 textures had a name or URI** -- so in production
    // nothing was ever excluded, and the fabric only won by surface area.
    //
    // When the halftone print moved BLEND -> MASK the area ranking flipped and all
    // five colourways were named from the print's dark ink: Wine/Slate/Lilac became
    // Brown/Sage/Denim. Same class of failure as 2026-08-03, when every published
    // colour name on the live site was wrong.
    //
    // So the print here is given MORE area than the fabric and a nameless texture:
    // only the MATERIAL-name exclusion can get this right.
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 1')
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

    map(
      addQuad(document, 4),
      document.createMaterial('SUPPLIER_MFX_B').setBaseColorFactor(linear(136, 36, 51)),
    )
    const anonymous = document
      .createTexture() // NO name, NO uri -- exactly what CLO writes
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    map(
      addQuad(document, 40),
      document
        .createMaterial('Material_Graphic')
        .setBaseColorFactor(linear(39, 0, 0))
        .setBaseColorTexture(anonymous),
    )

    const [colour] = readVariantColours(document)
    expect(colour?.sampledMaterial).toBe('SUPPLIER_MFX_B')
    expect(colour?.name).toBe('Wine')
  })

  it('adds up every panel of one cloth — CLO emits one material per panel (Geovent CW6, CG-05)', () => {
    // The audit's numbers: cloth 60.85% of the surface across many small panels, one
    // print 34.23% in fewer, larger ones; keyed on the material OBJECT the largest single
    // panel won (a print panel at 4.36% over a cloth panel at 4.35%) and white cloth was
    // named Navy. Here the cloth is eight panels of area 4 (32 total) and the print one
    // panel of area 25: only by-name aggregation gets it right.
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 6')
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
    for (let panel = 0; panel < 8; panel++) {
      map(
        addQuad(document, 2),
        document
          .createMaterial('Cotton_Stretch_Sateen_3000')
          .setBaseColorFactor(linear(250, 250, 250)),
      )
    }
    // No artwork word in the name, fully opaque, no texture: nothing but area decides.
    map(
      addQuad(document, 5),
      document.createMaterial('Asset 2_3089').setBaseColorFactor(linear(22, 20, 77)),
    )

    const [colour] = readVariantColours(document)
    expect(colour?.sampledMaterial).toBe('Cotton_Stretch_Sateen_3000')
    expect(colour?.name).toBe('Optic White')
  })

  it('never samples a translucent overlay, whatever it is called (CG-05, the other half)', () => {
    // Geovent's print material: "Asset 2_3089", BLEND, baseColorFactor[3] = 0.16.
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 6')
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
    map(
      addQuad(document, 4),
      document.createMaterial('Cotton_Stretch_Sateen').setBaseColorFactor(linear(250, 250, 250)),
    )
    const overlay = linear(22, 20, 77)
    overlay[3] = 0.16
    map(
      addQuad(document, 40),
      document.createMaterial('Asset 2').setAlphaMode('BLEND').setBaseColorFactor(overlay),
    )

    expect(readVariantColours(document)[0]).toMatchObject({
      sampledMaterial: 'Cotton_Stretch_Sateen',
      name: 'Optic White',
    })
  })

  it('never samples a decal-sized print, however it is named — the UV span says what it is', () => {
    // Real artwork materials are called "Asset 2", "ZZ00000ZZZZ0", "01": no word list
    // can catch them. A print maps its picture once (UV span 1); cloth tiles its swatch.
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const variant = ext.createVariant('Colorway 1')
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
    const picture = () =>
      document
        .createTexture()
        .setMimeType('image/png')
        .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const cloth = addQuad(document, 4)
    withUv(document, cloth, 40)
    map(
      cloth,
      document
        .createMaterial('cotton_frenchterry')
        .setBaseColorFactor(linear(24, 72, 88))
        .setBaseColorTexture(picture()),
    )
    const print = addQuad(document, 40)
    withUv(document, print, 1)
    map(
      print,
      document
        .createMaterial('Asset 5')
        .setBaseColorFactor(linear(200, 30, 30))
        .setBaseColorTexture(picture()),
    )

    expect(readVariantColours(document)[0]).toMatchObject({
      sampledMaterial: 'cotton_frenchterry',
      name: 'Petrol',
    })
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

describe('a white factor over a texture is not a confident "Optic White"', () => {
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

/**
 * THE FABRIC PICTURE, 2026-09-02 (audit CG-06, F1-03, F2-04). Eleven of eleven raw
 * exports carry a white factor with the colour in the texture — and bind the SAME
 * texture to every colourway. Sampling names a colourway only when its picture is its
 * own; a shared or busy picture stays blank and says why.
 */
describe('readVariantColoursSampled — the fabric picture behind a white factor', () => {
  const solid = (r: number, g: number, b: number) =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer()
  const noisy = () => {
    const raw = Buffer.alloc(64 * 64 * 3)
    // Deterministic "halftone": alternating black and white pixels.
    for (let i = 0; i < raw.length; i += 3) {
      const v = (Math.floor(i / 3) % 2) * 255
      raw[i] = v
      raw[i + 1] = v
      raw[i + 2] = v
    }
    return sharp(raw, { raw: { width: 64, height: 64, channels: 3 } })
      .png()
      .toBuffer()
  }
  const build = async (
    pictures: (Buffer | null)[],
    factor = linear(255, 255, 255),
    shared = false,
  ) => {
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const one =
      shared && pictures[0]
        ? document.createTexture().setMimeType('image/png').setImage(new Uint8Array(pictures[0]))
        : null
    for (const [i, picture] of pictures.entries()) {
      const variant = ext.createVariant(`Colorway ${i + 1}`)
      const material = document.createMaterial(`FABRIC ${i + 1}`).setBaseColorFactor(factor)
      const texture =
        one ??
        (picture
          ? document.createTexture().setMimeType('image/png').setImage(new Uint8Array(picture))
          : null)
      if (texture) material.setBaseColorTexture(texture)
      addQuad(document, 4).setExtension(
        'KHR_materials_variants',
        ext
          .createMappingList()
          .addMapping(ext.createMapping().setMaterial(material).addVariant(variant)),
      )
    }
    return document
  }

  it('names each colourway from its OWN picture when the factor is white', async () => {
    const document = await build([await solid(27, 42, 74), await solid(232, 180, 184)])
    const colours = await readVariantColoursSampled(document)
    expect(colours.map((c) => [c.name, c.confidence, c.sampledFrom])).toEqual([
      ['Navy', 'high', 'texture'],
      ['Blush', 'high', 'texture'],
    ])
  })

  it('stays blank when every colourway shares one picture — and says why', async () => {
    const document = await build(
      [await solid(27, 42, 74), await solid(27, 42, 74)],
      linear(255, 255, 255),
      true,
    )
    const colours = await readVariantColoursSampled(document)
    for (const colour of colours) {
      expect(colour.confidence).toBe('low')
      expect(colour.sampledFrom).toBe('factor')
      expect(colour.note).toBe(SHARED_TEXTURE_NOTE)
    }
  })

  it('stays blank on a busy picture, whose dominant colour may be ink', async () => {
    const document = await build([await noisy()])
    const [colour] = await readVariantColoursSampled(document)
    expect(colour?.confidence).toBe('low')
    expect(colour?.note).toBe(BUSY_TEXTURE_NOTE)
  })

  it('never lets the picture override a colour CLO actually wrote into the factor', async () => {
    const document = await build([await solid(232, 180, 184)], linear(27, 42, 74))
    const [colour] = await readVariantColoursSampled(document)
    expect(colour).toMatchObject({ name: 'Navy', sampledFrom: 'factor' })
    expect(colour?.note).toBeUndefined()
  })
})
