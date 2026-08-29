import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import {
  MAX_ABS_BIAS,
  MIN_ABS_BIAS,
  OVERLAY_AUTO_CONFIDENCE,
  OVERLAY_BIAS_FACTOR,
  OVERLAY_BIAS_UNITS,
  OVERLAY_MIN_ALIGNMENT,
  OVERLAY_MIN_FRONTNESS,
  classifyOverlay,
  isBiasInBand,
  measureOverlays,
  type OverlayMetrics,
} from './overlay-depth'

/**
 * ⚠️ EVERY NUMBER BELOW IS A MEASUREMENT, NOT AN INVENTION.
 *
 * Taken 2026-08-28 by running measureOverlays() over all 16 processed GLBs in
 * output/production and output/repair-check. They are pinned here so that changing a
 * threshold has to break a real garment before it can pass — the alternative is the
 * shape this repo keeps paying for, a fixture that cannot exhibit the defect it guards.
 */
const MEASURED = {
  /** Minecut Motion / t003 — the reported defect. Printed OPAQUE layer on cloth. */
  minecutGraphic: { layeredFraction: 0.501, frontness: 0.989, gapMm: 0.101, alignment: 1.0 },
  /** The cloth UNDER that graphic. Same stack, opposite side. Must never be biased. */
  minecutFabric: { layeredFraction: 0.978, frontness: 0.026, gapMm: 0.054, alignment: 1.0 },
  /** KINETIC SPLATTER — the other garment the owner named. */
  kineticBra: { layeredFraction: 1.01, frontness: 0.825, gapMm: 0.092, alignment: 1.0 },
  /** The cloth under it. */
  kineticCloth: { layeredFraction: 1.0, frontness: 0.061, gapMm: 0.028, alignment: 1.0 },
  /** p001's BODY PANEL — worst garment on the crude bias-everything screen test. */
  p001Body: { layeredFraction: 0.94, frontness: 0.34, gapMm: 0.115, alignment: 0.999 },
  /** Topstitch: a round cord lying on flat cloth. Touches along a line, not a plane. */
  topstitch: { layeredFraction: 0.21, frontness: 0.91, gapMm: 0.504, alignment: 0.933 },
  /** n001's zipper stopper — the nearest thing on the LIVE garment to a false positive. */
  n001Stopper: { layeredFraction: 0.42, frontness: 0.62, gapMm: 0.28, alignment: 0.972 },
} satisfies Record<string, OverlayMetrics>

