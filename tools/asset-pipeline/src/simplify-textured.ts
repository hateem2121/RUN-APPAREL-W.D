import type { Document, Material, Primitive, Texture, Transform } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import {
  VertexCountMethod,
  compactPrimitive,
  convertPrimitiveToTriangles,
  createTransform,
  getPrimitiveVertexCount,
  simplifyPrimitive,
  weld,
} from '@gltf-transform/functions'
import { findArtworkTexturesByGeometry, isThreadOrHardwareName } from './artwork-geometry'
import { isArtworkMaterialByName } from './texture-artwork'

/**
 * Texture-aware mesh decimation.
 *
 * WHY THIS EXISTS. glTF-Transform's `simplify()` calls meshoptimizer's
 * `simplify()`, which only ever sees vertex *positions*. It infers attribute
 * discontinuities from the index buffer and tries to preserve them, but it
 * cannot know how far a UV has been dragged. On a CLO garment the printed
 * graphics are a texture, so smearing the UVs underneath them tears the
 * artwork — which is exactly what happened on the first real export.
 *
 * The previous fix was `lockBorder: true`. That works, but for the wrong reason
 * and at a brutal price: glTF-Transform documents the flag for "adjacent
 * 'chunks' of a large mesh (e.g. terrain) [that] share a border", and it freezes
 * EVERY topological border — every neckline, cuff, hem and UV island edge.
 * Measured on the real 373 MB export it took the result from 850 k triangles to
 * 6.0 M / 58.3 MB, i.e. 45% over the 40 MB ceiling for published media, so
 * nothing could ever be published.
 *
 * meshoptimizer ships the right tool. From its README: "it can be useful to
 * provide information about attribute values. This allows the simplifier to take
 * attribute error into account which can improve shading (by using vertex
 * normals), texture deformation (by using texture coordinates)". That is
 * `simplifyWithAttributes`, and "texture deformation" is precisely this failure.
 * With UV error inside the budget we can drop `LockBorder` entirely, so the
 * simplifier is free to collapse the interior — where there is nothing to
 * protect — while refusing to smear the artwork.
 *
 * Anything this cannot handle (no UVs, quantized attributes, non-triangles)
 * falls back to the library's own `simplifyPrimitive` with `lockBorder`, so the
 * conservative behaviour is still there as a floor.
 *
 * CALIBRATION. `uvWeight` and `error` trade directly against each other, and the
 * effect is large — see the measured table in simplify-textured.test.ts. Note
 * also that the effect only exists where the UV map is non-linear: a linearly
 * unwrapped surface keeps its texture perfectly under decimation no matter the
 * weight. Real garment unwraps are not linear, which is why this matters.
 */

/**
 * Minimal structural type for the MeshoptSimplifier singleton we depend on.
 *
 * The returned index buffer is narrowed to `Uint32Array<ArrayBuffer>` — the
 * upstream declaration says `Uint32Array`, which TypeScript now reads as
 * `ArrayBufferLike` (i.e. possibly a SharedArrayBuffer) and therefore refuses to
 * hand to glTF-Transform's `Accessor.setArray`. meshoptimizer never returns a
 * shared buffer, so narrowing here is honest and avoids copying a multi-megabyte
 * index buffer purely to satisfy the type checker.
 */
export interface AttributeSimplifier {
  ready: Promise<void>
  simplifyWithAttributes: (
    indices: Uint32Array,
    vertexPositions: Float32Array,
    vertexPositionsStride: number,
    vertexAttributes: Float32Array,
    vertexAttributesStride: number,
    attributeWeights: number[],
    vertexLock: Uint8Array | null,
    targetIndexCount: number,
    targetError: number,
    flags?: string[],
  ) => [Uint32Array<ArrayBuffer>, number]
}

