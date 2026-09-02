/**
 * Stop printed decals flickering against the cloth they sit on.
 *
 * THE DEFECT, reported 2026-08-27 as graphics that "flicker or speckle". A decal is
 * authored coplanar with the garment surface, so the two have near-identical depth
 * values and the GPU cannot decide which is in front. The winner changes per pixel
 * and per frame — classic z-fighting, and it is worst exactly when the garment moves.
 *
 * ⚠️ glTF 2.0 CANNOT EXPRESS A POLYGON OFFSET. There is no material property for it
 * in the format, so a file-based pipeline has only one lever: physically moving the
 * decal geometry off the surface. That is the approach that tore multi-panel prints
 * open along their seams. three.js DOES have the setting, so the viewer can apply it
 * without touching a single vertex — and it then fixes every garment at once,
 * including ones already published, with nothing reprocessed.
 *
 * ⚠️ THIS REACHES INTO model-viewer's INTERNALS, DELIBERATELY AND WITH A GUARD.
 * `Material[$backingThreeMaterial]` is a `unique symbol` — an internal API. It works
 * on 4.3.1 and could disappear in any upgrade, and the failure would be SILENT: no
 * error, no exception, just the flicker quietly returning. That is the exact shape
 * this repository keeps paying for — a secrets scanner that read 60 bytes, an
 * instrument that measured nothing for 167 loads, an uptime check that stayed green
 * against a 404. So `decal-depth-bias.test.ts` asserts the symbol is still declared
 * in the installed package's type definitions, and fails the build if it is not.
 *
 * WHICH MATERIALS — TWO ANSWERS, BECAUSE THERE ARE TWO DEFECTS.
 *
 * 1. CUT-OUTS, detected here. After `solidifyMaterials` a printed decal is alphaMode
 *    MASK, which three.js represents as `alphaTest > 0`.
 * 2. OPAQUE PRINTED LAYERS stacked on cloth, flagged by the PIPELINE in the asset's
 *    material `extras` and merely obeyed here.
 *
 * ⚠️ THIS COMMENT SAID "Only cut-outs" UNTIL 2026-08-28 AND THAT LEFT THE OWNER'S
 * ACTUAL DEFECT UNFIXED FOR A WHOLE SESSION. It went on to say fabric is OPAQUE and
 * must never be pulled forward, which is true of the garment BODY and false of a
 * printed layer sitting ON the body — and a CLO garment stacks exactly that, two
 * OPAQUE surfaces roughly 0.1 mm apart. They fight, and the pale layer beneath punches
 * through as white specks that appear and vanish as the garment turns.
 *
 * The distinction the old comment could not make is GEOMETRIC and cannot be made from
 * here: `model-viewer` has a flat list of materials and no idea which panel any of them
 * sits on. `tools/asset-pipeline/src/overlay-depth.ts` measures it once, per primitive,
 * and records the decision in the file. Sheer BLEND panels are still left alone, and so
 * is every fabric with nothing in front of it.
 *
 * ⚠️ WHICH three.js MATERIAL — EVERY ONE BEHIND THE WRAPPER, NOT THE FIRST (audit DV-01,
 * fixed 2026-09-03). A model-viewer Material wrapper holds a SET of three.js materials
 * (`$correlatedObjects`); `$backingThreeMaterial` is merely the first entry. On a
 * colourway switch `PrimitiveNode.setActiveMaterial` binds a material from that set —
 * or adds the mesh's own — so the one the GPU draws is often NOT the first. Writing to
 * the first alone counted as success while the scene drew another: measured on the live
 * skinsuit, wrapper backings present in the scene fell from 44 to 5 after the first
 * colourway click, and the bib drew 0 of 5 biased. Every entry is written now, and the
 * e2e probe counts what the SCENE holds, not what the wrappers report.
 */

/** The three.js material properties this needs. Structural, so a test can fake it. */
export interface DepthBiasTarget {
  alphaTest: number
  /**
   * three.js copies a glTF material's `extras` here verbatim — GLTFLoader's
   * `assignExtrasToUserData` does `Object.assign(material.userData, def.extras)`, and
   * `Material.copy` deep-clones it, so it survives model-viewer's own material cloning.
   * That is how a PIPELINE decision reaches the renderer without a new format, a
   * sidecar file or a name lookup. Verified in a real browser on model-viewer 4.3.1 /
   * three 0.183.2, with the un-annotated file as the negative control: 0 materials
   * carried the record before annotation, 1 after.
   */
  userData?: Record<string, unknown>
  polygonOffset: boolean
  polygonOffsetFactor: number
  polygonOffsetUnits: number
  needsUpdate: boolean
}