describe('classifyOverlay — a printed layer, told from the cloth it sits on', () => {
  it('accepts the two garments measured to carry the defect', () => {
    for (const key of ['minecutGraphic', 'kineticBra'] as const) {
      const verdict = classifyOverlay(MEASURED[key])
      expect(verdict.overlay, key).toBe(true)
      expect(verdict.confidence, key).toBeGreaterThanOrEqual(OVERLAY_AUTO_CONFIDENCE)
    }
  })

  it('⚠️ THE CONSTRAINT — rejects the CLOTH under each of those prints', () => {
    // Both are OPAQUE, both are in a stack, both are 0.03-0.05 mm from their neighbour.
    // The only thing separating them from the print is which one is in front, and that
    // is the whole rule. A classifier that biased these would pull the garment body
    // through what is behind it.
    for (const key of ['minecutFabric', 'kineticCloth'] as const) {
      const verdict = classifyOverlay(MEASURED[key])
      expect(verdict.overlay, key).toBe(false)
      expect(verdict.reason, key).toContain('UNDERNEATH')
    }
  })

  it('⚠️ THE CONSTRAINT — rejects p001 body panels, the worst bias-everything garment', () => {
    // p001 measured 17.6% of the screen changed when EVERY opaque material was biased.
    // Its fleece interpenetrates its artwork, so 34% of it is in front and 66% behind:
    // genuinely ambiguous, and therefore not biased.
    const verdict = classifyOverlay(MEASURED.p001Body)
    expect(verdict.overlay).toBe(false)
    expect(verdict.confidence).toBe(0)
  })

  it('rejects topstitch and hardware, which touch cloth along a line', () => {
    for (const key of ['topstitch', 'n001Stopper'] as const) {
      expect(classifyOverlay(MEASURED[key]).overlay, key).toBe(false)
    }
  })

  it('rejects a surface too far away to fight for the depth test', () => {
    // Topstitch sits at 0.37-0.50 mm and does not z-fight; real prints are 0.05-0.30.
    const far = { ...MEASURED.minecutGraphic, gapMm: 0.6 }
    expect(classifyOverlay(far).overlay).toBe(false)
    expect(classifyOverlay(far).reason).toContain('too far')
  })

  it('rejects a surface with nothing stacked against it at all', () => {
    const alone = { layeredFraction: 0.02, frontness: 1, gapMm: 0.1, alignment: 1 }
    expect(classifyOverlay(alone).overlay).toBe(false)
    expect(classifyOverlay(alone).reason).toContain('not stacked')
  })

  it('⚠️ frontness is the discriminator, and the boundary is where it was measured', () => {
    // The two populations are 0.026-0.34 (cloth and ambiguous) and 0.82-0.99 (prints).
    // The threshold must sit in the empty band between them, not inside either.
    expect(OVERLAY_MIN_FRONTNESS).toBeGreaterThan(MEASURED.p001Body.frontness)
    expect(OVERLAY_MIN_FRONTNESS).toBeLessThan(MEASURED.kineticBra.frontness)
    const base = MEASURED.minecutGraphic
    expect(classifyOverlay({ ...base, frontness: OVERLAY_MIN_FRONTNESS }).overlay).toBe(true)
    expect(classifyOverlay({ ...base, frontness: OVERLAY_MIN_FRONTNESS - 0.001 }).overlay).toBe(
      false,
    )
  })

  it('⚠️ alignment must exclude topstitch, whose 0.93-0.97 is the real ceiling', () => {
    expect(OVERLAY_MIN_ALIGNMENT).toBeGreaterThan(MEASURED.topstitch.alignment)
    expect(OVERLAY_MIN_ALIGNMENT).toBeGreaterThan(MEASURED.n001Stopper.alignment)
  })

  it('holds a marginal overlay back for review instead of biasing it unattended', () => {
    // Right at every gate: an overlay, but not one to act on without a person looking.
    const marginal = { layeredFraction: 0.3, frontness: 0.76, gapMm: 0.299, alignment: 0.981 }
    const verdict = classifyOverlay(marginal)
    expect(verdict.overlay).toBe(true)
    expect(verdict.confidence).toBeLessThan(OVERLAY_AUTO_CONFIDENCE)
  })
})

describe('the bias value the pipeline writes', () => {
  it('⚠️ is -8, not the -1 that shipped and left the print destroyed', () => {
    // Minecut white specks: none 5.196%, -1 1.586%, -4 0.173%, -8 0.002%, -16 0.000%.
    // -8 is the start of a plateau, which is why it is not -4.
    expect(OVERLAY_BIAS_FACTOR).toBe(-8)
    expect(OVERLAY_BIAS_UNITS).toBe(-8)
  })

  it('⚠️ is the same band apps/viewer will obey — a wider one would be ignored', () => {
    // Duplicated as literals, not imported: biome's noRestrictedImports forbids the
    // cross-app import outside tests, and this package installs with plain npm inside
    // the shrink container. review-server.test.ts pins the viewer's own copy.
    expect(MIN_ABS_BIAS).toBe(8)
    expect(MAX_ABS_BIAS).toBe(64)
    expect(isBiasInBand(OVERLAY_BIAS_FACTOR)).toBe(true)
  })

  it('⚠️ NEGATIVE CONTROL — refuses -1, a positive value, and anything past -64', () => {
    expect(isBiasInBand(-1)).toBe(false)
    expect(isBiasInBand(-4)).toBe(false)
    expect(isBiasInBand(8)).toBe(false)
    expect(isBiasInBand(512)).toBe(false)
    expect(isBiasInBand(-512)).toBe(false)
    expect(isBiasInBand(Number.NaN)).toBe(false)
  })
})

/**
 * measureOverlays over REAL geometry.
 *
 * ⚠️ THE FIXTURE HAS TO BE ABLE TO EXHIBIT THE DEFECT, which here means two actual
 * surfaces stacked 0.1 mm apart — the separation measured on Minecut Motion. A fixture
 * of one lone quad would exercise every line of this function and prove nothing, which
 * is the failure shape recorded at the top of the root CLAUDE.md.
 */
