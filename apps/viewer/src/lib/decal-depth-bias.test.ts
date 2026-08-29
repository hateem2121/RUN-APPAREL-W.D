import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MAX_ABS_OVERLAY_BIAS,
  MIN_ABS_OVERLAY_BIAS,
  OFFSET_FACTOR,
  OFFSET_UNITS,
  type DepthBiasTarget,
  applyDecalDepthBias,
  backingThreeMaterial,
  readOverlayBias,
} from './decal-depth-bias'

const target = (alphaTest: number, depthBias?: unknown): DepthBiasTarget => ({
  alphaTest,
  polygonOffset: false,
  polygonOffsetFactor: 0,
  polygonOffsetUnits: 0,
  needsUpdate: false,
  ...(depthBias === undefined ? {} : { userData: { depthBias } }),
})

/** What tools/asset-pipeline writes into a flagged material's glTF `extras`. */
const flag = (factor = -8) => ({
  enabled: true,
  factor,
  units: factor,
  reason: 'sits 0.101 mm in front of an aligned surface (frontness 0.99)',
  confidence: 0.987,
  supportPrimitive: 'Default Fabric_2915',
  distanceMm: 0.1014,
  detector: 'overlay-depth@1',
})

describe('applyDecalDepthBias', () => {
  it('biases a cut-out decal toward the camera', () => {
    const decal = target(0.5)
    const result = applyDecalDepthBias([{ name: 'RUN LOGO' }], () => decal)
    expect(decal.polygonOffset).toBe(true)
    // NEGATIVE pulls nearer in the depth buffer, which is what wins against the cloth.
    expect(decal.polygonOffsetFactor).toBeLessThan(0)
    expect(decal.polygonOffsetUnits).toBeLessThan(0)
    expect(decal.needsUpdate).toBe(true)
    expect(result.biased).toEqual(['RUN LOGO'])
  })

  it('LEAVES opaque fabric alone', () => {
    // Biasing the garment body would push it through whatever is behind it — the
    // decal bleeding through from the far side that the three.js docs warn about.
    const fabric = target(0)
    const result = applyDecalDepthBias([{ name: 'Cotton_Jersey' }], () => fabric)
    expect(fabric.polygonOffset).toBe(false)
    expect(result.skipped).toBe(1)
    expect(result.biased).toEqual([])
  })

  it('LEAVES a genuinely sheer BLEND panel alone', () => {
    const sheer = target(0)
    applyDecalDepthBias([{ name: 'Mesh_Panel' }], () => sheer)
    expect(sheer.polygonOffset).toBe(false)
  })

  it('reports a material it cannot reach rather than throwing', () => {
    // If model-viewer's internal API changes, this is what happens at runtime: the
    // count is non-zero and the flicker returns. The type-definition guard below is
    // what turns that into a BUILD failure instead of a silent regression.
    const result = applyDecalDepthBias([{ name: 'RUN LOGO' }], () => null)
    expect(result.unreachable).toBe(1)
    expect(result.biased).toEqual([])
  })

  it('handles an empty material list', () => {
    expect(applyDecalDepthBias([], () => null)).toEqual({
      biased: [],
      overlays: [],
      skipped: 0,
      rejected: 0,
      pending: 0,
      unreachable: 0,
    })
  })

  it('counts a not-yet-loaded colourway material as PENDING, not a fault', () => {
    /*
     * ⚠️ THE BUG THIS FILE EXISTS TO STOP RECURRING. The first version of this
     * module counted every unreachable material the same way, so on the live
     * garment it reported 6 biased and **156 unreachable** — every one of them
     * merely a colourway the visitor had not opened yet. Nothing read the number,
     * and four of five colourways went on flickering in silence.
     *
     * model-viewer builds only the arriving variant's materials; the rest are lazy
     * stubs whose `isLoaded` is false. Those must be quiet, or the real signal is
     * buried under 156 rows of noise.
     */
    const result = applyDecalDepthBias([{ name: 'RUN LOGO', isLoaded: false }], () => null)
    expect(result.pending).toBe(1)
    expect(result.unreachable).toBe(0)
  })

  it('counts a LOADED material with no backing as unreachable — the real fault', () => {
    const result = applyDecalDepthBias([{ name: 'RUN LOGO', isLoaded: true }], () => null)
    expect(result.unreachable).toBe(1)
    expect(result.pending).toBe(0)
  })

  it('biases a material once its colourway has loaded', () => {
    // The `variant-applied` path: the same material that was pending on arrival is
    // reachable after the swap, and must then be biased like any other cut-out.
    const decal = target(0.5)
    let loaded = false
    const material = {
      name: 'Teamwear Logo',
      get isLoaded() {
        return loaded
      },
    }
    expect(applyDecalDepthBias([material], () => (loaded ? decal : null)).pending).toBe(1)
    expect(decal.polygonOffset).toBe(false)

    loaded = true
    expect(applyDecalDepthBias([material], () => (loaded ? decal : null)).biased).toEqual([
      'Teamwear Logo',
    ])
    expect(decal.polygonOffset).toBe(true)
  })
})