export interface DepthBiasResult {
  /** Material names that were biased, by either mechanism. */
  biased: string[]
  /**
   * The subset of `biased` driven by a pipeline `depthBias` record rather than by
   * `alphaTest`. Reported separately because the two are different defects with
   * different evidence, and collapsing them is how the second one stayed hidden.
   */
  overlays: string[]
  /** Materials skipped: neither a cut-out nor a flagged overlay. */
  skipped: number
  /**
   * Materials carrying a `depthBias` record the viewer REFUSED. A stale asset, a
   * hand-edited file or a future detector could carry a value outside the band this
   * viewer will obey; refusing loudly beats applying a bias nobody measured.
   */
  rejected: number
  /**
   * Materials whose colourway has not been loaded yet. EXPECTED, and not a fault.
   *
   * model-viewer builds only the arriving variant's materials; anything reachable
   * solely through `KHR_materials_variants` is a lazy stub holding an empty Set
   * (`lib/features/scene-graph/model.js`), so its backing three.js material does
   * not exist yet. The `variant-applied` listener catches these when the visitor
   * reaches that colourway.
   */
  pending: number
  /**
   * three.js materials actually written — every entry behind every biased wrapper. On a
   * five-colourway garment this is larger than `biased.length`, and that gap is the
   * DV-01 defect made visible: the old code wrote one per wrapper.
   */
  targets: number
  /**
   * Materials that ARE loaded and still have no backing material. A real fault.
   *
   * ⚠️ THIS COUNT USED TO INCLUDE `pending`, AND THAT IS WHY THE BUG SURVIVED.
   * Measured 2026-08-27 on the live garment: 6 of 26 decals biased, **156
   * materials counted unreachable** — all of them merely lazy — and nothing read
   * the number, so four of five colourways kept flickering in silence. Split so
   * the alarming case can be reported without 156 rows of noise behind it.
   */
  unreachable: number
}

/**
 * Pulled TOWARD the camera, so the decal wins the depth test against the cloth.
 *
 * ⚠️ THIS WAS -1/-1 UNTIL 2026-08-28, AND -1 DID NOT FIX THE FLICKER. The owner
 * still saw shattered artwork in the review viewer with the bias switched ON, which
 * is what reopened this. Measured across all 16 processed garments from a fixed
 * camera: going -1 -> -8 changes 1.647% of p001's pixels and 0.793% of d001's, and
 * those pixels are holes in the print closing. p001's chevrons and its "NEVER LOOK
 * BACK" go from eaten-through to solid. Damage is still visible at -4; from -8 to
 * -128 the render is indistinguishable, so -8 is the START OF A WIDE PLATEAU rather
 * than a knife edge, which is why it is -8 and not the -4 that also nearly works.
 *
 * ⚠️ THIS COMMENT CLAIMED -1 WAS "the smallest bias that reliably separates two
 * coplanar surfaces", AND THAT LARGER VALUES BLEED A FAR-SIDE DECAL THROUGH TO THE
 * FRONT. The first half was false: -1 leaves p001 destroyed. The second is real but
 * its threshold was wrong by two orders of magnitude. On n001 - the tightest garment
 * in the catalogue, front and back cloth closest together, and the one that is LIVE
 * - nothing changes at -8 or at -64 (0.000% of pixels); the first change appears at
 * -512 (0.009%) and reaches 0.168% at -4096. So -8 carries at least a 64x margin.
 * On the garments -8 does change, the change SATURATES at -8 and does not grow
 * through -4096 - that is damage being repaired, not a decal bleeding through.
 *
 * That n001 measures 0.000% is also the safety argument for the live product: this
 * value cannot alter the garment already published.
 */
export const OFFSET_FACTOR = -8
export const OFFSET_UNITS = -8

