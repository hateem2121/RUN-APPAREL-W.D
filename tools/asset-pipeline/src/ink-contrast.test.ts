import { Document } from '@gltf-transform/core'
import { KHRMaterialsVariants } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  INVISIBLE_CONTRAST,
  contrastRatio,
  describeInkRow,
  framePrint,
  measureInkContrast,
} from './ink-contrast'
import type { PrimitiveReading } from './overlay-depth'

/**
 * THE NEGATIVE CONTROL THE PLAN ASKS FOR (Group 4): a fixture with one print at
 * factor == cloth and one at white — the flag must fire on exactly one.
 */
const linear = (r: number, g: number, b: number): [number, number, number, number] => {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return [f(r), f(g), f(b), 1]
}

/** A near-white stencil: opaque ink at rgb 245 over a clear background. */
const stencil = () =>
  sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 245, g: 245, b: 245, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
/** A plain fabric picture (opaque, mid-light). */
const fabric = () =>
  sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 230, g: 230, b: 230 } } })
    .png()
    .toBuffer()

function quad(document: Document) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const prim = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1]))
        .setBuffer(buffer),
    )
    .setIndices(
      document
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array([0, 1, 2, 1, 3, 2]))
        .setBuffer(buffer),
    )
  const mesh = document.createMesh().addPrimitive(prim)
  document.createScene().addChild(document.createNode().setMesh(mesh))
  return prim
}

const reading = (meshIndex: number, supportMeshIndex: number | null): PrimitiveReading => ({
  index: meshIndex,
  meshIndex,
  primitiveIndex: 0,
  materialName: '',
  alphaMode: 'MASK',
  layeredFraction: 0.9,
  frontness: 0.99,
  gapMm: 0.1,
  alignment: 1,
  supportPrimitive: null,
  supportMeshIndex,
  supportPrimitiveIndex: supportMeshIndex === null ? null : 0,
  verdict: { overlay: true, confidence: 0.95, reason: 'test' },
})

async function garment() {
  const document = new Document()
  const ext = document.createExtension(KHRMaterialsVariants)
  const wine = ext.createVariant('Colorway 2')
  const bind = (prim: ReturnType<typeof quad>, material: ReturnType<Document['createMaterial']>) =>
    prim.setExtension(
      'KHR_materials_variants',
      ext
        .createMappingList()
        .addMapping(ext.createMapping().setMaterial(material).addVariant(wine)),
    )
  const clothTex = document
    .createTexture()
    .setMimeType('image/png')
    .setImage(new Uint8Array(await fabric()))
  const cloth = document
    .createMaterial('FABRIC 5_3080')
    .setBaseColorFactor(linear(139, 101, 100))
    .setBaseColorTexture(clothTex)
  const clothPrim = quad(document) // mesh 0
  bind(clothPrim, cloth)

  const inkTex = document
    .createTexture()
    .setMimeType('image/png')
    .setImage(new Uint8Array(await stencil()))
  // The defect: CLO copied the cloth's factor into the print.
  const copied = document
    .createMaterial('RUN LOGO_3179')
    .setBaseColorFactor(linear(139, 101, 100))
    .setBaseColorTexture(inkTex)
  bind(quad(document), copied) // mesh 1
  // A print authored properly: white factor, the stencil's own ink shows.
  const white = document
    .createMaterial('Teamwear Logo_3135')
    .setBaseColorFactor([1, 1, 1, 1])
    .setBaseColorTexture(inkTex)
  bind(quad(document), white) // mesh 2
  return document
}