/*
 * ⚠️ THE BIAS SHIPPED TOO WEAK TO WORK FOR A DAY, AND EVERY TEST STAYED GREEN.
 *
 * -1/-1 left p001's print eaten through while the owner was looking straight at it.
 * Nothing here failed, because every assertion checked that a bias was APPLIED and
 * none checked that it was STRONG ENOUGH. That is this repository's recurring shape:
 * a fixture that cannot exhibit the defect it guards.
 *
 * A unit test cannot render, so it cannot judge a garment. What it CAN do is refuse
 * a value outside the band that was measured in a real browser on 2026-08-28, and
 * name the number, so lowering it is a deliberate act rather than a quiet one.
 */
describe('⚠️ GUARD — the bias is strong enough to actually win, and not so strong it bleeds', () => {
  it('is at least 8, because -4 still left visible holes in p001', () => {
    // Measured on all 16 processed garments from a fixed camera: at -1, 1.647% of
    // p001's pixels and 0.793% of d001's are wrong; both go clean at -8, and -8 to
    // -128 are indistinguishable. Do NOT weaken this to make something else pass.
    expect(Math.abs(OFFSET_FACTOR)).toBeGreaterThanOrEqual(8)
    expect(Math.abs(OFFSET_UNITS)).toBeGreaterThanOrEqual(8)
  })

  it('is at most 64, the strongest value proven not to change the LIVE garment', () => {
    // n001 — tightest cloth in the catalogue, and the published one — measures
    // 0.000% changed at both -8 and -64. The first change appears at -512 (0.009%)
    // and grows to 0.168% at -4096, which is the far-side bleed-through the three.js
    // docs warn about. 64 is the largest number this repo has actually measured.
    expect(Math.abs(OFFSET_FACTOR)).toBeLessThanOrEqual(64)
    expect(Math.abs(OFFSET_UNITS)).toBeLessThanOrEqual(64)
  })

  it('pulls TOWARD the camera — a positive value biases the wrong way entirely', () => {
    expect(OFFSET_FACTOR).toBeLessThan(0)
    expect(OFFSET_UNITS).toBeLessThan(0)
  })
})

describe('backingThreeMaterial', () => {
  it('finds the symbol whether it is an own property or on the prototype', () => {
    const symbol = Symbol('backingThreeMaterial')
    const backing = target(0.5)
    const own = { [symbol]: backing }
    expect(backingThreeMaterial(own)).toBe(backing)

    const proto = {}
    Object.defineProperty(proto, symbol, { get: () => backing })
    expect(backingThreeMaterial(Object.create(proto))).toBe(backing)
  })

  it('returns null when no such symbol exists', () => {
    expect(backingThreeMaterial({ name: 'x' })).toBeNull()
  })
})

/**
 * The INSTALLED package's material type definitions, so these guards track whatever
 * version actually resolves rather than a version written down somewhere.
 */
function materialTypes(): string {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@google/model-viewer')
  // .../model-viewer/dist/model-viewer.js -> .../model-viewer
  const pkgRoot = dirname(dirname(entry))
  return join(pkgRoot, 'lib', 'features', 'scene-graph', 'material.d.ts')
}

