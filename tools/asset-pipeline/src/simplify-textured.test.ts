import { Document, type Primitive } from '@gltf-transform/core'
import { MeshoptSimplifier } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  type AttributeSimplifier,
  type SimplifyTexturedOptions,
  runSimplifyTextured,
} from './simplify-textured'

/**
 * A flat, welded, UV-mapped grid. Planar on purpose: position error for any
 * collapse is ~0, so the only thing that can constrain the simplifier is the
 * attribute (UV) error.
 *
 * The UV map is deliberately NON-LINEAR. That detail is the whole test: a
 * linearly-mapped plane keeps its texture perfectly under decimation (a coarser
 * triangulation interpolates to the same UVs), so attribute weighting provably
 * changes nothing on one — measured, all weights from 0 to 100 gave an identical
 * 20 triangles. Real garment unwraps are not linear, and there the weight
 * dominates. Measured on this fixture at target 20 triangles:
 *
 *   uv weight        0     0.1      1     10    100
 *   error 0.001     20t    39t   192t   943t  1983t
 *   error 0.01      20t    20t    38t   194t   929t
 *
 * Those two knobs trade directly against each other; that table is the
 * calibration reference for the detail levels in @run-apparel/shared.
 */
function buildGrid(document: Document, n = 33, withUv = true, withNormal = true) {
  const positions = new Float32Array(n * n * 3)
  const uvs = new Float32Array(n * n * 2)
  const normals = new Float32Array(n * n * 3)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      positions[i * 3] = x / (n - 1)
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = y / (n - 1)
      // Non-linear on both axes — see the note above.
      uvs[i * 2] = (x / (n - 1)) ** 2
      uvs[i * 2 + 1] = 0.5 * (1 - Math.cos(Math.PI * (y / (n - 1))))
      normals[i * 3] = 0
      normals[i * 3 + 1] = 1
      normals[i * 3 + 2] = 0
    }
  }
  const indices = new Uint32Array((n - 1) * (n - 1) * 6)
  let k = 0
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const a = y * n + x
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices[k++] = a
      indices[k++] = c
      indices[k++] = b
      indices[k++] = b
      indices[k++] = c
      indices[k++] = d
    }
  }

  const buffer = document.createBuffer()
  const prim = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
    )
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
  if (withUv) {
    prim.setAttribute(
      'TEXCOORD_0',
      document.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer),
    )
  }
  if (withNormal) {
    prim.setAttribute(
      'NORMAL',
      document.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer),
    )
  }
  const mesh = document.createMesh().addPrimitive(prim)
  document.createScene().addChild(document.createNode().setMesh(mesh))
  return prim
}

function triangleCount(prim: ReturnType<typeof buildGrid>): number {
  return (prim.getIndices()?.getCount() ?? 0) / 3
}

const options = (o: Partial<SimplifyTexturedOptions> = {}): SimplifyTexturedOptions => ({
  simplifier: MeshoptSimplifier as unknown as AttributeSimplifier,
  ratio: 0.25,
  error: 0.001,
  uvWeight: 1,
  normalWeight: 0.5,
  ...o,
})

beforeAll(async () => {
  await MeshoptSimplifier.ready
})