/**
 * The band a pipeline-supplied bias must fall in for this viewer to obey it.
 *
 * ⚠️ -1 IS DELIBERATELY OUTSIDE IT. That is what shipped on 2026-08-27 and it left p001
 * destroyed; the value was eight times too weak and no test caught it, because every
 * assertion checked that a bias was APPLIED and none checked it was STRONG ENOUGH.
 * A POSITIVE value is outside it too, and in the opposite and worse direction: it pushes
 * the decal AWAY from the camera, behind the cloth it is printed on.
 */
export const MIN_ABS_OVERLAY_BIAS = 8
export const MAX_ABS_OVERLAY_BIAS = 64

/** The pipeline's decision, as written into glTF material `extras` by the asset pipeline. */
export interface OverlayBiasRecord {
  enabled: boolean
  factor: number
  units: number
}

/**
 * Read a pipeline overlay decision off a material, or null if there is not a valid one.
 *
 * ⚠️ VALIDATED, NOT TRUSTED. `userData` is whatever the file said. A record that is
 * disabled, mis-typed, too weak or the wrong sign is refused and counted, because the
 * alternative is a garment silently rendering with a bias nobody measured — and a silent
 * wrong value is precisely the failure this whole module exists to undo.
 */
export function readOverlayBias(target: DepthBiasTarget): OverlayBiasRecord | null {
  const raw = target.userData?.depthBias
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<OverlayBiasRecord>
  if (record.enabled !== true) return null
  const { factor, units } = record
  if (typeof factor !== 'number' || typeof units !== 'number') return null
  const inBand = (n: number) => n <= -MIN_ABS_OVERLAY_BIAS && n >= -MAX_ABS_OVERLAY_BIAS
  if (!inBand(factor) || !inBand(units)) return null
  return { enabled: true, factor, units }
}

/**
 * Apply a depth bias to every cut-out material.
 *
 * Takes the backing-material accessor as an argument rather than reaching for the
 * symbol itself, so the decision logic is testable without a browser, a GPU or a
 * real model-viewer element — none of which exist under jsdom. The accessor returns
 * EVERY three.js material behind the wrapper (correlatedThreeMaterials); a single
 * target is accepted for callers and tests written against the older shape.
 */
export function applyDecalDepthBias<M extends { name?: string; isLoaded?: boolean }>(
  materials: Iterable<M>,
  backingsOf: (material: M) => readonly DepthBiasTarget[] | DepthBiasTarget | null | undefined,
): DepthBiasResult {
  const result: DepthBiasResult = {
    biased: [],
    overlays: [],
    skipped: 0,
    rejected: 0,
    pending: 0,
    targets: 0,
    unreachable: 0,
  }

  for (const material of materials) {
    const found = backingsOf(material)
    const targets = found == null ? [] : Array.isArray(found) ? found : [found as DepthBiasTarget]
    if (targets.length === 0) {
      // `isLoaded` is model-viewer PUBLIC API and separates the two silences: a
      // lazy variant material is expected to be unreachable and will be picked up
      // by the next `variant-applied`; a LOADED material with no backing means the
      // internal symbol has gone. Absent (a hand-built test double) counts as the
      // alarming case, because that is the one that must never pass unnoticed.
      if (material.isLoaded === false) result.pending++
      else result.unreachable++
      continue
    }
    // TWO MECHANISMS, ONE LEVER, AND THEY ARE DIFFERENT DEFECTS.
    //
    // 1. alphaTest > 0 IS alphaMode MASK — a printed CUT-OUT. Detected here because
    //    three.js exposes it directly and it needs nothing from the file.
    // 2. A pipeline `depthBias` record — a printed OPAQUE layer stacked on cloth.
    //    Invisible from here: it is a property of the GEOMETRY, not of the material,
    //    so only the pipeline can see it. tools/asset-pipeline/src/overlay-depth.ts
    //    measures whether a surface sits a hair IN FRONT of another, near-coplanar,
    //    and writes the answer into the asset.
    //
    // ⚠️ CASE 2 IS HERE BECAUSE ITS ABSENCE COST A WHOLE SESSION. This skip used to
    // reject everything that was not a cut-out, on the reasoning that biasing the
    // garment body would push it through what is behind it. That is right about the
    // BODY and wrong about a printed layer sitting ON the body: a CLO garment stacks
    // an opaque graphic on an opaque fabric at near-identical depth, and hiding
    // Minecut Motion's graphic turns the skirt 100% white. The two fought, and the
    // pale layer beneath punched through as white specks that appeared and vanished as
    // the garment turned — "sparkling", reported from the owner's first message.
    // Biasing that one layer takes Minecut from 5.196% white specks to 0.002%.
    //
    // ⚠️ AND IT IS STILL NOT "BIAS EVERY OPAQUE MATERIAL". Fabric with nothing in front
    // of it is never flagged; measured on p001, the worst garment on the crude
    // bias-everything screen test, its body panel scores frontness 0.34 and is rejected
    // while its artwork scores 0.58-0.64. n001, the source of the LIVE product, comes
    // out of the pipeline BYTE-IDENTICAL — nothing on it is flagged at all.
    let wrapperBiased = false
    let wrapperOverlay = false
    for (const backing of targets) {
      const overlay = readOverlayBias(backing)
      if (!overlay && !(backing.alphaTest > 0)) {
        // A material carrying a record the band check refused is NOT a plain skip.
        if (backing.userData?.depthBias) result.rejected++
        continue
      }
      // Assignment, never accumulation — this runs again on every `variant-applied`, so
      // anything that ADDED to the current value would deepen the bias each colourway
      // switch until a far-side decal bled through the front of the garment.
      backing.polygonOffset = true
      backing.polygonOffsetFactor = overlay ? overlay.factor : OFFSET_FACTOR
      backing.polygonOffsetUnits = overlay ? overlay.units : OFFSET_UNITS
      backing.needsUpdate = true
      result.targets++
      wrapperBiased = true
      if (overlay) wrapperOverlay = true
    }
    if (!wrapperBiased) {
      result.skipped++
      continue
    }
    const name = material.name ?? '(unnamed material)'
    result.biased.push(name)
    if (wrapperOverlay) result.overlays.push(name)
  }

  return result
}