export interface SimplifyTexturedOptions {
  /** The `MeshoptSimplifier` singleton from `meshoptimizer`. */
  simplifier: AttributeSimplifier
  /** Target fraction of triangles to keep, 0–1. A target, not a guarantee. */
  ratio: number
  /** Error ceiling as a fraction of mesh radius. The simplifier stops before exceeding it. */
  error: number
  /**
   * How heavily UV distortion counts against the error budget. meshoptimizer's
   * guidance: "a change of 1/weight in attribute value over a distance d is
   * approximately equivalent to a change of d in position", so for UVs in 0–1 a
   * weight near 1 makes texture stretch roughly as expensive as moving the
   * surface. Raise it to protect artwork harder at the cost of triangle count.
   */
  uvWeight: number
  /** Same idea for vertex normals, which protects shading rather than artwork. */
  normalWeight: number
  /**
   * Meshes whose name matches this are left ALONE by this pass.
   *
   * Exists so `--stitch` and `--simplify` can both run on one garment without
   * decimating the thread twice. Measured 2026-08-21: a stitch pass took the
   * thread to 777k triangles and this pass then took it to 445k, which frayed the
   * cord into spikes and was rejected on sight. Whichever pass owns a mesh should
   * be the only one to touch it.
   *
   * `optimize.ts` sets this to the topstitch pattern whenever the stitch pass ran.
   */
  skipMeshes?: RegExp | undefined
  /**
   * Decimate printed artwork too. Default FALSE since 2026-09-02: a primitive whose
   * material — default or behind any KHR_materials_variants mapping — carries printed
   * artwork is left untouched. The 2026-09 audit measured what decimating them buys and
   * costs: on ARISAN BRA, 0.42 MB of a 40 MB budget against torn brush panels and a
   * chewed waistband slogan (F1-02, FAB-08); on X-Milo, white shards inside the back
   * wordmark that the fidelity preset avoids (B-02); on the Training Trouser, chevrons
   * "attacked with a wire brush" while every gate passed (A-01). meshoptimizer's
   * vertex_lock was considered and rejected: locking print vertices still lets the
   * neighbouring cloth triangles pull the UVs at the boundary. Not decimating the print
   * at all is structural — if artwork is never decimated, decimation damage cannot
   * happen — and the cost is a few hundred KB.
   */
  decimateArtwork?: boolean | undefined
  /**
   * Called with the counters once the pass has run.
   *
   * These used to go only to the document logger at debug level, i.e. nowhere
   * anybody would see them. That matters more than it sounds: if most primitives
   * take the `fallback` path then UV-aware decimation never happened at all, and
   * every hour spent tuning `--uv-weight` was spent on a knob that was not
   * connected. Surfacing it is a one-line answer to "why did that change nothing".
   */
  onResult?: (result: SimplifyTexturedResult) => void
}

/** Result counters, returned for logging and asserted in tests. */
export interface SimplifyTexturedResult {
  /** Primitives decimated with UV/normal error in the budget. */
  attributeAware: number
  /** Primitives that fell back to position-only simplification with lockBorder. */
  fallback: number
  /** Primitives left untouched (unsupported draw mode, or no indices). */
  skipped: number
  /**
   * Primitives deliberately left to an earlier, differently-budgeted pass — see
   * `skipMeshes`. Counted separately from `skipped` on purpose: that field means
   * "this pass could not handle it", and reading a topstitch count there would
   * suggest unsupported draw modes that are not present.
   */
  ownedElsewhere: number
  /**
   * Which UV sets were actually weighted, across every primitive. Reported
   * because it is the difference between artwork being protected and only
   * appearing to be: before this, a garment whose prints sat on TEXCOORD_1 got
   * `[0]` here while the logs happily said "decimated with UV error".
   */
  uvSetsWeighted: number[]
  /**
   * Materials carrying printed artwork whose primitives took the position-only
   * fallback — i.e. were decimated with texture coordinates OUTSIDE the error
   * metric. This is H4 from docs/OPEN-ISSUE-ARTWORK.md stated as a fact rather
   * than a count: `fallback` alone cannot distinguish "some plain fabric took the
   * conservative path" (fine) from "the chest logo was decimated unprotected"
   * (the bug that tore N001's wordmark apart).
   *
   * Structural, not heuristic — if the primitive took that path its artwork was
   * not protected — so it is safe to block a publish on. Names come from the
   * material, because that is what an operator can find in CLO.
   */
  artworkAtRisk: string[]
  /**
   * Primitives left untouched because they carry printed artwork (default, since
   * 2026-09-02). The report names their materials so the owner sees what was
   * protected, and so an old-style export whose whole panel IS the artwork — the
   * Cycling-Bib halftone is painted on a big panel — shows up as a large number
   * rather than a mystery about file size.
   */
  artworkUntouched: number
  artworkUntouchedMaterials: string[]
}

