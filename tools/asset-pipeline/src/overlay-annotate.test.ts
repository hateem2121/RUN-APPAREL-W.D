import { describe, expect, it } from 'vitest'
import { DETECTOR_VERSION, annotateGlbOverlays, type OverlayOverride } from './overlay-annotate'
import type { PrimitiveReading } from './overlay-depth'

/**
 * A hand-built GLB. Deliberately minimal: this unit patches the JSON chunk and copies
 * the BIN chunk, and never looks at geometry — so a real garment would test nothing
 * extra here while hiding what did change. The garments are covered by the sweep the
 * measurements in overlay-depth.test.ts come from.
 */
const BIN = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

function buildGlb(json: unknown, bin: Uint8Array = BIN): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (bin.length % 4)) % 4
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.length + jsonPad, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytes, 20)
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad)
  const at = 20 + jsonBytes.length + jsonPad
  view.setUint32(at, bin.length + binPad, true)
  view.setUint32(at + 4, 0x004e4942, true)
  out.set(bin, at + 8)
  return out
}

function parseJson(bytes: Uint8Array): {
  materials: Array<{ name?: string; extras?: Record<string, unknown> }>
  meshes: Array<{ primitives: Array<{ material?: number; extensions?: Record<string, unknown> }> }>
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)))
}

/** Two colourways of one printed panel, plus the fabric behind it. */
const SCENE = {
  asset: { version: '2.0' },
  materials: [
    { name: 'Material_Graphic_330411' },
    { name: 'Default Fabric_2915' },
    { name: 'Material_Graphic_331044' },
  ],
  meshes: [
    {
      primitives: [
        {
          material: 0,
          extensions: { KHR_materials_variants: { mappings: [{ material: 2, variants: [1] }] } },
        },
      ],
    },
    { primitives: [{ material: 1 }] },
  ],
}

const reading = (over: Partial<PrimitiveReading> = {}): PrimitiveReading => ({
  index: 0,
  meshIndex: 0,
  primitiveIndex: 0,
  materialName: 'Material_Graphic_330411',
  alphaMode: 'OPAQUE',
  layeredFraction: 0.501,
  frontness: 0.989,
  gapMm: 0.1014,
  alignment: 1,
  supportPrimitive: 'Default Fabric_2915',
  verdict: { overlay: true, confidence: 0.987, reason: 'sits 0.101 mm in front' },
  ...over,
})

