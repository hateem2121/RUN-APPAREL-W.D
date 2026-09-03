import { Document } from '@gltf-transform/core'
import { quantize } from '@gltf-transform/functions'
import { describe, expect, it } from 'vitest'
import { MIN_GAP_STEPS, describePrecision, positionGrid } from './precision'

/**
 * The grid is read from a file the real quantizer produced, not from arithmetic about
 * one (fix plan Rank 13, audit GEO-05): a 1.6 m mesh at 14 bits must read ~0.1 mm, an
 * unquantized file must read as having no grid, and the warning must fire exactly when
 * the closest print sits under two steps from its cloth.
 */
async function box(extent: number, quantized: boolean): Promise<Document> {
  const document = new Document()
  const buffer = document.createBuffer()
  const h = extent / 2
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([-h, -h, -h, h, -h, -h, h, h, -h, -h, h, h]))
    .setBuffer(buffer)
  const prim = document.createPrimitive().setAttribute('POSITION', position)
  document
    .createScene('s')
    .addChild(document.createNode('n').setMesh(document.createMesh('m').addPrimitive(prim)))
  if (quantized) await document.transform(quantize({ pattern: /^POSITION$/, quantizePosition: 14 }))
  return document
}

describe('positionGrid', () => {
  it('reads ~0.1 mm for a 1.6 m mesh quantized at 14 bits', async () => {
    const grid = positionGrid(await box(1.6, true))
    expect(grid.quantizedMeshes).toBe(1)
    // 0.8 m half-extent over 8191 steps: 0.0977 mm.
    expect(grid.gridMm).toBeGreaterThan(0.09)
    expect(grid.gridMm).toBeLessThan(0.11)
  })

  it('scales with the garment: a 0.4 m mesh is four times finer', async () => {
    const big = positionGrid(await box(1.6, true)).gridMm
    const small = positionGrid(await box(0.4, true)).gridMm
    expect(big / small).toBeCloseTo(4, 1)
  })

  it('reports no grid for a file left as floats', async () => {
    expect(positionGrid(await box(1.6, false))).toEqual({ gridMm: 0, quantizedMeshes: 0 })
  })
})

describe('describePrecision', () => {
  const grid = { gridMm: 0.05, quantizedMeshes: 3 }
  it('says nothing without a quantized mesh', () => {
    expect(describePrecision({ gridMm: 0, quantizedMeshes: 0 }, 0.2)).toBeNull()
  })
  it('states the grid and the closest gap in steps, and warns under two steps', () => {
    expect(describePrecision(grid, 0.2)).toBe(
      "Position grid: 0.050 mm per step (14-bit over the garment's size); the closest print sits 0.200 mm in front of its cloth — 4.0 grid steps.",
    )
    expect(describePrecision(grid, 0.06)).toMatch(/1\.2 grid steps\. ⚠️ Under two steps/)
    expect(describePrecision(grid, null)).toMatch(/no print gap was measured/)
    expect(MIN_GAP_STEPS).toBe(2)
  })
})