const TRIANGLES = 4
const TRIANGLE_STRIP = 5
const TRIANGLE_FAN = 6

const UV_SEMANTIC = /^TEXCOORD_(\d+)$/

/**
 * Every UV set the primitive carries, lowest index first.
 *
 * WHY ALL OF THEM. This used to read `TEXCOORD_0` and stop. CLO's "Apply
 * Graphic" routinely places printed artwork on a second UV set, and a material
 * whose `baseColorTexture.texCoord` is 1 therefore had its UVs decimated at
 * ZERO weight while the fabric's were protected at full weight — artwork
 * smeared on some panels, clean on others, which is exactly the damage reported
 * on the first real garment. Weighting only the first set is not a conservative
 * default; it is silent, selective non-protection.
 *
 * `prune()` runs earlier in the chain and drops UV sets nothing samples, so
 * anything still present here is in use and worth the budget.
 */
function listUvSets(prim: Primitive): { index: number; array: Float32Array }[] {
  const sets: { index: number; array: Float32Array }[] = []
  for (const semantic of prim.listSemantics()) {
    const match = UV_SEMANTIC.exec(semantic)
    if (!match) continue
    const accessor = prim.getAttribute(semantic)
    const array = accessor?.getArray()
    // A quantized set would need dequantizing first, and the helper for that is
    // not exported — one non-Float32 set sends the whole primitive to the
    // conservative path rather than silently protecting only some of its UVs.
    if (!accessor || !(array instanceof Float32Array)) return []
    sets.push({ index: Number(match[1]), array })
  }
  return sets.sort((a, b) => a.index - b.index)
}

/**
 * Decimate one primitive using UV (and normal) error. Returns false when this
 * primitive is not a candidate, so the caller can fall back.
 */