describe('measureInkContrast', () => {
  it('flags EXACTLY the print whose factor is the cloth beneath it, and not the white one', async () => {
    const document = await garment()
    const report = await measureInkContrast(document, [reading(1, 0), reading(2, 0)])
    expect(report.colourways).toEqual(['Colorway 2'])
    expect(report.prints).toBe(2)
    const byPrint = Object.fromEntries(report.rows.map((r) => [r.print, r]))
    expect(byPrint['RUN LOGO_3179']).toMatchObject({
      cloth: 'FABRIC 5_3080',
      clothSource: 'beneath',
      inkMatchesCloth: true,
      verdict: 'invisible',
    })
    expect(byPrint['RUN LOGO_3179']?.contrastRatio).toBeLessThan(INVISIBLE_CONTRAST)
    expect(byPrint['Teamwear Logo_3135']).toMatchObject({
      inkMatchesCloth: false,
      verdict: 'clear',
    })
    expect(report.flagged.map((r) => r.print)).toEqual(['RUN LOGO_3179'])
  })

  it('falls back to the dominant fabric when nothing was measured beneath a print, and says so', async () => {
    const document = await garment()
    const report = await measureInkContrast(document, [])
    const row = report.rows.find((r) => r.print === 'RUN LOGO_3179')
    expect(row?.clothSource).toBe('dominant')
    expect(row?.cloth).toBe('FABRIC 5_3080')
    expect(row?.inkMatchesCloth).toBe(true)
    expect(describeInkRow(row!)).toContain('dominant fabric')
  })

  it('judges a print stacked on another print against cloth, never against the print', async () => {
    const document = await garment()
    // mesh 2 (white print) sits on mesh 1 (the copied print): the support is a print.
    const report = await measureInkContrast(document, [reading(2, 1)])
    const row = report.rows.find((r) => r.print === 'Teamwear Logo_3135')
    expect(row?.clothSource).toBe('dominant')
  })
})

describe('contrastRatio', () => {
  it('is 1 for a colour against itself and 21 for black on white', () => {
    expect(contrastRatio([0.2, 0.2, 0.2], [0.2, 0.2, 0.2])).toBe(1)
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5)
  })
})

describe('framePrint — a camera aimed at the print, on quantized and plain files', () => {
  const quadAt = (document: Document, x: number, z: number, y = 1) => {
    const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
    const prim = document.createPrimitive().setAttribute(
      'POSITION',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(
          new Float32Array([
            x - 0.1,
            y - 0.05,
            z,
            x + 0.1,
            y - 0.05,
            z,
            x - 0.1,
            y + 0.05,
            z,
            x + 0.1,
            y + 0.05,
            z,
          ]),
        )
        .setBuffer(buffer),
    )
    const mesh = document.createMesh().addPrimitive(prim)
    document.createScene().addChild(document.createNode().setMesh(mesh))
    return prim
  }

  it('aims at the print centre and stands off the side it faces', () => {
    const document = new Document()
    quadAt(document, 0, 0.1) // a body panel at the front
    quadAt(document, 0, -0.1) // and one at the back: the model centre is z = 0
    const back = quadAt(document, 0, -0.1, 1.3).setMaterial(document.createMaterial('RUN LOGO_1'))
    const view = framePrint(document, 2, 0)
    expect(view).not.toBeNull()
    expect(view?.target).toBe('0.000m 1.300m -0.100m')
    expect(view?.orbit.startsWith('180.0deg')).toBe(true) // a back print orbits round
    expect(view?.name).toBe('run-logo-1')
    // A 0.2 m print frames at 14° x 1.5 = 21°.
    expect(view?.fieldOfView).toBe('20.8deg')
    void back
  })

  it('DECODES a meshopt-quantized accessor — raw int16 aimed the camera 6 km up (2026-09-03)', () => {
    const document = new Document()
    const buffer = document.createBuffer()
    // Positions as normalized int16 in [-1, 1] × node scale 0.4 + translation (0, 1, 0):
    // a quad spanning x ±0.5 (raw ±16383) at y = 0.5 (raw 16383), z = 0.25 (raw 8192).
    const raw = new Int16Array([
      -16383, 16383, 8192, 16383, 16383, 8192, -16383, 16383, 8192, 16383, 16383, 8192,
    ])
    const prim = document
      .createPrimitive()
      .setAttribute(
        'POSITION',
        document
          .createAccessor()
          .setType('VEC3')
          .setArray(raw)
          .setNormalized(true)
          .setBuffer(buffer),
      )
      .setMaterial(document.createMaterial('Slogan'))
    const mesh = document.createMesh().addPrimitive(prim)
    document
      .createScene()
      .addChild(
        document.createNode().setMesh(mesh).setScale([0.4, 0.4, 0.4]).setTranslation([0, 1, 0]),
      )
    const view = framePrint(document, 0, 0)
    // centre = (0, 0.5, 0.25) × 0.4 + (0, 1, 0) = (0, 1.2, 0.1); raw would have read (0, 16383, 8192).
    expect(view?.target).toBe('0.000m 1.200m 0.100m')
  })

  it('returns null for a primitive that does not exist', () => {
    const document = new Document()
    quadAt(document, 0, 0)
    expect(framePrint(document, 5, 0)).toBeNull()
    expect(framePrint(document, 0, 9)).toBeNull()
  })
})