describe('measureOverlays — geometry, not names', () => {
  /** A unit quad in the XZ plane at height `y`, facing +Y. */
  function quad(document: Document, y: number, name: string, flip = false) {
    const n = flip ? -1 : 1
    const position = document
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, y, 0, 1, y, 0, 1, y, 1, 0, y, 1]))
    const normal = document
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, n, 0, 0, n, 0, 0, n, 0, 0, n, 0]))
    const indices = document
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    const primitive = document
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setIndices(indices)
      .setMaterial(document.createMaterial(name))
    return document.createMesh(name).addPrimitive(primitive)
  }

  /** `y` values in METRES; the model is read in its own units and converted. */
  function scene(...layers: Array<{ y: number; name: string; flip?: boolean }>) {
    const document = new Document()
    document.createBuffer()
    const root = document.createScene()
    for (const layer of layers)
      root.addChild(
        document.createNode(layer.name).setMesh(quad(document, layer.y, layer.name, layer.flip)),
      )
    return document
  }

  const by = (readings: ReturnType<typeof measureOverlays>, name: string) =>
    readings.find((r) => r.materialName === name)

  it('⚠️ calls the FRONT layer of a 0.1 mm stack an overlay and the BACK layer not', () => {
    // The exact separation measured on Minecut Motion's graphic and the cloth under it.
    const readings = measureOverlays(scene({ y: 0, name: 'cloth' }, { y: 0.0001, name: 'print' }))
    const print = by(readings, 'print')
    const cloth = by(readings, 'cloth')
    expect(print?.verdict.overlay).toBe(true)
    expect(print?.gapMm).toBeCloseTo(0.1, 2)
    expect(print?.frontness).toBe(1)
    expect(print?.supportPrimitive).toBe('cloth')
    // THE CONSTRAINT: the surface underneath is never biased, whatever it is called.
    expect(cloth?.verdict.overlay).toBe(false)
    expect(cloth?.frontness).toBe(0)
  })

  it('leaves a surface with nothing behind it alone', () => {
    const readings = measureOverlays(scene({ y: 0, name: 'cloth' }))
    expect(by(readings, 'cloth')?.verdict.overlay).toBe(false)
    expect(by(readings, 'cloth')?.layeredFraction).toBe(0)
  })

  it('leaves two surfaces too far apart to fight for the depth test alone', () => {
    // 1.5 mm. Still inside the SEARCH radius, so it IS seen — and then rejected on the
    // gap, which is the branch that matters: seen and judged, not missed.
    const readings = measureOverlays(scene({ y: 0, name: 'cloth' }, { y: 0.0015, name: 'print' }))
    const print = by(readings, 'print')
    expect(print?.gapMm).toBeCloseTo(1.5, 1)
    expect(print?.verdict.overlay).toBe(false)
    expect(print?.verdict.reason).toContain('too far')
  })

  it('does not pair two surfaces whose normals face away from each other', () => {
    // A cloth panel with thickness: its outer and inner faces are 0.1 mm apart and
    // point in OPPOSITE directions. Pairing them would bias every panel in the
    // catalogue against its own back face.
    const readings = measureOverlays(
      scene({ y: 0, name: 'outer' }, { y: 0.0001, name: 'inner', flip: true }),
    )
    expect(by(readings, 'outer')?.verdict.overlay).toBe(false)
    expect(by(readings, 'inner')?.verdict.overlay).toBe(false)
  })

  it('reads a model authored in CENTIMETRES without putting every gap 10x out', () => {
    // glTF is metres by convention and every garment here measures ~1.0 tall, but a
    // 100-unit model is centimetres — and assuming metres would report a 0.1 mm stack
    // as 0.001 mm and classify nothing.
    const readings = measureOverlays(
      scene({ y: 0, name: 'cloth' }, { y: 0.01, name: 'print' }, { y: 100, name: 'far-marker' }),
    )
    expect(by(readings, 'print')?.gapMm).toBeCloseTo(0.1, 2)
    expect(by(readings, 'print')?.verdict.overlay).toBe(true)
  })

  it('falls back to the geometric normal when a primitive has none', () => {
    const document = scene({ y: 0, name: 'cloth' }, { y: 0.0001, name: 'print' })
    for (const mesh of document.getRoot().listMeshes())
      for (const primitive of mesh.listPrimitives()) primitive.setAttribute('NORMAL', null)
    const readings = measureOverlays(document)
    expect(readings).toHaveLength(2)
    // Winding gives both quads the same facing here, so one is in front of the other.
    expect(readings.filter((r) => r.verdict.overlay)).toHaveLength(1)
  })

  it('returns nothing for a document with no geometry', () => {
    expect(measureOverlays(new Document())).toEqual([])
  })

  it('reports mesh and primitive indices in glTF order, which the annotator relies on', () => {
    const readings = measureOverlays(scene({ y: 0, name: 'a' }, { y: 0.0001, name: 'b' }))
    expect(readings.map((r) => [r.meshIndex, r.primitiveIndex])).toEqual([
      [0, 0],
      [1, 0],
    ])
  })
})