function trySimplifyTexturedPrimitive(
  document: Document,
  prim: Primitive,
  options: SimplifyTexturedOptions,
  weighted: Set<number>,
): boolean {
  const mode = prim.getMode()
  if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) convertPrimitiveToTriangles(prim)
  else if (mode !== TRIANGLES) return false

  // uvWeight 0 means "do not account for texture error", which is the library's
  // behaviour — hand it back so the caller uses the conservative path.
  if (options.uvWeight <= 0) return false
  if (!prim.getAttribute('TEXCOORD_0') || !prim.getIndices()) return false

  // Match the library's own pre-step: a primitive whose index buffer addresses
  // far fewer vertices than it owns is compacted first, so the simplifier is not
  // handed a mostly-unused vertex buffer.
  const srcVertexCount = getPrimitiveVertexCount(prim, VertexCountMethod.UPLOAD)
  const srcIndexCount = getPrimitiveVertexCount(prim, VertexCountMethod.RENDER)
  if (srcIndexCount < srcVertexCount / 2) compactPrimitive(prim)

  const position = prim.getAttribute('POSITION')
  const normal = prim.getAttribute('NORMAL')
  const srcIndices = prim.getIndices()
  if (!position || !srcIndices) return false

  const positionArray = position.getArray()
  // Quantized (normalized integer) attributes would need dequantizing first, and
  // the helper for that is not exported. Hand those to the library instead.
  if (!(positionArray instanceof Float32Array)) return false

  const uvSets = listUvSets(prim)
  if (uvSets.length === 0) return false

  const vertexCount = position.getCount()
  for (const set of uvSets) {
    if (prim.getAttribute(`TEXCOORD_${set.index}`)?.getCount() !== vertexCount) return false
  }

  const normalArray = normal?.getArray()
  const useNormal =
    options.normalWeight > 0 &&
    normalArray instanceof Float32Array &&
    normal?.getCount() === vertexCount

  // meshoptimizer takes one interleaved attribute buffer plus a per-component
  // weight list: [u0, v0, (u1, v1, ...)] then optionally [nx, ny, nz].
  const stride = uvSets.length * 2 + (useNormal ? 3 : 0)
  const attributes = new Float32Array(vertexCount * stride)
  for (let i = 0; i < vertexCount; i++) {
    const dst = i * stride
    for (const [set, uv] of uvSets.entries()) {
      attributes[dst + set * 2] = uv.array[i * 2] as number
      attributes[dst + set * 2 + 1] = uv.array[i * 2 + 1] as number
    }
    if (useNormal) {
      const src = i * 3
      const base = dst + uvSets.length * 2
      attributes[base] = (normalArray as Float32Array)[src] as number
      attributes[base + 1] = (normalArray as Float32Array)[src + 1] as number
      attributes[base + 2] = (normalArray as Float32Array)[src + 2] as number
    }
  }
  // Every UV set is priced the same. A print on TEXCOORD_1 is exactly as
  // expensive to smear as one on TEXCOORD_0 — which is the whole point.
  const weights = [
    ...uvSets.flatMap(() => [options.uvWeight, options.uvWeight]),
    ...(useNormal ? [options.normalWeight, options.normalWeight, options.normalWeight] : []),
  ]
  for (const set of uvSets) weighted.add(set.index)

  let indicesArray = srcIndices.getArray()
  if (!indicesArray) return false
  if (!(indicesArray instanceof Uint32Array)) indicesArray = new Uint32Array(indicesArray)

  const targetIndexCount = Math.floor((options.ratio * indicesArray.length) / 3) * 3
  // No LockBorder: UV error is now inside the budget, which is what protects the
  // artwork. Locking borders as well would only re-inflate the triangle count.
  const [dstIndicesArray] = options.simplifier.simplifyWithAttributes(
    indicesArray,
    positionArray,
    3,
    attributes,
    stride,
    weights,
    null,
    targetIndexCount,
    options.error,
    [],
  )

  prim.setIndices(
    document.createAccessor().setArray(dstIndicesArray).setBuffer(srcIndices.getBuffer()),
  )
  if (srcIndices.listParents().length === 1) srcIndices.dispose()
  compactPrimitive(prim)

  // Narrow the index buffer where it fits, exactly as the library does.
  const dstVertexCount = getPrimitiveVertexCount(prim, VertexCountMethod.UPLOAD)
  if (dstVertexCount <= 65534) {
    const indices = prim.getIndices()
    const array = indices?.getArray()
    if (indices && array) indices.setArray(new Uint16Array(array))
  }
  return true
}

/**
 * Transform factory. Welds first (the simplifier cannot collapse split vertices,
 * and glTF-Transform's own `simplify` does the same), then decimates every
 * primitive, preferring the attribute-aware path.
 */
export function simplifyTextured(options: SimplifyTexturedOptions): Transform {
  return createTransform('simplifyTextured', async (document: Document): Promise<void> => {
    await options.simplifier.ready
    await document.transform(weld({ overwrite: false }))

    const result = runSimplifyTextured(document, options)
    options.onResult?.(result)
    document
      .getLogger()
      .debug(
        `simplifyTextured: ${result.attributeAware} primitives with UV error, ` +
          `${result.fallback} fallback, ${result.skipped} skipped, ${result.artworkUntouched} print piece(s) untouched, ` +
          `${result.ownedElsewhere} owned by the stitch pass. ` +
          `UV sets weighted: ${result.uvSetsWeighted.map((n) => `TEXCOORD_${n}`).join(', ') || 'none'}.`,
      )
  })
}

