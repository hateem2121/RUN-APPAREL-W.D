import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document } from '@gltf-transform/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIO } from './io'
import { mergeVariants } from './merge-variants'
import {
  PLACEHOLDER_COLOURWAYS,
  buildPlaceholderTee,
  generatePlaceholders,
} from './placeholders'
import { checkVariants, inspectGlb } from './validate'

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'run-pipeline-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('placeholder generation', () => {
  it('writes one GLB and two posters per colourway', async () => {
    const out = await generatePlaceholders(join(dir, 'placeholders'))
    expect(out.glbFiles).toHaveLength(3)
    expect(out.posterFiles).toHaveLength(6)
    const report = await inspectGlb(out.glbFiles[0]!)
    expect(report.primitiveCount).toBe(4)
    expect(report.materialCount).toBe(2)
    expect(report.variants).toEqual([]) // raw exports carry no variants — merging binds them
  })
})

describe('mergeVariants', () => {
  it('binds every colourway as a KHR_materials_variants entry named by variantId', async () => {
    const inputs = PLACEHOLDER_COLOURWAYS.map((c) => ({
      file: join(dir, 'placeholders', `n001-${c.slug}.glb`),
      variantName: c.variantId,
    }))
    const merged = join(dir, 'n001.glb')
    const result = await mergeVariants(inputs, merged)

    expect(result.variants).toEqual(['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON'])

    const report = await inspectGlb(merged)
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY']) // sorted
    expect(report.primitiveCount).toBe(4)
    // 2 materials per colourway, colours differ so dedup keeps all 6
    expect(report.materialCount).toBe(6)

    const check = checkVariants(report, PLACEHOLDER_COLOURWAYS.map((c) => c.variantId))
    expect(check).toEqual({ ok: true, missing: [], extra: [] })
  })

  it('detects a missing variant against the CMS list', async () => {
    const report = await inspectGlb(join(dir, 'n001.glb'))
    const check = checkVariants(report, ['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON', 'N001-SAGE'])
    expect(check.ok).toBe(false)
    expect(check.missing).toEqual(['N001-SAGE'])
  })

  it('refuses to merge GLBs with different geometry', async () => {
    const io = await createIO()
    // A single-box document — different primitive count than the tee.
    const box = new Document()
    box.createBuffer()
    const material = box.createMaterial('m').setBaseColorFactor([1, 0, 0, 1])
    const position = box
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(box.getRoot().listBuffers()[0]!)
    const prim = box.createPrimitive().setAttribute('POSITION', position).setMaterial(material)
    box.createScene('s').addChild(box.createNode('n').setMesh(box.createMesh('m').addPrimitive(prim)))
    const boxFile = join(dir, 'box.glb')
    await io.write(boxFile, box)

    await expect(
      mergeVariants(
        [
          { file: join(dir, 'placeholders', 'n001-navy.glb'), variantName: 'N001-NAVY' },
          { file: boxFile, variantName: 'N001-BOX' },
        ],
        join(dir, 'broken.glb'),
      ),
    ).rejects.toThrow(/do not share the same geometry/)
  })

  it('rejects fewer than two inputs and duplicate variant names', async () => {
    const navy = join(dir, 'placeholders', 'n001-navy.glb')
    await expect(mergeVariants([{ file: navy, variantName: 'N001-NAVY' }], join(dir, 'x.glb'))).rejects.toThrow(
      /at least two/,
    )
    await expect(
      mergeVariants(
        [
          { file: navy, variantName: 'N001-NAVY' },
          { file: navy, variantName: 'N001-NAVY' },
        ],
        join(dir, 'x.glb'),
      ),
    ).rejects.toThrow(/Duplicate/)
  })

  it('writes a GLB a fresh reader can parse (round-trip sanity)', async () => {
    const io = await createIO()
    const document = await io.read(join(dir, 'n001.glb'))
    expect(document.getRoot().listScenes()).toHaveLength(1)
  })

  it('rejects invalid file paths cleanly', async () => {
    await expect(
      mergeVariants(
        [
          { file: join(dir, 'missing-a.glb'), variantName: 'N001-A' },
          { file: join(dir, 'missing-b.glb'), variantName: 'N001-B' },
        ],
        join(dir, 'x.glb'),
      ),
    ).rejects.toThrow()
  })
})

describe('placeholder tee document', () => {
  it('keeps primitive order stable across colourways', () => {
    for (const colourway of PLACEHOLDER_COLOURWAYS) {
      const tee = buildPlaceholderTee(colourway)
      const prims = tee.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
      expect(prims).toHaveLength(4)
      const names = prims.map((p) => p.getMaterial()?.getName())
      expect(names).toEqual([
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-BODY`,
        `${colourway.variantId}-TRIM`,
      ])
    }
  })
})
