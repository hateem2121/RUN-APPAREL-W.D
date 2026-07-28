import { Document, type Primitive, type Transform } from '@gltf-transform/core'
import {
  VertexCountMethod,
  compactPrimitive,
  convertPrimitiveToTriangles,
  createTransform,
  getPrimitiveVertexCount,
  simplifyPrimitive,
  weld,
} from '@gltf-transform/functions'

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
}

/** Result counters, returned for logging and asserted in tests. */
export interface SimplifyTexturedResult {
  /** Primitives decimated with UV/normal error in the budget. */
  attributeAware: number
  /** Primitives that fell back to position-only simplification with lockBorder. */
  fallback: number
  /** Primitives left untouched (unsupported draw mode, or no indices). */
  skipped: number
}

const TRIANGLES = 4
const TRIANGLE_STRIP = 5
const TRIANGLE_FAN = 6

/**
 * Decimate one primitive using UV (and normal) error. Returns false when this
 * primitive is not a candidate, so the caller can fall back.
 */
function trySimplifyTexturedPrimitive(
  document: Document,
  prim: Primitive,
  options: SimplifyTexturedOptions,
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
  const uv = prim.getAttribute('TEXCOORD_0')
  const normal = prim.getAttribute('NORMAL')
  const srcIndices = prim.getIndices()
  if (!position || !uv || !srcIndices) return false

  const positionArray = position.getArray()
  const uvArray = uv.getArray()
  // Quantized (normalized integer) attributes would need dequantizing first, and
  // the helper for that is not exported. Hand those to the library instead.
  if (!(positionArray instanceof Float32Array) || !(uvArray instanceof Float32Array)) return false

  const vertexCount = position.getCount()
  if (uv.getCount() !== vertexCount) return false

  const normalArray = normal?.getArray()
  const useNormal =
    options.normalWeight > 0 &&
    normalArray instanceof Float32Array &&
    normal?.getCount() === vertexCount

  // meshoptimizer takes one interleaved attribute buffer plus a per-component
  // weight list: [u, v] or [u, v, nx, ny, nz].
  const stride = useNormal ? 5 : 2
  const attributes = new Float32Array(vertexCount * stride)
  for (let i = 0; i < vertexCount; i++) {
    const dst = i * stride
    attributes[dst] = uvArray[i * 2] as number
    attributes[dst + 1] = uvArray[i * 2 + 1] as number
    if (useNormal) {
      const src = i * 3
      attributes[dst + 2] = (normalArray as Float32Array)[src] as number
      attributes[dst + 3] = (normalArray as Float32Array)[src + 1] as number
      attributes[dst + 4] = (normalArray as Float32Array)[src + 2] as number
    }
  }
  const weights = useNormal
    ? [options.uvWeight, options.uvWeight, options.normalWeight, options.normalWeight, options.normalWeight]
    : [options.uvWeight, options.uvWeight]

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
    document
      .getLogger()
      .debug(
        `simplifyTextured: ${result.attributeAware} primitives with UV error, ` +
          `${result.fallback} fallback, ${result.skipped} skipped.`,
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
  const result: SimplifyTexturedResult = { attributeAware: 0, fallback: 0, skipped: 0 }

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mode = prim.getMode()
      if (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN) {
        result.skipped++
        continue
      }
      if (trySimplifyTexturedPrimitive(document, prim, options)) {
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

  return result
}