/**
 * The synchronous body, exported so tests can drive it on a Document without
 * awaiting the WASM transform pipeline.
 */
export function runSimplifyTextured(
  document: Document,
  options: SimplifyTexturedOptions,
): SimplifyTexturedResult {
  const weighted = new Set<number>()
  const atRisk = new Set<string>()
  const result: SimplifyTexturedResult = {
    attributeAware: 0,
    fallback: 0,
    skipped: 0,
    ownedElsewhere: 0,
    uvSetsWeighted: [],
    artworkAtRisk: [],
    artworkUntouched: 0,
    artworkUntouchedMaterials: [],
  }

  // Which textures are artwork by UV span (language-independent; excludes thread and
  // hardware by name), computed once — the same signal the compression budget uses.
  // Audit HG-03: a garment whose prints are called `Asset 2@2400x` has no artwork by
  // NAME at all, so a name-only skip would decimate its prints and never know.
  const artworkByGeometry = findArtworkTexturesByGeometry(document)
  const untouchedMaterials = new Set<string>()
  const untouched: { prim: Primitive; indexCount: number; names: string[] }[] = []
  const decimatedArtwork: { prim: Primitive; indexCount: number; names: string[] }[] = []

  for (const mesh of document.getRoot().listMeshes()) {
    // Owned by an earlier, differently-budgeted pass (see `skipMeshes`).
    if (options.skipMeshes?.test(mesh.getName() || '')) {
      result.ownedElsewhere += mesh.listPrimitives().length
      continue
    }
    for (const prim of mesh.listPrimitives()) {
      const mode = prim.getMode()
      if (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN) {
        result.skipped++
        continue
      }
      // NEVER DECIMATE A PRINT PIECE — see `decimateArtwork`. Checked on the default
      // material AND every colourway mapping: the geometry is shared, so a print in
      // any one colourway is enough to protect the piece for all of them.
      const names = artworkMaterialNames(prim, artworkByGeometry)
      if (names.length > 0) {
        const indexCount = prim.getIndices()?.getCount() ?? 0
        if (options.decimateArtwork !== true) {
          result.artworkUntouched++
          for (const name of names) untouchedMaterials.add(name)
          untouched.push({ prim, indexCount, names })
          continue
        }
        // The opt-in still names every print it decimates — on BOTH paths, which the
        // old fallback-only alarm never did (audit HG-02, F1-09).
        decimatedArtwork.push({ prim, indexCount, names })
      }
      if (trySimplifyTexturedPrimitive(document, prim, options, weighted)) {
        result.attributeAware++
      } else if (prim.getIndices()) {
        // Position-only, borders locked — the conservative behaviour this
        // replaced, kept as the floor for anything the fast path cannot take.
        simplifyPrimitive(prim, {
          simplifier: options.simplifier,
          ratio: options.ratio,
          error: options.error,
          lockBorder: true,
        })
        result.fallback++
      } else {
        result.skipped++
        continue
      }
      if (getPrimitiveVertexCount(prim, VertexCountMethod.RENDER) === 0) prim.dispose()
    }
    if (mesh.listPrimitives().length === 0) mesh.dispose()
  }

  // THE ALARM, RESTATED AS AN ASSERTION. `artworkAtRisk` used to fire only on the
  // rare position-only fallback, so on every real garment it was silent by
  // construction while the fast path tore the lettering (audit HG-02, F1-09). Now it
  // also asserts the rule above actually held: any protected primitive whose index
  // count moved is named, and the Worker refuses the file. Structural, no
  // false-positive case — the bar the other blocking gates meet.
  for (const { prim, indexCount, names } of [...untouched, ...decimatedArtwork]) {
    if ((prim.getIndices()?.getCount() ?? 0) !== indexCount) {
      for (const name of names) atRisk.add(name)
    }
  }
  result.uvSetsWeighted = [...weighted].sort((a, b) => a - b)
  result.artworkAtRisk = [...atRisk].sort()
  result.artworkUntouchedMaterials = [...untouchedMaterials].sort()
  return result
}

