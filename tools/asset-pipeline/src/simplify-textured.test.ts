import { Document } from '@gltf-transform/core'
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
