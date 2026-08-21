import { Document } from '@gltf-transform/core'
import { MeshoptSimplifier } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
import { type AttributeSimplifier, runSimplifyTextured } from './simplify-textured'
import { DEFAULT_STITCH_PATTERN, type TopstitchResult, reduceTopstitch } from './topstitch'

/**
 * A welded, UV-mapped grid, given a NAME so the stitch pattern can select it.
 *
 * Non-linear UVs for the same reason simplify-textured.test.ts uses them: a
 * linearly-mapped plane decimates to the same UVs whatever the weights, so a
 * linear fixture cannot show the difference between "reduced" and "left alone".
 */
function buildNamedMesh(document: Document, name: string, n = 33) {
  const positions = new Float32Array(n * n * 3)
  const uvs = new Float32Array(n * n * 2)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      positions[i * 3] = x / (n - 1)
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = y / (n - 1)
      uvs[i * 2] = (x / (n - 1)) ** 2
      uvs[i * 2 + 1] = 0.5 * (1 - Math.cos(Math.PI * (y / (n - 1))))
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
    .setAttribute(
      'TEXCOORD_0',
      document.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer),
    )
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
  const mesh = document.createMesh().setName(name).addPrimitive(prim)
  document.createScene().addChild(document.createNode().setMesh(mesh))
  return prim
}

const triangles = (prim: ReturnType<typeof buildNamedMesh>) =>
  (prim.getIndices()?.getCount() ?? 0) / 3

const simplifier = MeshoptSimplifier as unknown as AttributeSimplifier

async function runStitch(document: Document, ratio = 0.25, error = 0.0005) {
  let result: TopstitchResult | undefined
  await document.transform(
    reduceTopstitch({
      simplifier,
      ratio,
      error,
      onResult: (r) => {
        result = r
      },
    }),
  )
  return result as TopstitchResult
}

beforeAll(async () => {
  await MeshoptSimplifier.ready
})

describe('DEFAULT_STITCH_PATTERN', () => {
  it('matches the names CLO gives stitch meshes, case-insensitively', () => {
    expect(DEFAULT_STITCH_PATTERN.test('Topstitch_5089420')).toBe(true)
    expect(DEFAULT_STITCH_PATTERN.test('topstitch_1')).toBe(true)
  })

  it('does NOT match the garment mesh', () => {
    // The whole feature rests on this: `Cloth_mesh` carried all 116 artwork
    // materials on the real export, and every print lives on it.
    expect(DEFAULT_STITCH_PATTERN.test('Cloth_mesh')).toBe(false)
    // Anchored at the start, so a garment that merely mentions stitching is safe.
    expect(DEFAULT_STITCH_PATTERN.test('Panel_with_Topstitch_detail')).toBe(false)
  })
})

describe('reduceTopstitch', () => {
  it('decimates stitch meshes and leaves the garment mesh untouched', async () => {
    const document = new Document()
    const stitch = buildNamedMesh(document, 'Topstitch_5089420')
    const garment = buildNamedMesh(document, 'Cloth_mesh')
    const stitchBefore = triangles(stitch)
    const garmentBefore = triangles(garment)

    const result = await runStitch(document)

    expect(triangles(stitch)).toBeLessThan(stitchBefore)
    // The point of the whole module. Not "roughly the same" — identical.
    expect(triangles(garment)).toBe(garmentBefore)
    expect(result.meshes).toBe(1)
    expect(result.garmentTriangles).toBe(garmentBefore)
    expect(result.trianglesBefore).toBe(stitchBefore)
    expect(result.trianglesAfter).toBe(triangles(stitch))
  })

  it('reports a stitch/garment split that matches the document', async () => {
    const document = new Document()
    buildNamedMesh(document, 'Topstitch_a')
    buildNamedMesh(document, 'Topstitch_b')
    buildNamedMesh(document, 'Cloth_mesh')

    const result = await runStitch(document)

    expect(result.meshes).toBe(2)
    expect(result.primitives).toBe(2)
    expect(result.trianglesAfter).toBeLessThan(result.trianglesBefore)
  })

  it('a TIGHT error budget overrides the ratio rather than damaging the cord', async () => {
    // Measured on the real export: asked to keep 3%, it kept 3.99% and stopped.
    // That self-limiting behaviour is why --stitch cannot be pushed into fraying
    // the stitching by asking for a lower ratio, and it must not regress.
    const document = new Document()
    const stitch = buildNamedMesh(document, 'Topstitch_x')
    const before = triangles(stitch)

    await runStitch(document, 0.01, 0.000001)

    expect(triangles(stitch)).toBeGreaterThan(before * 0.01)
  })

  it('a LOOSE budget is what actually cuts deeper — the error is the dial, not the ratio', async () => {
    const tight = new Document()
    const tightPrim = buildNamedMesh(tight, 'Topstitch_x')
    await runStitch(tight, 0.25, 0.000001)

    const loose = new Document()
    const loosePrim = buildNamedMesh(loose, 'Topstitch_x')
    await runStitch(loose, 0.25, 0.05)

    expect(triangles(loosePrim)).toBeLessThan(triangles(tightPrim))
  })
})

describe('simplifyTextured skipMeshes', () => {
  it('leaves stitch meshes alone so they are never decimated twice', () => {
    // The 2026-08-21 regression: the stitch pass took thread to 777k and this
    // pass then took it to 445k, fraying the cord into spikes. With skipMeshes
    // set, passing both --stitch and --simplify is safe.
    const document = new Document()
    const stitch = buildNamedMesh(document, 'Topstitch_5089420')
    const garment = buildNamedMesh(document, 'Cloth_mesh')
    const stitchBefore = triangles(stitch)
    const garmentBefore = triangles(garment)

    const result = runSimplifyTextured(document, {
      simplifier,
      ratio: 0.25,
      error: 0.001,
      uvWeight: 1,
      normalWeight: 0.5,
      skipMeshes: DEFAULT_STITCH_PATTERN,
    })

    expect(triangles(stitch)).toBe(stitchBefore)
    expect(triangles(garment)).toBeLessThan(garmentBefore)
    // Counted as owned-elsewhere, NOT as `skipped` -- that field means "this pass
    // could not handle it" (unsupported draw mode / no indices), and conflating
    // the two would report draw-mode problems that do not exist.
    expect(result.ownedElsewhere).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('NEGATIVE CONTROL: without skipMeshes the same pass does decimate stitch meshes', () => {
    // Without this control the test above would pass even if skipMeshes did
    // nothing and the fixture simply refused to decimate.
    const document = new Document()
    const stitch = buildNamedMesh(document, 'Topstitch_5089420')
    const before = triangles(stitch)

    runSimplifyTextured(document, {
      simplifier,
      ratio: 0.25,
      error: 0.001,
      uvWeight: 1,
      normalWeight: 0.5,
    })

    expect(triangles(stitch)).toBeLessThan(before)
  })
})