describe('annotateGlbOverlays', () => {
  it('⚠️ flags EVERY COLOURWAY of an overlay, not just the base material', () => {
    // Flagging only the base fixes one colourway of five. That is exactly the shape of
    // the 2026-08-27 decal fix, which reached 6 of 26 decals on the live garment.
    const { bytes, result } = annotateGlbOverlays(buildGlb(SCENE), [reading()])
    const { materials } = parseJson(bytes)
    expect(result.flagged.map((f) => f.name)).toEqual([
      'Material_Graphic_330411',
      'Material_Graphic_331044',
    ])
    for (const index of [0, 2]) {
      expect(materials[index]?.extras?.depthBias).toMatchObject({
        enabled: true,
        factor: -8,
        units: -8,
        detector: DETECTOR_VERSION,
        supportPrimitive: 'Default Fabric_2915',
      })
    }
    // The fabric behind it is untouched. This is the constraint, at file level.
    expect(materials[1]?.extras).toBeUndefined()
  })

  it('⚠️ leaves the BIN chunk byte-identical — geometry and textures are not re-encoded', () => {
    // The root CLAUDE.md's first pipeline trap is "never run the pipeline on its own
    // output": re-serialising would re-encode meshopt and re-quantize every vertex.
    // Nothing here needs the binary, so nothing here touches it.
    const { bytes, result } = annotateGlbOverlays(buildGlb(SCENE), [reading()])
    expect(result.binIdentical).toBe(true)
    expect(bytes.subarray(bytes.length - BIN.length - 2, bytes.length - 2)).toEqual(BIN)
  })

  it('⚠️ CLONES a material shared between an overlay and a body primitive', () => {
    // Otherwise biasing the print drags the panel it is printed on forward with it.
    const shared = structuredClone(SCENE)
    const body = shared.meshes[1]?.primitives[0]
    if (!body) throw new Error('fixture drifted')
    body.material = 0 // the body panel now shares the graphic's material
    const { bytes, result } = annotateGlbOverlays(buildGlb(shared), [reading()])
    const { materials, meshes } = parseJson(bytes)
    expect(result.clones).toBe(1)
    expect(meshes[0]?.primitives[0]?.material).not.toBe(0)
    expect(meshes[1]?.primitives[0]?.material).toBe(0)
    expect(materials[0]?.extras).toBeUndefined()
    const cloned = meshes[0]?.primitives[0]?.material as number
    expect(materials[cloned]?.name).toBe('Material_Graphic_330411__overlay')
    expect(materials[cloned]?.extras?.depthBias).toBeTruthy()
  })

  it('annotates EVERY alpha mode by default — OPAQUE-only was the silent default (CI-04)', () => {
    // CLO's printed layers arrive as MASK (after solidify) or BLEND (soft); the old
    // ['OPAQUE'] default dropped all of them and reported "flagged 0" beside readings
    // that said overlay.
    const masked = annotateGlbOverlays(buildGlb(SCENE), [reading({ alphaMode: 'MASK' })])
    expect(masked.result.flagged.length).toBeGreaterThan(0)
    expect(masked.result.skippedByAlphaMode).toBe(0)
    expect(masked.result.overlayReadings).toBe(1)
    expect(masked.result.measured).toBe(1)

    // The narrow filter is still available, and now SAYS what it dropped.
    const opaqueOnly = annotateGlbOverlays(buildGlb(SCENE), [reading({ alphaMode: 'MASK' })], {
      alphaModes: ['OPAQUE'],
    })
    expect(opaqueOnly.result.flagged).toEqual([])
    expect(opaqueOnly.result.skippedByAlphaMode).toBe(1)
  })

  it('ignores THREAD and HARDWARE by name, and counts them (found the day the alpha filter opened)', () => {
    // AERO's flat BLEND topstitch ribbons measure as 56 stacked layers at 0.26 mm.
    // Thread is never a print; a nudge on it was never measured.
    const thread = {
      ...SCENE,
      materials: [
        { name: 'Default Topstitch_3569' },
        { name: 'Default Fabric_2915' },
        { name: 'Zipper 1_Teeth_92548' },
      ],
    }
    const { result } = annotateGlbOverlays(buildGlb(thread), [
      reading({ materialName: 'Default Topstitch_3569', alphaMode: 'BLEND' }),
    ])
    expect(result.flagged).toEqual([])
    expect(result.review).toEqual([])
    expect(result.threadIgnored).toBe(1)
    expect(result.overlayReadings).toBe(1)
  })

  it('reports a low-confidence overlay for REVIEW instead of biasing it', () => {
    const marginal = reading({ verdict: { overlay: true, confidence: 0.4, reason: 'marginal' } })
    const { result } = annotateGlbOverlays(buildGlb(SCENE), [marginal])
    expect(result.flagged).toEqual([])
    expect(result.review).toEqual([
      {
        material: 'Material_Graphic_330411',
        confidence: 0.4,
        reason: 'marginal',
        alphaMode: 'OPAQUE',
      },
    ])
  })

  it('writes nothing at all when no primitive is an overlay', () => {
    const body = reading({ verdict: { overlay: false, confidence: 0, reason: 'UNDERNEATH' } })
    const { result } = annotateGlbOverlays(buildGlb(SCENE), [body])
    expect(result.flagged).toEqual([])
    expect(result.overlayPrimitives).toBe(0)
  })

  it('⚠️ THROWS if the detector and the file disagree about primitive order', () => {
    // gltf-transform preserving mesh order is an assumption, and this repo has paid for
    // assumptions of exactly that shape. Checked on every primitive so a reader change
    // fails loudly instead of annotating the wrong surface.
    const drifted = reading({ materialName: 'Something Else' })
    expect(() => annotateGlbOverlays(buildGlb(SCENE), [drifted])).toThrow(/primitive order drifted/)
  })

  describe('manual overrides', () => {
    const override = (over: Partial<OverlayOverride>): OverlayOverride => ({
      garment: 'Minecut Motion',
      material: 'Default Fabric_2915',
      force: 'bias',
      note: 'owner looked at it',
      ...over,
    })

    it('can force a material the detector rejected', () => {
      const body = reading({
        materialName: 'Default Fabric_2915',
        meshIndex: 1,
        verdict: { overlay: false, confidence: 0, reason: 'UNDERNEATH' },
      })
      const { bytes } = annotateGlbOverlays(buildGlb(SCENE), [body], {
        garment: 'Minecut Motion',
        overrides: [override({})],
      })
      expect(parseJson(bytes).materials[1]?.extras?.depthBias).toMatchObject({
        reason: 'override: owner looked at it',
        confidence: 1,
      })
    })

    it('can skip a material the detector accepted', () => {
      const { result } = annotateGlbOverlays(buildGlb(SCENE), [reading()], {
        garment: 'Minecut Motion',
        overrides: [override({ material: 'Material_Graphic_330411', force: 'skip' })],
      })
      expect(result.flagged).toEqual([])
    })

    it('⚠️ REPORTS an override that matched nothing rather than passing silently', () => {
      // A stale entry after a CLO re-export reads as "still applied" while doing
      // nothing — the failure REFERENCE_PATHS and isArtworkMaterialByName both had.
      const stale = override({ material: 'a name nothing has' })
      const { result } = annotateGlbOverlays(buildGlb(SCENE), [reading()], {
        garment: 'Minecut Motion',
        overrides: [stale],
      })
      expect(result.staleOverrides).toEqual([stale])
    })

    it('⚠️ REFUSES an override outside the band the viewer will obey', () => {
      // An override the viewer silently ignores is worse than no override: the file
      // says the garment is repaired and it is not.
      for (const factor of [-1, -4, 8, -512]) {
        expect(() =>
          annotateGlbOverlays(buildGlb(SCENE), [reading()], {
            garment: 'Minecut Motion',
            overrides: [override({ material: 'Material_Graphic_330411', factor })],
          }),
        ).toThrow(/outside the/)
      }
    })

    it('accepts an override inside the band and writes that value', () => {
      const { bytes } = annotateGlbOverlays(buildGlb(SCENE), [reading()], {
        garment: 'Minecut Motion',
        overrides: [override({ material: 'Material_Graphic_330411', factor: -32 })],
      })
      expect(parseJson(bytes).materials[0]?.extras?.depthBias).toMatchObject({
        factor: -32,
        units: -32,
      })
    })
  })
})