describe('runSimplifyTextured', () => {
  it('takes the attribute-aware path on a UV-mapped triangle mesh', () => {
    const document = new Document()
    const prim = buildGrid(document)
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(result).toMatchObject({ attributeAware: 1, fallback: 0, skipped: 0 })
    expect(triangleCount(prim)).toBeLessThan(before)
    // Simplification must not corrupt the primitive: attributes survive and every
    // index still addresses a real vertex.
    expect(prim.getAttribute('TEXCOORD_0')).toBeTruthy()
    const vertexCount = prim.getAttribute('POSITION')?.getCount() ?? 0
    for (const index of prim.getIndices()?.getArray() ?? []) {
      expect(index).toBeLessThan(vertexCount)
    }
  })

  it('accounts for UV error — a heavier UV weight keeps more geometry', () => {
    // THE regression this module exists for. On a flat grid the position error of
    // any collapse is ~0, so if texture coordinates were not in the error metric
    // both runs would decimate identically. They must not.
    //
    // The ratio is deliberately far more aggressive than either run can reach, so
    // the *error budget* is what stops them — which is the whole point: `ratio` is
    // only a target, and once the budget binds it is the budget, not the ratio,
    // that decides the output.
    const aggressive = { ratio: 0.01, error: 0.001 }

    const loose = new Document()
    const loosePrim = buildGrid(loose)
    runSimplifyTextured(loose, options({ ...aggressive, uvWeight: 0.1 }))

    const strict = new Document()
    const strictPrim = buildGrid(strict)
    runSimplifyTextured(strict, options({ ...aggressive, uvWeight: 10 }))

    // Measured: 39 triangles at weight 0.1, 943 at weight 10 (see buildGrid).
    // A wide margin, asserted loosely so a meshoptimizer bump does not fail on
    // an exact count — the claim under test is the direction, not the number.
    expect(triangleCount(strictPrim)).toBeGreaterThan(triangleCount(loosePrim) * 3)
  })

  it('falls back to position-only simplification when the mesh has no UVs', () => {
    const document = new Document()
    buildGrid(document, 33, false)

    const result = runSimplifyTextured(document, options())

    expect(result).toMatchObject({ attributeAware: 0, fallback: 1 })
  })

  it('falls back when UV weighting is disabled with --uv-weight 0', () => {
    const document = new Document()
    buildGrid(document)

    const result = runSimplifyTextured(document, options({ uvWeight: 0 }))

    expect(result).toMatchObject({ attributeAware: 0, fallback: 1 })
  })

  it('works without NORMAL, and without it when the normal weight is zero', () => {
    for (const [withNormal, normalWeight] of [
      [false, 0.5],
      [true, 0],
    ] as const) {
      const document = new Document()
      const prim = buildGrid(document, 33, true, withNormal)
      const before = triangleCount(prim)

      const result = runSimplifyTextured(document, options({ normalWeight }))

      expect(result.attributeAware).toBe(1)
      expect(triangleCount(prim)).toBeLessThan(before)
    }
  })

  it('weights a SECOND UV set, so artwork on TEXCOORD_1 is protected too', () => {
    // THE regression for H4 in docs/OPEN-ISSUE-ARTWORK.md. CLO's "Apply Graphic"
    // routinely puts printed artwork on a second UV set. This module used to read
    // TEXCOORD_0 and stop, so those materials were decimated at ZERO UV weight
    // while the fabric's UVs were protected at full weight — artwork damaged on
    // some panels and clean on others, which is precisely the reported symptom.
    //
    // The fixture inverts the usual arrangement to make the claim unambiguous:
    // TEXCOORD_0 is LINEAR (provably free to decimate — a coarser triangulation
    // interpolates to the same UVs, so it constrains nothing), and TEXCOORD_1
    // carries the non-linear map standing in for the artwork. Any protection
    // that survives here came from weighting the second set.
    const aggressive = { ratio: 0.01, error: 0.001 }

    const build = (document: Document) => {
      const prim = buildGrid(document)
      const n = 33
      const linear = new Float32Array(n * n * 2)
      const nonLinear = new Float32Array(n * n * 2)
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x
          linear[i * 2] = x / (n - 1)
          linear[i * 2 + 1] = y / (n - 1)
          nonLinear[i * 2] = (x / (n - 1)) ** 2
          nonLinear[i * 2 + 1] = 0.5 * (1 - Math.cos(Math.PI * (y / (n - 1))))
        }
      }
      const buffer = document.getRoot().listBuffers()[0]!
      prim.setAttribute(
        'TEXCOORD_0',
        document.createAccessor().setType('VEC2').setArray(linear).setBuffer(buffer),
      )
      prim.setAttribute(
        'TEXCOORD_1',
        document.createAccessor().setType('VEC2').setArray(nonLinear).setBuffer(buffer),
      )
      return prim
    }

    const document = new Document()
    const prim = build(document)
    const result = runSimplifyTextured(document, options(aggressive))

    expect(result.attributeAware).toBe(1)
    expect(result.uvSetsWeighted).toEqual([0, 1])

    // The control: the same mesh with the artwork set removed entirely, so only
    // the free linear set is weighted. If TEXCOORD_1 were being ignored the two
    // runs would land in the same place.
    const control = new Document()
    const controlPrim = build(control)
    controlPrim.setAttribute('TEXCOORD_1', null)
    const controlResult = runSimplifyTextured(control, options(aggressive))

    expect(controlResult.uvSetsWeighted).toEqual([0])
    expect(triangleCount(prim)).toBeGreaterThan(triangleCount(controlPrim) * 3)
  })

  it('sends the whole primitive to the fallback if any UV set is quantized', () => {
    // Protecting some of a primitive's UVs and silently not others is the exact
    // failure this module was rewritten to end, so a set it cannot read must
    // demote the primitive rather than be skipped over.
    const document = new Document()
    const prim = buildGrid(document)
    const buffer = document.getRoot().listBuffers()[0]!
    prim.setAttribute(
      'TEXCOORD_1',
      document
        .createAccessor()
        .setType('VEC2')
        .setArray(new Uint16Array(33 * 33 * 2))
        .setBuffer(buffer),
    )

    const result = runSimplifyTextured(document, options())

    expect(result).toMatchObject({ attributeAware: 0, fallback: 1 })
    expect(result.uvSetsWeighted).toEqual([])
  })

  it('leaves unsupported draw modes alone rather than corrupting them', () => {
    const document = new Document()
    const prim = buildGrid(document)
    prim.setMode(1) // LINES
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(result).toMatchObject({ attributeAware: 0, fallback: 0, skipped: 1 })
    expect(triangleCount(prim)).toBe(before)
  })
})

