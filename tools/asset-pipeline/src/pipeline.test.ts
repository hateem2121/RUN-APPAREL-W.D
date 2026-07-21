import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIO } from './io'
import { mergeVariants, parseMergeArgs } from './merge-variants'
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

describe('parseMergeArgs (CLI contract)', () => {
  it('parses --out, --draco and <file>=<VARIANT-ID> tokens', () => {
    const parsed = parseMergeArgs([
      '--out',
      'output/n001.glb',
      '--draco',
      'raw/navy.glb=N001-NAVY',
      'raw/black.glb=N001-BLACK',
    ])
    expect(parsed.out).toBe('output/n001.glb')
    expect(parsed.draco).toBe(true)
    expect(parsed.inputs).toEqual([
      { file: 'raw/navy.glb', variantName: 'N001-NAVY' },
      { file: 'raw/black.glb', variantName: 'N001-BLACK' },
    ])
  })
  it('splits on the LAST "=" so a path may itself contain "="', () => {
    const parsed = parseMergeArgs(['weird=dir/navy.glb=N001-NAVY'])
    expect(parsed.inputs).toEqual([{ file: 'weird=dir/navy.glb', variantName: 'N001-NAVY' }])
  })
  it('defaults draco off and out null', () => {
    const parsed = parseMergeArgs(['a.glb=N001-A', 'b.glb=N001-B'])
    expect(parsed.draco).toBe(false)
    expect(parsed.out).toBeNull()
  })
  it('throws on a token missing "="', () => {
    expect(() => parseMergeArgs(['--out', 'x.glb', 'no-equals-here.glb'])).toThrow(
      /Expected <file\.glb>=<VARIANT-ID>/,
    )
  })
})

describe('mergeVariants — Draco', () => {
  it('applies Draco compression when requested and stays parseable with variants intact', async () => {
    const inputs = PLACEHOLDER_COLOURWAYS.map((c) => ({
      file: join(dir, 'placeholders', `n001-${c.slug}.glb`),
      variantName: c.variantId,
    }))
    const out = join(dir, 'n001-draco.glb')
    const result = await mergeVariants(inputs, out, { draco: true })
    expect(result.variants).toEqual(['N001-NAVY', 'N001-BLACK', 'N001-CRIMSON'])
    // A Draco-encoded GLB must still round-trip through the IO with its
    // KHR_materials_variants bindings preserved.
    const report = await inspectGlb(out)
    expect(report.variants).toEqual(['N001-BLACK', 'N001-CRIMSON', 'N001-NAVY'])
    expect(report.primitiveCount).toBe(4)
  })
})

describe('mergeVariants — primitive with no material', () => {
  it('skips the variant mapping instead of binding a spec-invalid null material', async () => {
    const io = await createIO()
    // Two primitives; `mats` marks whether each primitive carries a material.
    const makeDoc = (mats: boolean[]): Document => {
      const doc = new Document()
      doc.createBuffer()
      const mesh = doc.createMesh('m')
      mats.forEach((hasMat, idx) => {
        const position = doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
          .setBuffer(doc.getRoot().listBuffers()[0]!)
        let prim = doc.createPrimitive().setAttribute('POSITION', position)
        if (hasMat) {
          prim = prim.setMaterial(doc.createMaterial(`m${idx}`).setBaseColorFactor([1, 0, 0, 1]))
        }
        mesh.addPrimitive(prim)
      })
      doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh))
      return doc
    }
    const baseFile = join(dir, 'nm-base.glb')
    const otherFile = join(dir, 'nm-other.glb')
    await io.write(baseFile, makeDoc([true, true]))
    await io.write(otherFile, makeDoc([true, false])) // primitive #1 has no material here

    const out = join(dir, 'nm-merged.glb')
    await mergeVariants(
      [
        { file: baseFile, variantName: 'N001-BASE' },
        { file: otherFile, variantName: 'N001-NOMAT' },
      ],
      out,
    )

    // Both variants exist (the second is still bound where it has a material)…
    const report = await inspectGlb(out)
    expect(report.variants).toEqual(['N001-BASE', 'N001-NOMAT'])
    // …and no mapping was written with a null material (which would be spec-invalid).
    const reread = await io.read(out)
    for (const prim of reread.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
      const ml = prim.getExtension<MappingList>('KHR_materials_variants')
      if (!ml) continue
      for (const mapping of ml.listMappings()) {
        expect(mapping.getMaterial()).not.toBeNull()
      }
    }
  })
})