describe('⚠️ GUARD — model-viewer still exposes the internal API this depends on', () => {
  it('declares $backingThreeMaterial on its Material class', () => {
    /*
     * THE WHOLE POINT OF THIS TEST. `$backingThreeMaterial` is a `unique symbol` in
     * model-viewer — an INTERNAL api, not part of its public surface. glTF 2.0 has no
     * polygon-offset property, so a file-based fix would have to move decal geometry,
     * and that is what tore multi-panel prints open along their seams. Reaching into
     * the renderer is the safer trade, but only while this symbol exists.
     *
     * If an upgrade removes or renames it, the failure is SILENT: no exception, no
     * error, the decals simply start flickering again. This repository has paid for
     * that shape three times — a secrets scanner reading 60 bytes, an instrument
     * measuring nothing across 167 loads, an uptime probe green against a 404. So
     * the build fails here instead.
     *
     * Reads the INSTALLED package's type definitions, so it tracks whatever version
     * is actually resolved rather than a version written down somewhere.
     */
    const source = readFileSync(materialTypes(), 'utf8')

    expect(source).toContain('$backingThreeMaterial')
    expect(source).toMatch(/\[\$backingThreeMaterial\]\(\)\s*:\s*MeshPhysicalMaterial/)
  })

  it('still declares isLoaded, which is how pending is told from broken', () => {
    /*
     * ⚠️ THE OLD GUARD COULD NOT HAVE CAUGHT THE COLOURWAY BUG. It asserted the
     * symbol existed, which was true the whole time the fix reached 6 of 26
     * decals. What the fix actually depends on now is `isLoaded` — public API,
     * and the only thing separating "this colourway is not open yet" from
     * "model-viewer changed and the bias is dead". If it disappears, every
     * pending material would be reported as a fault and the diagnostic would
     * become unreadable noise.
     */
    const source = readFileSync(materialTypes(), 'utf8')
    expect(source).toMatch(/get isLoaded\(\)\s*:\s*boolean/)
  })

  it('still builds variant-only materials LAZILY — the reason the bias must repeat', () => {
    /*
     * If model-viewer ever loads every material up front, `variant-applied` becomes
     * redundant rather than wrong — the extra pass is harmless. But we should learn
     * it from a failing test rather than from the code quietly doing nothing, so
     * this pins the `lazyLoadInfo` constructor parameter that creates the stubs.
     */
    const source = readFileSync(materialTypes(), 'utf8')
    expect(source).toContain('lazyLoadInfo')
  })
})

/**
 * ⚠️ THESE ARE THE TESTS THE LAST DEFECT NEEDED AND DID NOT HAVE.
 *
 * The opaque-overlay defect shipped past a green suite because every assertion checked
 * that A bias was applied. "A bias was applied" is not a test. Each block below fails on
 * a specific way of getting it wrong: too weak, wrong sign, or aimed at everything.
 */