/**
 * H4, made reportable.
 *
 * The position-only fallback decimates with texture coordinates OUTSIDE the error
 * metric. On plain fabric that is merely conservative; on a primitive carrying a
 * printed logo it is the mechanism that tore N001's wordmark apart, and the
 * pipeline reported it as a bare count with no way to tell which kind it was.
 *
 * This is a structural fact, not a heuristic: if the primitive took that path,
 * its artwork was not protected. There is no false-positive case, which is why
 * this — and not a bytes-per-pixel guess — is the signal worth blocking on.
 */
/**
 * ⚠️ THE TEXTURE IS DELIBERATELY UNNAMED. A real CLO export names the MATERIAL and
 * leaves every texture anonymous — measured across all ten raw exports on this machine,
 * 2,398 images, not one with a name or URI.
 *
 * Until 2026-08-29 this fixture named BOTH, and that is precisely why nobody noticed the
 * gate was dead: with a texture called "chest-logo" the old texture-name implementation
 * passed every test while being incapable of firing on a real garment. A fixture that
 * has the one property real files lack proves nothing about production.
 *
 * With the texture nameless, the old implementation FAILS these tests and the material
 * one passes — which is the whole point of writing it this way.
 */
function attachArtwork(document: Document, prim: ReturnType<typeof buildGrid>) {
  const texture = document
    .createTexture()
    .setMimeType('image/png')
    .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  const material = document.createMaterial('N001-CHEST-GRAPHIC').setBaseColorTexture(texture)
  prim.setMaterial(material)
  return material
}

/**
 * PRINT PIECES ARE NEVER DECIMATED — fix plan Rank 3, 2026-09-02. Until then a primitive
 * carrying artwork was decimated like any other and merely FLAGGED, and only on the rare
 * position-only path (audit HG-02, F1-09): on every real garment the alarm was silent by
 * construction while the fast path tore the lettering (B-02, A-01, F1-02). Now the
 * primitive is left exactly as exported, whichever path it would have taken, and the
 * report names it. `decimateArtwork: true` restores the old behaviour — the negative
 * control that proves the skip is what protects the print.
 */
/**
 * CLO fabric tiles its swatch — UVs run to 20, 40, 80 — while a print maps once, so
 * findArtworkTexturesByGeometry reads a span over ARTWORK_MAX_UV_SPAN as fabric.
 * buildGrid's UVs span exactly 1, i.e. decal-shaped; this makes them fabric-shaped.
 */
function tileUvs(prim: Primitive, repeats: number): void {
  const uv = prim.getAttribute('TEXCOORD_0')
  if (!uv) throw new Error('tileUvs needs TEXCOORD_0')
  const array = uv.getArray()
  if (!array) throw new Error('tileUvs needs a UV array')
  for (let i = 0; i < array.length; i++) array[i] = (array[i] as number) * repeats
  uv.setArray(array)
}

