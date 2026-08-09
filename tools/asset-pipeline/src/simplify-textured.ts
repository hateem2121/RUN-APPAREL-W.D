import type { Document, Material, Primitive, Transform } from '@gltf-transform/core'
import {
  VertexCountMethod,
  compactPrimitive,
  convertPrimitiveToTriangles,
  createTransform,
  getPrimitiveVertexCount,
  simplifyPrimitive,
  weld,
} from '@gltf-transform/functions'
import { isArtworkTextureByName } from './texture-artwork'

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
          `${result.fallback} fallback, ${result.skipped} skipped. ` +
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
    uvSetsWeighted: [],
    artworkAtRisk: [],
  }

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mode = prim.getMode()
      if (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN) {
        result.skipped++
        continue
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
        const material = prim.getMaterial()
        if (material && materialCarriesArtwork(material)) {
          atRisk.add(material.getName() || '(unnamed material)')
        }
      } else {
        result.skipped++
        continue
      }
      if (getPrimitiveVertexCount(prim, VertexCountMethod.RENDER) === 0) prim.dispose()
    }
    if (mesh.listPrimitives().length === 0) mesh.dispose()
  }

  result.uvSetsWeighted = [...weighted].sort((a, b) => a - b)
  result.artworkAtRisk = [...atRisk].sort()
  return result
}

/**
 * Does this material show printed artwork? baseColor and emissive only — those
 * are the two slots a graphic is ever visible through; a normal or ORM map is
 * data and `isArtworkTextureByName` rejects it anyway.
 */
function materialCarriesArtwork(material: Material): boolean {
  for (const texture of [material.getBaseColorTexture(), material.getEmissiveTexture()]) {
    if (texture && isArtworkTextureByName(texture)) return true
  }
  return false
}