/**
 * The material names that make this primitive a print piece — empty when it is not.
 *
 * Two signals, either is enough: the material's NAME says artwork (the gate's word
 * list), or its base-colour texture is artwork by UV SPAN (artwork-geometry.ts, the
 * signal that catches `ZZ00000ZZZZ0` and `ルン ろご。`). Thread and hardware are
 * excluded by name first, whatever their picture — the rule the blocking gate and the
 * compression budget both apply. Reads the default material AND every
 * KHR_materials_variants mapping (the repo's twice-missed trap).
 */
function artworkMaterialNames(prim: Primitive, artworkByGeometry: Set<Texture>): string[] {
  const candidates: Material[] = []
  const fallback = prim.getMaterial()
  if (fallback) candidates.push(fallback)
  const mappings = prim.getExtension<MappingList>('KHR_materials_variants')
  if (mappings) {
    for (const mapping of mappings.listMappings()) {
      const material = mapping.getMaterial()
      if (material) candidates.push(material)
    }
  }
  const names = new Set<string>()
  for (const material of candidates) {
    const name = material.getName() || '(unnamed material)'
    if (isThreadOrHardwareName(name)) continue
    const texture = material.getBaseColorTexture()
    if (materialCarriesArtwork(material) || (texture !== null && artworkByGeometry.has(texture))) {
      names.add(name)
    }
  }
  return [...names]
}

/**
 * Does this material show printed artwork?
 *
 * ⚠️ READS THE MATERIAL NAME. IT READ THE TEXTURE NAME UNTIL 2026-08-29, AND THAT MADE
 * THE GATE INCAPABLE OF EVER FIRING ON A REAL GARMENT.
 *
 * `artworkAtRisk` is one of three checks that refuse a damaged garment, and it is the
 * one that catches a logo torn by decimation. It asked `isArtworkTextureByName`, and a
 * CLO export names the MATERIAL and leaves every texture anonymous — measured across all
 * ten raw exports on this machine, 2,398 images, not one with a name or URI. So the gate
 * was decoration: it could not refuse anything.
 *
 * The tests never noticed because `placeholders.ts` names all six of its textures. The
 * practice garment has the one property real files lack, so the check looked healthy in
 * every run.
 *
 * ⚠️ AND THE OBVIOUS FIX IS A TRAP. Reading the glTF `textures[].name` instead looks
 * right — the field IS populated — but on a real CLO export every value is the literal
 * string "Texture", and `ARTWORK_NAME` contains the alternative `text`, which "Texture"
 * contains. Measured on the re-exported Minecut Motion: that predicate matches 50 of 50
 * textures. The gate would flip from never firing to always firing, refusing every
 * garment. `ARTWORK_MATERIAL_NAME` deliberately omits `text` and `type` for exactly
 * this reason.
 *
 * Measured with the material predicate on the same export: 48 of 114 materials, and they
 * are the right ones — `Material_Graphic_*`, `RUN LOGO_*`,
 * `LOGO Team wear Embridory gold gold_*` across six colourways. Controls: the three
 * plain fabric names match 0, a known artwork name matches 1, and 48 < 114.
 *
 * The material is still checked for a visible texture slot first. A material with no
 * baseColor or emissive texture shows no printed graphic whatever it is called, so a
 * name-only test would flag trim and hardware that carry no artwork at all.
 */
function materialCarriesArtwork(material: Material): boolean {
  const showsATexture = Boolean(material.getBaseColorTexture() ?? material.getEmissiveTexture())
  return showsATexture && isArtworkMaterialByName(material)
}