describe('runSimplifyTextured — print pieces are never decimated', () => {
  it('leaves an artwork primitive untouched even where it would have taken the fallback', () => {
    const document = new Document()
    const prim = buildGrid(document, 33, false) // no TEXCOORD_0 → would be position-only
    attachArtwork(document, prim)
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(triangleCount(prim)).toBe(before)
    expect(result.fallback).toBe(0)
    expect(result.artworkUntouched).toBe(1)
    expect(result.artworkUntouchedMaterials).toEqual(['N001-CHEST-GRAPHIC'])
    expect(result.artworkAtRisk).toEqual([])
  })

  it('leaves it untouched on the UV-aware path too — the path that actually tore the letters', () => {
    const document = new Document()
    const prim = buildGrid(document) // has TEXCOORD_0
    attachArtwork(document, prim)
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(triangleCount(prim)).toBe(before)
    expect(result.attributeAware).toBe(0)
    expect(result.artworkUntouched).toBe(1)
  })

  it('NEGATIVE CONTROL: with decimateArtwork the print IS decimated, and the alarm names it on both paths', () => {
    const fallback = new Document()
    const fallbackPrim = buildGrid(fallback, 33, false)
    attachArtwork(fallback, fallbackPrim)
    const before = triangleCount(fallbackPrim)
    const r1 = runSimplifyTextured(fallback, options({ decimateArtwork: true }))
    expect(triangleCount(fallbackPrim)).toBeLessThan(before)
    expect(r1.fallback).toBe(1)
    expect(r1.artworkUntouched).toBe(0)
    expect(r1.artworkAtRisk).toEqual(['N001-CHEST-GRAPHIC'])

    const aware = new Document()
    const awarePrim = buildGrid(aware)
    attachArtwork(aware, awarePrim)
    const r2 = runSimplifyTextured(aware, options({ decimateArtwork: true }))
    expect(r2.attributeAware).toBe(1)
    // The audit's silent alarm (HG-02): the old code named nothing here. Now a
    // decimated print is named on this path too — the alarm fires on a fixture
    // where a print is decimated, which is F1-09's closure test.
    expect(r2.artworkAtRisk).toEqual(['N001-CHEST-GRAPHIC'])
  })

  it('still decimates plain fabric', () => {
    const document = new Document()
    const prim = buildGrid(document)
    const texture = document
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    prim.setMaterial(document.createMaterial('FABRIC 1_2860').setBaseColorTexture(texture))
    tileUvs(prim, 20)
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(triangleCount(prim)).toBeLessThan(before)
    expect(result.artworkUntouched).toBe(0)
  })

  it('protects a print whose material carries a CLO code-name, by UV span alone (HG-03)', () => {
    // Anonymous name, but a decal-sized UV rectangle: findArtworkTexturesByGeometry says
    // artwork. buildGrid's UVs span exactly 1x1, well under ARTWORK_MAX_UV_SPAN.
    const document = new Document()
    const prim = buildGrid(document)
    const texture = document
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    prim.setMaterial(document.createMaterial('Asset 2@2400x_220324').setBaseColorTexture(texture))
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(triangleCount(prim)).toBe(before)
    expect(result.artworkUntouchedMaterials).toEqual(['Asset 2@2400x_220324'])
  })

  it('does NOT protect thread that happens to be decal-sized in UV', () => {
    const document = new Document()
    const prim = buildGrid(document)
    const texture = document
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    prim.setMaterial(document.createMaterial('Topstitch 1_3332').setBaseColorTexture(texture))
    const before = triangleCount(prim) // UV span 1: decal-shaped, and still thread

    const result = runSimplifyTextured(document, options())

    expect(triangleCount(prim)).toBeLessThan(before)
    expect(result.artworkUntouched).toBe(0)
  })

  it('protects a print bound ONLY through a colourway variant — the twice-missed trap', async () => {
    const { KHRMaterialsVariants } = await import('@gltf-transform/extensions')
    const document = new Document()
    const prim = buildGrid(document)
    // Default material: plain fabric with a big atlas span would be decimated...
    const fabricTexture = document
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    prim.setMaterial(document.createMaterial('FABRIC 1').setBaseColorTexture(fabricTexture))
    tileUvs(prim, 20)
    // ...but one colourway binds a print to the same geometry.
    const ext = document.createExtension(KHRMaterialsVariants)
    const print = document.createMaterial('RUN LOGO_3183').setBaseColorTexture(
      document
        .createTexture()
        .setMimeType('image/png')
        .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    )
    prim.setExtension(
      'KHR_materials_variants',
      ext
        .createMappingList()
        .addMapping(ext.createMapping().setMaterial(print).addVariant(ext.createVariant('wine'))),
    )
    const before = triangleCount(prim)

    const result = runSimplifyTextured(document, options())

    expect(triangleCount(prim)).toBe(before)
    expect(result.artworkUntouchedMaterials).toContain('RUN LOGO_3183')
  })

  it('does not flag plain fabric that falls back — only artwork is at risk', () => {
    const document = new Document()
    const prim = buildGrid(document, 33, false) // falls back, but carries no artwork
    const texture = document
      .createTexture('fabric-weave')
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    prim.setMaterial(document.createMaterial('N001-BODY').setBaseColorTexture(texture))

    const result = runSimplifyTextured(document, options())

    expect(result.fallback).toBe(1)
    expect(result.artworkAtRisk).toEqual([])
  })
})