describe('describeInkRow', () => {
  const row = (over: Partial<Parameters<typeof describeInkRow>[0]>) => ({
    variantId: 'Colorway 3',
    print: 'THE EXTRA MILE (Slogan)_3157',
    meshIndex: 0,
    primitiveIndex: 0,
    cloth: 'FABRIC 5_3080',
    clothSource: 'beneath' as const,
    inkHex: '#D6B1B1',
    factorHex: '#D6B1B1',
    clothHex: '#CD9B9B',
    contrastRatio: 1.23,
    inkMatchesCloth: false,
    matchesFabric: null,
    verdict: 'invisible' as const,
    ...over,
  })
  it("says why in the owner's words, and names the fabric whose value the print carries", () => {
    expect(describeInkRow(row({ matchesFabric: 'FABRIC 3_3032' }))).toBe(
      "THE EXTRA MILE (Slogan)_3157 @ Colorway 3: 1.23:1 against FABRIC 5_3080 — the ink reads as bare cloth; its colour value is FABRIC 3_3032's",
    )
    expect(
      describeInkRow(row({ inkMatchesCloth: true, matchesFabric: 'FABRIC 5_3080' })),
    ).toContain('the print carries the cloth’s own colour value')
    expect(describeInkRow(row({ verdict: 'weak', contrastRatio: 1.82 }))).toContain('1.82:1')
    expect(describeInkRow(row({ verdict: 'weak', contrastRatio: 1.82 }))).toContain('faint')
    expect(describeInkRow(row({ clothSource: 'dominant' }))).toContain('dominant fabric')
    expect(
      describeInkRow(
        row({ cloth: null, clothHex: null, contrastRatio: null, verdict: 'unmeasured' }),
      ),
    ).toBe('THE EXTRA MILE (Slogan)_3157 @ Colorway 3: unmeasured — faint')
  })
})

describe('measureInkContrast — the edges', () => {
  it('reads a print with no texture from its factor alone, and an unreadable picture as unmeasured', async () => {
    const document = new Document()
    const ext = document.createExtension(KHRMaterialsVariants)
    const v = ext.createVariant('Colorway 1')
    const bind = (
      prim: ReturnType<typeof quad>,
      material: ReturnType<Document['createMaterial']>,
    ) =>
      prim.setExtension(
        'KHR_materials_variants',
        ext.createMappingList().addMapping(ext.createMapping().setMaterial(material).addVariant(v)),
      )
    bind(
      quad(document),
      document.createMaterial('FABRIC 1').setBaseColorFactor(linear(200, 200, 200)),
    )
    bind(
      quad(document),
      document.createMaterial('RUN LOGO_1').setBaseColorFactor(linear(20, 20, 20)),
    )
    const broken = document
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([1, 2, 3]))
    bind(quad(document), document.createMaterial('RUN LOGO_2').setBaseColorTexture(broken))
    const report = await measureInkContrast(document, [reading(1, 0), reading(2, 0)])
    const byPrint = Object.fromEntries(report.rows.map((r) => [r.print, r]))
    expect(byPrint['RUN LOGO_1']?.verdict).toBe('clear')
    expect(byPrint['RUN LOGO_2']?.verdict).toBe('unmeasured')
    expect(byPrint['RUN LOGO_2']?.contrastRatio).toBeNull()
  })
})