/**
 * EVERY three.js material behind a model-viewer Material wrapper.
 *
 * model-viewer keeps them in a Set under `Symbol('correlatedObjects')` — looked up by
 * description, as `backingThreeMaterial` is, because a deep import is not part of the
 * package's export map. A lazy (not yet loaded) colourway material holds `null` or an
 * empty Set, which comes back as an empty array and counts as `pending`. If the symbol
 * is ever gone, this falls back to the single backing material so the repair degrades
 * to the 2026-08-27 behaviour rather than to nothing — and the e2e scene count then
 * fails loudly, which is the point of counting the scene.
 */
export function correlatedThreeMaterials(material: object): DepthBiasTarget[] {
  for (const source of [material, Object.getPrototypeOf(material) as object | null]) {
    if (!source) continue
    for (const symbol of Object.getOwnPropertySymbols(source)) {
      if (symbol.description !== 'correlatedObjects') continue
      const value = (material as Record<symbol, unknown>)[symbol]
      if (value == null) return []
      if (typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return [...(value as Iterable<unknown>)].filter(
          (entry): entry is DepthBiasTarget => !!entry && typeof entry === 'object',
        )
      }
    }
  }
  const single = backingThreeMaterial(material)
  return single ? [single] : []
}

/**
 * The symbol model-viewer uses for the backing three.js material.
 *
 * Looked up by DESCRIPTION rather than imported, because a deep import into
 * `@google/model-viewer/lib/...` is not part of the package's export map and would
 * break the bundle rather than degrade. `Object.getOwnPropertySymbols` finds it on
 * the live object whatever the module graph looks like.
 *
 * Returns null when it cannot be found — the caller reports that, and
 * decal-depth-bias.test.ts fails the build if the API has gone.
 */
export function backingThreeMaterial<T extends object = DepthBiasTarget>(
  material: object,
): T | null {
  for (const symbol of Object.getOwnPropertySymbols(material)) {
    if (symbol.description !== 'backingThreeMaterial') continue
    const value = (material as Record<symbol, unknown>)[symbol]
    if (value && typeof value === 'object') return value as T
  }
  // Not an own symbol — model-viewer defines it as a prototype getter, so walk up.
  const prototype = Object.getPrototypeOf(material) as object | null
  if (prototype) {
    for (const symbol of Object.getOwnPropertySymbols(prototype)) {
      if (symbol.description !== 'backingThreeMaterial') continue
      const value = (material as Record<symbol, unknown>)[symbol]
      if (value && typeof value === 'object') return value as T
    }
  }
  return null
}