describe('runSimplifyTextured — the gate reads the MATERIAL name, not the texture', () => {
  /*
   * These pin the 2026-08-29 change and the trap beside it.
   *
   * The gate could never fire on a real garment because it asked the TEXTURE's name and
   * CLO writes none. The obvious repair — read the glTF `textures[].name`, which IS
   * populated — is worse: on a real export every value is the literal string "Texture",
   * and ARTWORK_NAME contains the alternative `text`. Measured on the re-exported
   * Minecut Motion, that predicate matches 50 of 50 textures, so the gate would flip
   * from never firing to refusing every garment.
   */
  const fallbackPrim = (document: Document) => buildGrid(document, 33, false)

  const withNames = (document: Document, materialName: string, textureName?: string) => {
    const prim = fallbackPrim(document)
    const texture = (textureName ? document.createTexture(textureName) : document.createTexture())
      .setMimeType('image/png')
      .setImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    prim.setMaterial(document.createMaterial(materialName).setBaseColorTexture(texture))
    return prim
  }

  it('protects a real CLO shape: named material, anonymous texture', () => {
    const document = new Document()
    withNames(document, 'Material_Graphic_3488354')

    const result = runSimplifyTextured(document, options())
    expect(result.artworkUntouchedMaterials).toEqual(['Material_Graphic_3488354'])
    // And under the explicit opt-in, the old gate still names it on the fallback path.
    const again = new Document()
    withNames(again, 'Material_Graphic_3488354')
    expect(runSimplifyTextured(again, options({ decimateArtwork: true })).artworkAtRisk).toEqual([
      'Material_Graphic_3488354',
    ])
  })

  it('⚠️ does NOT flag plain fabric whose texture is called "Texture"', () => {
    /*
     * THE TRAP, PINNED. Every texture in a CLO export is literally named "Texture", and
     * `text` is one of ARTWORK_NAME's alternatives. Any future change that points this
     * gate back at the texture name fails here rather than in production, where it would
     * refuse the entire catalogue.
     */
    const document = new Document()
    withNames(document, 'Cotton_Canvas_2961', 'Texture')

    const result = runSimplifyTextured(document, options())
    expect(result.artworkAtRisk).toEqual([])
    expect(result.artworkUntouched).toBe(0)
  })

  it('does not flag a material named as artwork that shows no texture at all', () => {
    // Trim and hardware can carry an artwork-ish name without displaying a graphic.
    const document = new Document()
    const prim = fallbackPrim(document)
    prim.setMaterial(document.createMaterial('LOGO Plate Metal'))

    const result = runSimplifyTextured(document, options())
    expect(result.artworkAtRisk).toEqual([])
    expect(result.artworkUntouched).toBe(0)
  })

  it('catches the other real names this catalogue actually uses', () => {
    for (const name of ['RUN LOGO_3488411', 'LOGO Team wear Embridory gold gold_3488372']) {
      const document = new Document()
      withNames(document, name)
      expect(runSimplifyTextured(document, options()).artworkUntouchedMaterials).toEqual([name])
    }
  })
})