describe('overlay bias — a printed OPAQUE layer flagged by the pipeline', () => {
  it('biases an OPAQUE material the pipeline flagged', () => {
    const graphic = target(0, flag())
    const result = applyDecalDepthBias([{ name: 'Material_Graphic_330411' }], () => graphic)
    expect(graphic.polygonOffset).toBe(true)
    expect(graphic.polygonOffsetFactor).toBe(-8)
    expect(graphic.polygonOffsetUnits).toBe(-8)
    expect(graphic.needsUpdate).toBe(true)
    expect(result.overlays).toEqual(['Material_Graphic_330411'])
    expect(result.biased).toEqual(['Material_Graphic_330411'])
  })

  it('⚠️ NEGATIVE CONTROL — does NOT bias every opaque material, only flagged ones', () => {
    // THE constraint. Pulling the garment BODY forward pushes it through what is behind
    // it. Measured on p001, the worst garment on the crude bias-everything test: its
    // body panel scores frontness 0.34 and the pipeline rejects it, so no record is
    // written and nothing here may bias it. Two OPAQUE materials, one flagged.
    const body = target(0)
    const graphic = target(0, flag())
    const materials = [{ name: 'Fleece_Terry_FCL1PSK002_4036' }, { name: 'Material_Graphic' }]
    const result = applyDecalDepthBias(materials, (m) =>
      m.name === 'Material_Graphic' ? graphic : body,
    )
    expect(body.polygonOffset).toBe(false)
    expect(body.polygonOffsetFactor).toBe(0)
    expect(graphic.polygonOffset).toBe(true)
    expect(result.overlays).toEqual(['Material_Graphic'])
    expect(result.skipped).toBe(1)
  })

  it('⚠️ NEGATIVE CONTROL — REFUSES -1, the value that shipped and did nothing', () => {
    // -1 left p001 eaten through WITH the bias on. A file carrying it must not be
    // obeyed silently; the refusal is counted so it can be reported.
    const graphic = target(0, flag(-1))
    const result = applyDecalDepthBias([{ name: 'Material_Graphic' }], () => graphic)
    expect(graphic.polygonOffset).toBe(false)
    expect(result.overlays).toEqual([])
    expect(result.rejected).toBe(1)
    expect(readOverlayBias(graphic)).toBeNull()
  })

  it('⚠️ NEGATIVE CONTROL — REFUSES a POSITIVE bias, which pushes the print behind the cloth', () => {
    for (const wrong of [1, 8, 512]) {
      const graphic = target(0, flag(wrong))
      const result = applyDecalDepthBias([{ name: 'Material_Graphic' }], () => graphic)
      expect(graphic.polygonOffset, `factor ${wrong} must be refused`).toBe(false)
      expect(result.rejected).toBe(1)
    }
  })

  it('⚠️ NEGATIVE CONTROL — REFUSES a bias stronger than the band, unmeasured territory', () => {
    // -512 is where n001 - the LIVE garment - first shows any change at all (0.009%).
    const graphic = target(0, flag(-512))
    applyDecalDepthBias([{ name: 'Material_Graphic' }], () => graphic)
    expect(graphic.polygonOffset).toBe(false)
  })

  it('pins the band at 8..64, the range the measurements actually cover', () => {
    // A floor below 8 re-admits the value that failed; a ceiling above 64 leaves the
    // range where the live garment was never measured. Both ends are evidence.
    expect(MIN_ABS_OVERLAY_BIAS).toBe(8)
    expect(MAX_ABS_OVERLAY_BIAS).toBe(64)
    expect(readOverlayBias(target(0, flag(-8)))).not.toBeNull()
    expect(readOverlayBias(target(0, flag(-64)))).not.toBeNull()
    expect(readOverlayBias(target(0, flag(-7)))).toBeNull()
    expect(readOverlayBias(target(0, flag(-65)))).toBeNull()
  })

  it('ignores a record that is disabled, malformed, or not an object', () => {
    for (const bad of [{ ...flag(), enabled: false }, { factor: -8 }, 'yes', 42, null]) {
      const m = target(0, bad)
      applyDecalDepthBias([{ name: 'x' }], () => m)
      expect(m.polygonOffset, `${JSON.stringify(bad)} must not bias`).toBe(false)
    }
  })

  it('IS IDEMPOTENT — re-running on every colourway swap must not deepen the bias', () => {
    // This runs on `load` AND on every `variant-applied`. Anything that ADDED to the
    // current value would grow without bound as the visitor browses colourways, until a
    // far-side decal bled through the front of the garment.
    const graphic = target(0, flag())
    for (let i = 0; i < 5; i++) applyDecalDepthBias([{ name: 'Material_Graphic' }], () => graphic)
    expect(graphic.polygonOffsetFactor).toBe(-8)
    expect(graphic.polygonOffsetUnits).toBe(-8)
  })

  it('keeps the cut-out repair working alongside it, as a separate mechanism', () => {
    // p001 was repaired by the alphaTest path and must stay repaired. A cut-out with no
    // pipeline record still gets the cut-out bias.
    const cutout = target(0.5)
    const result = applyDecalDepthBias([{ name: 'Asset 2_59703' }], () => cutout)
    expect(cutout.polygonOffsetFactor).toBe(OFFSET_FACTOR)
    expect(cutout.polygonOffsetUnits).toBe(OFFSET_UNITS)
    expect(result.biased).toEqual(['Asset 2_59703'])
    expect(result.overlays).toEqual([])
  })

  it('picks up a flagged material once its colourway loads — the 4-of-5 failure', () => {
    // model-viewer builds only the arriving colourway's materials, so the pipeline
    // flags all five and this must catch each as it appears.
    const built = new Map<string, DepthBiasTarget>()
    const materials = [
      { name: 'Material_Graphic_330411', isLoaded: true },
      { name: 'Material_Graphic_331044', isLoaded: false },
    ]
    built.set('Material_Graphic_330411', target(0, flag()))
    const backingOf = (m: { name: string }) => built.get(m.name) ?? null
    const first = applyDecalDepthBias(materials, backingOf)
    expect(first.overlays).toEqual(['Material_Graphic_330411'])
    expect(first.pending).toBe(1)
    expect(first.unreachable).toBe(0)

    built.set('Material_Graphic_331044', target(0, flag()))
    const second_colourway = materials[1]
    if (!second_colourway) throw new Error('fixture drifted')
    second_colourway.isLoaded = true
    const second = applyDecalDepthBias(materials, backingOf)
    expect(second.overlays).toEqual(['Material_Graphic_330411', 'Material_Graphic_331044'])
    expect(second.pending).toBe(0)
  })
})
